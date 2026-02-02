import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as yaml from 'js-yaml';
import { Model } from 'mongoose';
import { Octokit } from 'octokit';
import pLimit from 'p-limit';
import {
  ListServicesQueryDto,
  ServiceDetailQueryDto,
} from './dto/list-services-query.dto';
import { ServiceDetailDto, ServiceSummaryDto } from './dto/service-summary.dto';
import { SyncRequestDto, SyncResponseDto } from './dto/sync.dto';
import {
  BackstageRepoCache,
  BackstageRepoCacheDocument,
  DocBlob,
  DocFormat,
} from './schemas/backstage-repo-cache.schema';

export const GITHUB_CLIENT_TOKEN = 'GITHUB_CLIENT_TOKEN';

const OPENAPI_PATHS = [
  'docs/openapi.yaml',
  'docs/openapi.yml',
  'docs/openapi.json',
  'openapi.yaml',
  'openapi.yml',
  'openapi.json',
];

const RUNBOOK_PATHS = ['docs/runbook.md', 'runbook.md'];
const METADATA_PATHS = [
  'docs/service.yaml',
  'service.yaml',
  'docs/service.json',
  'service.json',
];

type DocField = 'readme' | 'openapi' | 'runbook' | 'serviceMetadata';

@Injectable()
export class BackstageCatalogService {
  private readonly logger = new Logger(BackstageCatalogService.name);
  private readonly org: string;
  private readonly concurrency: number;

  constructor(
    @InjectModel(BackstageRepoCache.name)
    private readonly repoModel: Model<BackstageRepoCacheDocument>,
    private readonly config: ConfigService,
    @Inject(GITHUB_CLIENT_TOKEN) private readonly github: Octokit
  ) {
    this.org = this.config.get<string>('GITHUB_ORG') || 'Ngx-Workshop';
    const parsed = Number(
      this.config.get<string>('BACKSTAGE_SYNC_CONCURRENCY')
    );
    this.concurrency = Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
  }

  async listServices(
    query: ListServicesQueryDto
  ): Promise<ServiceSummaryDto[]> {
    const includeSet = this.buildIncludeSet(query.include);
    if (query.refresh) {
      await this.syncRepos({ force: false });
    }

    const filter = this.buildSearchFilter(query.q);
    const mongoQuery = this.repoModel.find(filter);
    if (!includeSet.size) {
      mongoQuery.select('-readme -openapi -runbook -serviceMetadata');
    }

    const repos = await mongoQuery.sort({ repoName: 1 }).exec();

    return repos.map((repo) => this.toSummaryDto(repo, includeSet));
  }

  async getService(
    repo: string,
    query: ServiceDetailQueryDto
  ): Promise<ServiceDetailDto> {
    if (query.refresh) {
      await this.syncRepo(repo, { force: false });
    }

    let doc = await this.repoModel.findOne({ repoName: repo }).exec();
    if (!doc) {
      await this.syncRepo(repo, { force: false });
      doc = await this.repoModel.findOne({ repoName: repo }).exec();
    }

    if (!doc) {
      throw new NotFoundException(`Repo ${repo} not found in cache`);
    }

    return this.toDetailDto(doc);
  }

  async getDocBlob(
    repo: string,
    field: DocField,
    refresh?: boolean
  ): Promise<DocBlob> {
    if (refresh) {
      await this.syncRepo(repo, { force: false });
    }
    let doc = await this.repoModel.findOne({ repoName: repo }).exec();
    if (!doc) {
      await this.syncRepo(repo, { force: false });
      doc = await this.repoModel.findOne({ repoName: repo }).exec();
    }
    if (!doc) {
      throw new NotFoundException(`Repo ${repo} not found in cache`);
    }

    const blob = (doc as any)[field] as DocBlob | null | undefined;
    if (!blob) {
      throw new NotFoundException(`${field} not available for ${repo}`);
    }
    return blob;
  }

  async sync(req: SyncRequestDto): Promise<SyncResponseDto> {
    return this.syncRepos({ repos: req.repos, force: req.force });
  }

  private buildIncludeSet(include?: string): Set<string> {
    if (!include) return new Set();
    return new Set(
      include
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    );
  }

  private buildSearchFilter(q?: string) {
    if (!q) return {};
    const regex = new RegExp(q, 'i');
    return {
      $or: [
        { repoName: regex },
        { description: regex },
        { topics: { $elemMatch: { $regex: regex } } },
      ],
    };
  }

