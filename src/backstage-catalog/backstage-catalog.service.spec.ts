import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { ConsoleLogger, Logger } from '@nestjs/common';
import {
  createServiceLogger,
  httpLoggingMiddleware,
} from '../observability/observability';
import type { Request, Response } from 'express';
import {
  BackstageCatalogService,
  GITHUB_CLIENT_TOKEN,
} from './backstage-catalog.service';
import { BackstageRepoCache } from './schemas/backstage-repo-cache.schema';

type RepoDoc = Partial<BackstageRepoCache> & { repoName: string };
type RepoFilter = {
  $or?: RepoFilter[];
  repoName?: string | RegExp;
  description?: RegExp;
  topics?: { $elemMatch: { $regex: RegExp } };
};
type ContentResponse = {
  data: { type: string; sha: string; content: string };
};

const missingFile = () =>
  Object.assign(new Error('Not found'), { status: 404 });

function createRepoModel(initial: RepoDoc[] = []) {
  const store = new Map<string, RepoDoc>();
  initial.forEach((doc) => store.set(doc.repoName, { ...doc }));

  const matches = (doc: RepoDoc, filter?: RepoFilter): boolean => {
    if (!filter || !Object.keys(filter).length) return true;
    if (filter.$or) {
      return filter.$or.some((clause) => matches(doc, clause));
    }
    if (filter.repoName instanceof RegExp)
      return filter.repoName.test(doc.repoName);
    if (typeof filter.repoName === 'string')
      return filter.repoName === doc.repoName;
    if (filter.description instanceof RegExp)
      return filter.description.test(doc.description || '');
    if (filter.topics?.$elemMatch?.$regex instanceof RegExp)
      return (doc.topics || []).some((t) =>
        filter.topics!.$elemMatch.$regex.test(t)
      );
    return false;
  };

  const applyProjection = (
    doc: RepoDoc,
    projection?: Record<string, number>
  ) => {
    if (!projection) return { ...doc };
    return Object.fromEntries(
      Object.entries(doc).filter(([key]) => projection[key] !== 0)
    );
  };

  return {
    store,
    find: jest.fn(
      (filter?: RepoFilter, projection?: Record<string, number>) => ({
        select: () => ({
          sort: () => ({
            exec: () =>
              Promise.resolve(
                Array.from(store.values())
                  .filter((doc) => matches(doc, filter))
                  .map((doc) =>
                    applyProjection(doc, {
                      readme: 0,
                      openapi: 0,
                      runbook: 0,
                      serviceMetadata: 0,
                    })
                  )
              ),
          }),
        }),
        sort: () => ({
          exec: () =>
            Promise.resolve(
              Array.from(store.values())
                .filter((doc) => matches(doc, filter))
                .map((doc) => applyProjection(doc, projection))
            ),
        }),
      })
    ),
    findOne: jest.fn((filter: { repoName: string }) => ({
      exec: () => Promise.resolve(store.get(filter.repoName) || null),
    })),
    findOneAndUpdate: jest.fn(
      (filter: { repoName: string }, update: Partial<BackstageRepoCache>) => ({
        exec: () => {
          const current = store.get(filter.repoName) || {
            repoName: filter.repoName,
          };
          const next = { ...current, ...update };
          store.set(filter.repoName, next);
          return Promise.resolve(next);
        },
      })
    ),
  };
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
};

function baseGithub() {
  return {
    rest: {
      repos: {
        get: jest
          .fn<Promise<typeof baseRepo>, []>()
          .mockResolvedValue(baseRepo),
        listLanguages: jest
          .fn()
          .mockResolvedValue({ data: { TypeScript: 100 } }),
        getReadme: jest.fn().mockRejectedValue({ status: 404 }),
        getContent: jest
          .fn<Promise<ContentResponse>, [{ path: string }]>()
          .mockRejectedValue({ status: 404 }),
      },
    },
    paginate: jest.fn().mockResolvedValue([]),
  };
}

