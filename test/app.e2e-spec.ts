import { Test } from '@nestjs/testing';
import {
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { RemoteAuthGuard } from '@tmdjr/ngx-auth-client';
import type { Server } from 'node:http';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Callable CommonJS Supertest.
import request = require('supertest');
import { BackstageCatalogController } from '../src/backstage-catalog/backstage-catalog.controller';
import { BackstageCatalogService } from '../src/backstage-catalog/backstage-catalog.service';
import { ObservabilityModule } from '../src/observability/observability.module';

describe('Catalog HTTP contracts (isolated auth/use-case doubles)', () => {
  let app: INestApplication<Server>;
  let allowed = true;
  const service = {
    listServices: jest.fn().mockResolvedValue([{ repoName: 'demo' }]),
    getService: jest.fn(),
    getDocBlob: jest.fn().mockResolvedValue({ content: '# private-readme' }),
    sync: jest
      .fn()
      .mockResolvedValue({ total: 0, succeeded: 0, failed: 0, durationMs: 0 }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ObservabilityModule],
      controllers: [BackstageCatalogController],
      providers: [{ provide: BackstageCatalogService, useValue: service }],
    })
      .overrideGuard(RemoteAuthGuard)
      .useValue({ canActivate: () => allowed })
      .compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    );
    await app.init();
  });

  beforeEach(() => {
    allowed = true;
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('preserves list response and query boolean conversion', async () => {
    await request(app.getHttpServer())
      .get('/services?refresh=true')
      .expect(200)
      .expect([{ repoName: 'demo' }]);
    expect(service.listServices).toHaveBeenCalledWith({ refresh: true });
  });

  it('rejects invalid and unknown body fields before delegation', async () => {
    for (const body of [
      { repos: [1] },
      { force: 'true' },
      { unexpected: true },
    ]) {
      await request(app.getHttpServer()).post('/sync').send(body).expect(400);
    }
    expect(service.sync).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/sync')
      .send({ repos: [] })
      .expect(201);
  });

  it('keeps all business routes guarded while health remains anonymous', async () => {
    allowed = false;
    for (const path of [
      '/services',
      '/services/demo',
      '/services/demo/readme',
      '/services/demo/openapi',
      '/services/demo/runbook',
      '/services/demo/metadata',
    ]) {
      await request(app.getHttpServer()).get(path).expect(403);
    }
    await request(app.getHttpServer()).post('/sync').send({}).expect(403);
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).head('/health').expect(200);
    expect(service.listServices).not.toHaveBeenCalled();
    expect(service.sync).not.toHaveBeenCalled();
  });

  it('preserves raw document content, media types and literal refresh semantics', async () => {
    for (const [route, field, media] of [
      ['readme', 'readme', 'text/markdown'],
      ['openapi', 'openapi', 'application/yaml'],
      ['runbook', 'runbook', 'text/markdown'],
      ['metadata', 'serviceMetadata', 'application/yaml'],
    ]) {
      const response = await request(app.getHttpServer())
        .get(`/services/demo/${route}?refresh=TRUE`)
        .expect(200);
      expect(response.text).toBe('# private-readme');
      expect(response.headers['content-type']).toContain(media);
      expect(service.getDocBlob).toHaveBeenLastCalledWith('demo', field, false);
    }
  });

  it('preserves not-found and upstream failure HTTP status', async () => {
    service.getService.mockRejectedValueOnce(new NotFoundException('missing'));
    await request(app.getHttpServer()).get('/services/missing').expect(404);
    service.getService.mockRejectedValueOnce(
      new Error('private-upstream-error')
    );
    await request(app.getHttpServer()).get('/services/demo').expect(500);
  });
});
