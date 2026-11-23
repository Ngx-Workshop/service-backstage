import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as yaml from 'js-yaml';
import { Model } from 'mongoose';
import type { Octokit } from 'octokit';
import pLimit from 'p-limit';
import { randomUUID } from 'node:crypto';
import { getRequestId } from '../observability/observability';
import {
  ListServicesQueryDto,
  ServiceDetailQueryDto,
} from './dto/list-services-query.dto';
import { ServiceDetailDto, ServiceSummaryDto } from './dto/service-summary.dto';
import { SyncRequestDto, SyncResponseDto } from './dto/sync.dto';
import { GITHUB_CLIENT_TOKEN, GithubRepository } from './github.interface';
import {
  BackstageRepoCache,
  BackstageRepoCacheDocument,
  DocBlob,
  DocFormat,
} from './schemas/backstage-repo-cache.schema';

import { programLanguageMap } from './data/program-language-map';

export { GITHUB_CLIENT_TOKEN } from './github.interface';

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

    const blob = doc[field];
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
      languages: obj.languages,
      deviconLanguages: obj.deviconLanguages,
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
      languages: obj.languages,
      deviconLanguages: obj.deviconLanguages,
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
    const runId = randomUUID();
    const repoNames = options.repos ?? (await this.discoverRepos(runId));
    const limit = pLimit(this.concurrency);

    let succeeded = 0;
    let observedFailures = 0;
    let stoppedEarly = false;
    const failures: string[] = [];

    const tasks = repoNames.map((repo) =>
      limit(async () => {
        try {
          const ok = await this.syncRepo(repo, { force: options.force, runId });
          if (!ok) observedFailures++;
          succeeded += 1;
        } catch (err) {
          observedFailures++;
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
    } catch {
      stoppedEarly = true;
    }

    const total = repoNames.length;
    const entry = {
      event: 'catalog_sync',
      outcome: stoppedEarly
        ? 'rate_limited'
        : observedFailures
          ? 'partial'
          : 'ok',
      runId,
      requestId: getRequestId(),
      total,
      observedFailures,
      reportedSucceeded: succeeded,
      reportedFailed: failures.length,
      durationMs: Date.now() - start,
      stoppedEarly,
    };
    if (observedFailures) this.logger.warn(entry);
    else this.logger.log(entry);
    return {
      total,
      succeeded,
      failed: failures.length,
      durationMs: Date.now() - start,
      failures: failures.length ? failures : undefined,
    };
  }

  private async discoverRepos(runId: string): Promise<string[]> {
    const start = Date.now();
    try {
      const repos = await this.github.paginate('GET /orgs/{org}/repos', {
        org: this.org,
        per_page: 100,
      });
      return repos.map((r: any) => r.name).filter(Boolean);
    } catch (err) {
      this.logger.error({
        event: 'catalog_discovery',
        outcome: 'failed',
        runId,
        requestId: getRequestId(),
        upstreamStatus: this.safeErrorStatus(err),
        durationMs: Date.now() - start,
      });
      throw err;
    }
  }

  private async syncRepo(
    repoName: string,
    options: { force?: boolean; runId?: string }
  ): Promise<boolean> {
    const start = Date.now();
    const runId = options.runId ?? randomUUID();
    try {
      const { data: repo } = (await this.github.rest.repos.get({
        owner: this.org,
        repo: repoName,
        mediaType: { previews: ['mercy'] },
      })) as { data: GithubRepository };

      const existing = await this.repoModel.findOne({ repoName }).exec();

      const languages = await this.fetchLanguages(repoName);

      const deviconLanguages = Object.keys(languages)
        .map((lang) => programLanguageMap[lang])
        .filter((lang) => !!lang);

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
        description: repo.description ?? undefined,
        topics: repo.topics ?? [],
        defaultBranch: repo.default_branch,
        htmlUrl: repo.html_url,
        languages,
        deviconLanguages,
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
      if (!options.runId) {
        this.logger.log({
          event: 'catalog_repo_sync',
          outcome: 'ok',
          requestId: getRequestId(),
          runId,
          durationMs: Date.now() - start,
        });
      }
      return true;
    } catch (err) {
      const rateLimited = this.isRateLimitError(err);
      const status = rateLimited ? 'rate_limited' : 'failed';
      if (!options.runId) {
        this.logger.warn({
          event: 'catalog_repo_sync',
          outcome: status,
          requestId: getRequestId(),
          runId,
          upstreamStatus: this.safeErrorStatus(err),
          durationMs: Date.now() - start,
        });
      }
      await this.repoModel
        .findOneAndUpdate(
          { repoName },
          {
            repoName,
            syncStatus: status,
            syncError: err?.message,
            lastSyncAt: new Date(),
          },
          { upsert: true }
        )
        .exec();
      if (rateLimited) {
        throw err;
      }
      return false;
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

  private async fetchLanguages(repo: string): Promise<Record<string, number>> {
    try {
      const res = await this.github.rest.repos.listLanguages({
        owner: this.org,
        repo,
      });
      return res.data || {};
    } catch (err) {
      if (err.status === 404) return {};
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
    } catch {
      this.logger.debug({
        event: 'catalog_document_rejected',
        reason: 'invalid_openapi',
        format,
        requestId: getRequestId(),
      });
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
    } catch {
      this.logger.debug({
        event: 'catalog_document_rejected',
        reason: 'invalid_structured_content',
        format,
        requestId: getRequestId(),
      });
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

  private safeErrorStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const status = 'status' in error ? error.status : undefined;
    if (
      typeof status === 'number' &&
      Number.isInteger(status) &&
      status >= 100 &&
      status <= 599
    ) {
      return status;
    }
    return undefined;
  }
}
