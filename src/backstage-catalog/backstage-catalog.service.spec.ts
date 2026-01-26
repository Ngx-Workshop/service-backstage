import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import {
  BackstageCatalogService,
  GITHUB_CLIENT_TOKEN,
} from './backstage-catalog.service';
import { BackstageRepoCache } from './schemas/backstage-repo-cache.schema';

type RepoDoc = Record<string, any>;

function createRepoModel(initial: RepoDoc[] = []) {
  const store = new Map<string, RepoDoc>();
  initial.forEach((doc) => store.set(doc.repoName, { ...doc }));

  const matches = (doc: RepoDoc, filter: any) => {
    if (!filter || !Object.keys(filter).length) return true;
    if (filter.$or) {
      return filter.$or.some((clause: any) => matches(doc, clause));
    }
    if (filter.repoName instanceof RegExp)
      return filter.repoName.test(doc.repoName);
    if (typeof filter.repoName === 'string')
      return filter.repoName === doc.repoName;
    if (filter.description instanceof RegExp)
      return filter.description.test(doc.description || '');
    if (filter.topics?.$elemMatch instanceof RegExp)
      return (doc.topics || []).some((t: string) =>
        filter.topics.$elemMatch.test(t)
      );
    return true;
  };

  const applyProjection = (doc: RepoDoc, projection?: Record<string, any>) => {
    if (!projection) return { ...doc };
    const clone = { ...doc } as any;
    Object.entries(projection).forEach(([key, value]) => {
      if (value === 0) delete clone[key];
    });
    return clone;
  };

  return {
    store,
    find: jest.fn((filter?: any, projection?: any) => ({
      sort: () => ({
        exec: async () =>
          Array.from(store.values())
            .filter((doc) => matches(doc, filter))
            .map((doc) => applyProjection(doc, projection)),
      }),
    })),
    findOne: jest.fn((filter: any) => ({
      exec: async () => store.get(filter.repoName) || null,
    })),
    findOneAndUpdate: jest.fn((filter: any, update: any) => ({
      exec: async () => {
        const current = store.get(filter.repoName) || {
          repoName: filter.repoName,
        };
        const next = { ...current, ...update };
        store.set(filter.repoName, next);
        return next;
      },
    })),
  } as any;
}

const config = {
  get: (key: string) => {
    if (key === 'GITHUB_ORG') return 'Ngx-Workshop';
    if (key === 'BACKSTAGE_SYNC_CONCURRENCY') return '2';
    return undefined;
  },
} as unknown as ConfigService;

const baseRepo = {
  data: {
    description: 'Demo repo',
    topics: ['demo'],
    default_branch: 'main',
    html_url: 'https://example.com/demo',
  },
} as any;

function baseGithub() {
  return {
    rest: {
      repos: {
        get: jest.fn().mockResolvedValue(baseRepo),
        getReadme: jest.fn().mockRejectedValue({ status: 404 }),
        getContent: jest.fn().mockRejectedValue({ status: 404 }),
      },
    },
    paginate: jest.fn().mockResolvedValue([]),
  } as any;
}

describe('BackstageCatalogService', () => {
  it('respects OpenAPI path priority', async () => {
    const repoModel = createRepoModel();
    const github = baseGithub();
    github.rest.repos.getContent = jest.fn(async ({ path }) => {
      if (path === 'docs/openapi.yaml') throw { status: 404 };
      if (path === 'docs/openapi.yml') {
        return {
          data: {
            type: 'file',
            sha: 'sha-openapi-yml',
            content: Buffer.from('openapi: 3.0.0').toString('base64'),
          },
        };
      }
      throw { status: 404 };
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        BackstageCatalogService,
        { provide: GITHUB_CLIENT_TOKEN, useValue: github },
        { provide: ConfigService, useValue: config },
        {
          provide: getModelToken(BackstageRepoCache.name),
          useValue: repoModel,
        },
      ],
    }).compile();

    const service = moduleRef.get(BackstageCatalogService);
    await (service as any).syncRepos({ repos: ['demo'], force: false });

    const cached = repoModel.store.get('demo');
    expect(cached.openapi.sha).toBe('sha-openapi-yml');
    const paths = github.rest.repos.getContent.mock.calls.map(
      (call) => call[0].path
    );
    expect(paths[0]).toBe('docs/openapi.yaml');
    expect(paths).toContain('docs/openapi.yml');
  });

  it('keeps cached content when SHA unchanged', async () => {
    const repoModel = createRepoModel([
      {
        repoName: 'demo',
        openapi: {
          sha: 'same',
          content: 'cached',
          fetchedAt: new Date('2021-01-01'),
          format: 'yaml',
        },
      },
    ]);
    const github = baseGithub();
    github.rest.repos.getContent = jest.fn(({ path }) => ({
      data: {
        type: 'file',
        sha: 'same',
        content: Buffer.from(`new content for ${path}`).toString('base64'),
      },
    }));

    const moduleRef = await Test.createTestingModule({
      providers: [
        BackstageCatalogService,
        { provide: GITHUB_CLIENT_TOKEN, useValue: github },
        { provide: ConfigService, useValue: config },
        {
          provide: getModelToken(BackstageRepoCache.name),
          useValue: repoModel,
        },
      ],
    }).compile();

    const service = moduleRef.get(BackstageCatalogService);
    await (service as any).syncRepos({ repos: ['demo'], force: false });

    const cached = repoModel.store.get('demo');
    expect(cached.openapi.content).toBe('cached');
  });

  it('detects YAML format for service metadata', async () => {
    const repoModel = createRepoModel();
    const github = baseGithub();
    github.rest.repos.getContent = jest.fn(async ({ path }) => {
      if (path.startsWith('docs/openapi') || path.startsWith('openapi')) {
        throw { status: 404 };
      }
      if (path.endsWith('runbook.md')) throw { status: 404 };
      if (path === 'docs/service.yaml') {
        return {
          data: {
            type: 'file',
            sha: 'meta-sha',
            content: Buffer.from('name: demo').toString('base64'),
          },
        };
      }
      throw { status: 404 };
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        BackstageCatalogService,
        { provide: GITHUB_CLIENT_TOKEN, useValue: github },
        { provide: ConfigService, useValue: config },
        {
          provide: getModelToken(BackstageRepoCache.name),
          useValue: repoModel,
        },
      ],
    }).compile();

    const service = moduleRef.get(BackstageCatalogService);
    await (service as any).syncRepos({ repos: ['demo'], force: false });

    const cached = repoModel.store.get('demo');
    expect(cached.serviceMetadata.format).toBe('yaml');
  });

  it('filters list by query text', async () => {
    const repoModel = createRepoModel([
      { repoName: 'payments', description: 'Payment svc', topics: ['billing'] },
      {
        repoName: 'inventory',
        description: 'Stock mgr',
        topics: ['warehouse'],
      },
    ]);
    const github = baseGithub();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BackstageCatalogService,
        { provide: GITHUB_CLIENT_TOKEN, useValue: github },
        { provide: ConfigService, useValue: config },
        {
          provide: getModelToken(BackstageRepoCache.name),
          useValue: repoModel,
        },
      ],
    }).compile();

    const service = moduleRef.get(BackstageCatalogService);
    const results = await service.listServices({ q: 'pay' } as any);
    expect(results).toHaveLength(1);
    expect(results[0].repoName).toBe('payments');
  });
});