describe('BackstageCatalogService', () => {
  let logs: Record<'log' | 'warn' | 'error' | 'debug', jest.SpyInstance>;
  beforeEach(() => {
    logs = {
      log: jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined),
      warn: jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined),
      error: jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined),
      debug: jest
        .spyOn(Logger.prototype, 'debug')
        .mockImplementation(() => undefined),
    };
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it('respects OpenAPI path priority', async () => {
    const repoModel = createRepoModel();
    const github = baseGithub();
    github.rest.repos.getContent = jest.fn(
      ({ path }: { path: string }): Promise<ContentResponse> => {
        if (path === 'docs/openapi.yaml') return Promise.reject(missingFile());
        if (path === 'docs/openapi.yml') {
          return Promise.resolve({
            data: {
              type: 'file',
              sha: 'sha-openapi-yml',
              content: Buffer.from('openapi: 3.0.0').toString('base64'),
            },
          });
        }
        return Promise.reject(missingFile());
      }
    );

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
    await service.sync({ repos: ['demo'], force: false });

    const cached = repoModel.store.get('demo');
    expect(cached?.openapi?.sha).toBe('sha-openapi-yml');
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
    github.rest.repos.getContent = jest.fn(({ path }: { path: string }) =>
      Promise.resolve({
        data: {
          type: 'file',
          sha: 'same',
          content: Buffer.from(`new content for ${path}`).toString('base64'),
        },
      })
    );

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
    await service.sync({ repos: ['demo'], force: false });

    const cached = repoModel.store.get('demo');
    expect(cached?.openapi?.content).toBe('cached');
  });

  it('detects YAML format for service metadata', async () => {
    const repoModel = createRepoModel();
    const github = baseGithub();
    github.rest.repos.getContent = jest.fn(
      ({ path }: { path: string }): Promise<ContentResponse> => {
        if (path.startsWith('docs/openapi') || path.startsWith('openapi')) {
          return Promise.reject(missingFile());
        }
        if (path.endsWith('runbook.md')) return Promise.reject(missingFile());
        if (path === 'docs/service.yaml') {
          return Promise.resolve({
            data: {
              type: 'file',
              sha: 'meta-sha',
              content: Buffer.from('name: demo').toString('base64'),
            },
          });
        }
        return Promise.reject(missingFile());
      }
    );

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
    await service.sync({ repos: ['demo'], force: false });

    const cached = repoModel.store.get('demo');
    expect(cached?.serviceMetadata?.format).toBe('yaml');
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
    const results = await service.listServices({ q: 'pay' });
    expect(results).toHaveLength(1);
    expect(results[0].repoName).toBe('payments');
  });

  async function fixture(initial: RepoDoc[] = []) {
    const model = createRepoModel(initial);
    const github = baseGithub();
    const module = await Test.createTestingModule({
      providers: [
        BackstageCatalogService,
        { provide: GITHUB_CLIENT_TOKEN, useValue: github },
        { provide: ConfigService, useValue: config },
        { provide: getModelToken(BackstageRepoCache.name), useValue: model },
      ],
    }).compile();
    return { service: module.get(BackstageCatalogService), model, github };
  }

  it('omits blobs by default and returns requested blobs with ISO dates', async () => {
    const { service } = await fixture([
      {
        repoName: 'demo',
        readme: {
          content: 'private-readme',
          fetchedAt: new Date('2021-01-01'),
        },
      },
    ]);
    expect((await service.listServices({}))[0].readme).toBeUndefined();
    expect(
      (await service.listServices({ include: ' README ' }))[0].readme
    ).toEqual({
      content: 'private-readme',
      fetchedAt: '2021-01-01T00:00:00.000Z',
    });
  });

  it('retains missing document and cache not-found behavior', async () => {
    const { service, github } = await fixture([{ repoName: 'demo' }]);
    await expect(service.getDocBlob('demo', 'readme')).rejects.toThrow(
      'readme not available for demo'
    );
    github.rest.repos.get.mockRejectedValue(new Error('upstream-unavailable'));
    const missing = await fixture();
    missing.github.rest.repos.get.mockRejectedValue(
      new Error('upstream-unavailable')
    );
    // The real failed upsert creates a cache row; simulate a store that returns no row.
    missing.model.findOne.mockImplementation(() => ({
      exec: () => Promise.resolve(null),
    }));
    await expect(missing.service.getService('absent', {})).rejects.toThrow(
      'Repo absent not found in cache'
    );
  });

  it('preserves swallowed upstream errors and legacy success counters', async () => {
    const { service, model, github } = await fixture();
    github.rest.repos.get.mockRejectedValue(
      new Error('private-upstream-error')
    );
    expect(await service.sync({ repos: ['demo'] })).toEqual({
      total: 1,
      succeeded: 1,
      failed: 0,
      durationMs: expect.any(Number) as unknown,
      failures: undefined,
    });
    expect(model.store.get('demo')).toEqual(
      expect.objectContaining({
        syncStatus: 'failed',
        syncError: 'private-upstream-error',
      })
    );
  });

  it('reports a rate limit while preserving the cached rate-limited state', async () => {
    const { service, model, github } = await fixture();
    github.rest.repos.get.mockRejectedValue(
      Object.assign(new Error('rate limit'), { status: 429 })
    );
    expect(await service.sync({ repos: ['demo'] })).toEqual(
      expect.objectContaining({
        total: 1,
        succeeded: 0,
        failed: 1,
        failures: ['demo: rate limited'],
      })
    );
    expect(model.store.get('demo')?.syncStatus).toBe('rate_limited');
  });

  it('retains batch storage failure accounting and discovery rejection', async () => {
    const { service, model, github } = await fixture();
    model.findOneAndUpdate.mockImplementation(() => ({
      exec: () => Promise.reject(new Error('store-unavailable')),
    }));
    expect(await service.sync({ repos: ['demo'] })).toEqual(
      expect.objectContaining({
        failed: 1,
        failures: ['demo: store-unavailable'],
      })
    );
    github.paginate.mockRejectedValue(new Error('discovery-unavailable'));
    await expect(service.sync({})).rejects.toThrow('discovery-unavailable');
  });

  it('preserves early rate-limit return while queued work continues', async () => {
    const { service, github, model } = await fixture();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    github.rest.repos.get.mockImplementation(async () => {
      if (++calls === 1)
        throw Object.assign(new Error('rate limit'), { status: 429 });
      await gate;
      return baseRepo;
    });
    const update = model.findOneAndUpdate.getMockImplementation();
    if (!update) throw new Error('Missing fixture persistence implementation');
    let writes = 0;
    const settled = new Promise<void>((resolve) => {
      model.findOneAndUpdate.mockImplementation((filter, value) => ({
        exec: async () => {
          const result = await update(filter, value).exec();
          if (++writes === 3) resolve();
          return result;
        },
      }));
    });
    try {
      const response = await service.sync({ repos: ['a', 'b', 'c'] });
      expect(response).toEqual(
        expect.objectContaining({
          total: 3,
          succeeded: 0,
          failed: 1,
          failures: ['a: rate limited'],
        })
      );
      expect(writes).toBe(1);
      expect(logs.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'catalog_sync',
          stoppedEarly: true,
          outcome: 'rate_limited',
        })
      );
    } finally {
      release();
      await settled;
    }
    expect(model.store.get('b')?.syncStatus).toBe('ok');
    expect(model.store.get('c')?.syncStatus).toBe('ok');
  });

  it('forces replacement of unchanged SHA content only when requested', async () => {
    const { service, github, model } = await fixture([
      {
        repoName: 'demo',
        readme: { sha: 'same', content: 'cached' },
      },
    ]);
    github.rest.repos.getReadme.mockResolvedValue({
      data: {
        sha: 'same',
        content: Buffer.from('replacement').toString('base64'),
      },
    });
    await service.sync({ repos: ['demo'], force: true });
    expect(model.store.get('demo')?.readme?.content).toBe('replacement');
  });

  it('bounds sync concurrency with the actual p-limit implementation', async () => {
    const { service, github } = await fixture();
    let active = 0;
    let peak = 0;
    github.rest.repos.get.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return baseRepo;
    });
    await service.sync({ repos: ['a', 'b', 'c', 'd'] });
    expect(peak).toBe(2);
  });

  it('emits one bounded batch warning without canary names, errors or content', async () => {
    const { service, github } = await fixture();
    github.rest.repos.get.mockRejectedValue(
      Object.assign(
        new Error('private-token private-response private-readme'),
        { status: 500, response: { data: 'private-upstream-body' } }
      )
    );
    await service.sync({ repos: ['private-repo-a', 'private-repo-b'] });
    expect(logs.warn).toHaveBeenCalledTimes(1);
    expect(logs.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'catalog_sync',
        outcome: 'partial',
        total: 2,
        observedFailures: 2,
        reportedSucceeded: 2,
        reportedFailed: 0,
        runId: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
        durationMs: expect.any(Number) as unknown,
      })
    );
    expect(
      JSON.stringify([
        logs.log.mock.calls,
        logs.warn.mock.calls,
        logs.error.mock.calls,
      ])
    ).not.toContain('private-');
  });

  it('redacts discovery and document parser failures at every log level', async () => {
    const { service, github } = await fixture();
    github.paginate.mockRejectedValue(
      Object.assign(new Error('private-token'), {
        status: 'private-status',
      })
    );
    await expect(service.sync({})).rejects.toThrow('private-token');
    expect(logs.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'catalog_discovery',
        outcome: 'failed',
        upstreamStatus: undefined,
      })
    );
    github.rest.repos.getContent.mockResolvedValue({
      data: {
        type: 'file',
        sha: 'private-sha',
        content: Buffer.from('private-readme: [invalid').toString('base64'),
      },
    });
    await service.sync({ repos: ['private-repo'] });
    expect(logs.debug).toHaveBeenCalled();
    expect(
      JSON.stringify([
        logs.debug.mock.calls,
        logs.error.mock.calls,
        logs.log.mock.calls,
      ])
    ).not.toContain('private-');
  });

  it('serializes real contextual domain logs and correlates request/run IDs', async () => {
    const { service, github } = await fixture();
    logs.log.mockRestore();
    logs.warn.mockRestore();
    const write = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    Logger.overrideLogger(createServiceLogger());
    const headers: Record<string, string> = {};
    try {
      const middleware = httpLoggingMiddleware();
      await new Promise<void>((resolve, reject) => {
        middleware(
          { path: '/sync', method: 'POST' } as Request,
          {
            setHeader: (key: string, value: string) => {
              headers[key] = value;
            },
            once: () => undefined,
          } as unknown as Response,
          () => {
            service
              .sync({ repos: [] })
              .then(async () => {
                github.rest.repos.get.mockRejectedValue(
                  new Error('private-token')
                );
                await service.sync({ repos: ['private-repo'] });
                resolve();
              }, reject)
              .catch(reject);
          }
        );
      });
      const entries = write.mock.calls.map(([value]): unknown =>
        JSON.parse(String(value))
      );
      expect(entries).toEqual([
        expect.objectContaining({
          level: 'log',
          context: 'BackstageCatalogService',
          message: expect.objectContaining({
            event: 'catalog_sync',
            outcome: 'ok',
            total: 0,
            requestId: headers['X-Request-ID'],
            runId: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
          }) as unknown,
        }) as unknown,
        expect.objectContaining({
          level: 'warn',
          context: 'BackstageCatalogService',
          message: expect.objectContaining({
            event: 'catalog_sync',
            outcome: 'partial',
            total: 1,
            observedFailures: 1,
            requestId: headers['X-Request-ID'],
            runId: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
          }) as unknown,
        }) as unknown,
      ]);
      expect(JSON.stringify(entries)).not.toContain('private-');
    } finally {
      Logger.overrideLogger(new ConsoleLogger());
      write.mockRestore();
    }
  });
});