  private toSummaryDto(
    doc: BackstageRepoCacheDocument,
    includeSet: Set<string>
  ): ServiceSummaryDto {
    const obj = (doc as any).toObject ? (doc as any).toObject() : (doc as any);
    return {
      repoName: obj.repoName,
      description: obj.description,
      topics: obj.topics || [],
      defaultBranch: obj.defaultBranch,
      htmlUrl: obj.htmlUrl,
      lastSyncAt: obj.lastSyncAt?.toISOString(),
      syncStatus: obj.syncStatus,
      syncError: obj.syncError,
      readme: includeSet.has('readme')
        ? this.toDocBlobDto(obj.readme)
        : undefined,
      openapi: includeSet.has('openapi')
        ? this.toDocBlobDto(obj.openapi)
        : undefined,
      runbook: includeSet.has('runbook')
        ? this.toDocBlobDto(obj.runbook)
        : undefined,
      serviceMetadata: includeSet.has('metadata')
        ? this.toDocBlobDto(obj.serviceMetadata)
        : undefined,
    };
  }

  private toDetailDto(doc: BackstageRepoCacheDocument): ServiceDetailDto {
    const obj = (doc as any).toObject ? (doc as any).toObject() : (doc as any);
    return {
      repoName: obj.repoName,
      description: obj.description,
      topics: obj.topics || [],
      defaultBranch: obj.defaultBranch,
      htmlUrl: obj.htmlUrl,
      lastSyncAt: obj.lastSyncAt?.toISOString(),
      syncStatus: obj.syncStatus,
      syncError: obj.syncError,
      readme: this.toDocBlobDto(obj.readme),
      openapi: this.toDocBlobDto(obj.openapi),
      runbook: this.toDocBlobDto(obj.runbook),
      serviceMetadata: this.toDocBlobDto(obj.serviceMetadata),
    };
  }

  private toDocBlobDto(blob?: DocBlob | null) {
    if (!blob) return blob as null;
    return {
      ...blob,
      fetchedAt: blob.fetchedAt ? blob.fetchedAt.toISOString() : undefined,
    };
  }

  private async syncRepos(options: {
    repos?: string[];
    force?: boolean;
  }): Promise<SyncResponseDto> {
    const start = Date.now();
    const repoNames = options.repos ?? (await this.discoverRepos());
    const limit = pLimit(this.concurrency);

    let succeeded = 0;
    const failures: string[] = [];

    const tasks = repoNames.map((repo) =>
      limit(async () => {
        try {
          await this.syncRepo(repo, { force: options.force });
          succeeded += 1;
        } catch (err) {
          if (this.isRateLimitError(err)) {
            failures.push(`${repo}: rate limited`);
            throw err;
          }
          failures.push(`${repo}: ${err?.message ?? 'unknown error'}`);
        }
      })
    );

    try {
      await Promise.all(tasks);
    } catch (err) {
      this.logger.warn('Sync stopped early due to rate limit');
    }

    const total = repoNames.length;
    return {
      total,
      succeeded,
      failed: failures.length,
      durationMs: Date.now() - start,
      failures: failures.length ? failures : undefined,
    };
  }

  private async discoverRepos(): Promise<string[]> {
    try {
      const repos = await this.github.paginate('GET /orgs/{org}/repos', {
        org: this.org,
        per_page: 100,
      });
      return repos.map((r: any) => r.name).filter(Boolean);
    } catch (err) {
      this.logger.error(`Failed to list repos for org ${this.org}: ${err}`);
      throw err;
    }
  }

  private async syncRepo(repoName: string, options: { force?: boolean }) {
    try {
      const repo = await this.github.rest.repos.get({
        owner: this.org,
        repo: repoName,
        mediaType: { previews: ['mercy'] },
      });

      const existing = await this.repoModel.findOne({ repoName }).exec();

      const readme = await this.fetchReadme(
        repoName,
        existing?.readme,
        options
      );
      const openapi = await this.fetchFirstAvailable(
        repoName,
        OPENAPI_PATHS,
        existing?.openapi,
        options,
        true
      );
      const runbook = await this.fetchFirstAvailable(
        repoName,
        RUNBOOK_PATHS,
        existing?.runbook,
        options
      );
      const serviceMetadata = await this.fetchFirstAvailable(
        repoName,
        METADATA_PATHS,
        existing?.serviceMetadata,
        options
      );

      const update: Partial<BackstageRepoCache> = {
        repoName,
        description: repo.data.description ?? undefined,
        topics: repo.data.topics ?? [],
        defaultBranch: repo.data.default_branch,
        htmlUrl: repo.data.html_url,
        lastSyncAt: new Date(),
        readme,
        openapi,
        runbook,
        serviceMetadata,
        syncStatus: 'ok',
        syncError: undefined,
      };

      await this.repoModel
        .findOneAndUpdate({ repoName }, update, {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        })
        .exec();
    } catch (err) {
      const rateLimited = this.isRateLimitError(err);
      const status = rateLimited ? 'rate_limited' : 'failed';
      this.logger.warn(`Sync failed for ${repoName}: ${err?.message}`);
      await this.repoModel
        .findOneAndUpdate(
          { repoName },
          {
            repoName,
            syncStatus: status as any,
            syncError: err?.message,
            lastSyncAt: new Date(),
          },
          { upsert: true }
        )
        .exec();
      if (rateLimited) {
        throw err;
      }
    }
  }

  private async fetchReadme(
    repo: string,
    existing: DocBlob | null | undefined,
    options: { force?: boolean }
  ): Promise<DocBlob | null> {
    try {
      const res = await this.github.rest.repos.getReadme({
        owner: this.org,
        repo,
      });
      const sha = res.data.sha;
      if (existing?.sha && existing.sha === sha && !options.force) {
        return existing;
      }
      const content = Buffer.from(res.data.content, 'base64').toString('utf8');
      return {
        content,
        sha,
        fetchedAt: new Date(),
        format: 'markdown',
      };
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  }

  private async fetchFirstAvailable(
    repo: string,
    paths: string[],
    existing: DocBlob | null | undefined,
    options: { force?: boolean },
    validateOpenApi = false
  ): Promise<DocBlob | null> {
    for (const path of paths) {
      try {
        const res = await this.github.rest.repos.getContent({
          owner: this.org,
          repo,
          path,
        });
        if (Array.isArray(res.data) || res.data.type !== 'file') {
          continue;
        }
        const sha = res.data.sha;
        if (existing?.sha && existing.sha === sha && !options.force) {
          return existing;
        }
        const content = Buffer.from(res.data.content, 'base64').toString(
          'utf8'
        );
        const format = this.formatFromPath(path);
        if (validateOpenApi && format) {
          if (!this.isValidOpenApi(content, format)) {
            continue;
          }
        } else if (format === 'yaml' || format === 'json') {
          if (!this.isStructuredContentValid(content, format)) {
            continue;
          }
        }
        if (!content?.trim()) {
          continue;
        }
        return {
          content,
          sha,
          fetchedAt: new Date(),
          format,
        };
      } catch (err) {
        if (err.status === 404) {
          continue;
        }
        throw err;
      }
    }
    return null;
  }

  private formatFromPath(path: string): DocFormat | undefined {
    if (path.endsWith('.yaml') || path.endsWith('.yml')) return 'yaml';
    if (path.endsWith('.json')) return 'json';
    if (path.endsWith('.md')) return 'markdown';
    return undefined;
  }

  private isValidOpenApi(content: string, format: DocFormat): boolean {
    try {
      if (format === 'json') {
        const parsed = JSON.parse(content);
        return !!parsed && !!parsed.openapi;
      }
      const parsed = yaml.load(content) as Record<string, any>;
      return !!parsed && typeof parsed === 'object' && 'openapi' in parsed;
    } catch (err) {
      this.logger.debug(`Failed to parse OpenAPI: ${err?.message}`);
      return false;
    }
  }

  private isStructuredContentValid(
    content: string,
    format?: DocFormat
  ): boolean {
    try {
      if (format === 'json') {
        JSON.parse(content);
        return true;
      }
      if (format === 'yaml') {
        yaml.load(content);
        return true;
      }
      return true;
    } catch (err) {
      this.logger.debug(`Failed to parse structured content: ${err?.message}`);
      return false;
    }
  }

  private isRateLimitError(err: any): boolean {
    if (!err) return false;
    const status = err.status ?? err?.response?.status;
    if (status === 403 || status === 429) return true;
    const message: string = err.message || '';
    return /rate limit/i.test(message);
  }
}
