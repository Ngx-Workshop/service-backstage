import { Test } from '@nestjs/testing';
import { RemoteAuthGuard } from '@tmdjr/ngx-auth-client';
import { BackstageCatalogController } from './backstage-catalog.controller';
import { BackstageCatalogService } from './backstage-catalog.service';

const mockService = () => ({
  listServices: jest.fn(),
  getService: jest.fn(),
  sync: jest.fn(),
  getDocBlob: jest.fn(),
});

describe('BackstageCatalogController', () => {
  it('delegates to service methods', async () => {
    const service = mockService();
    service.listServices.mockResolvedValue([{ repoName: 'demo' }]);
    service.getService.mockResolvedValue({ repoName: 'demo', readme: null });
    service.sync.mockResolvedValue({
      total: 1,
      succeeded: 1,
      failed: 0,
      durationMs: 10,
    });
    service.getDocBlob.mockResolvedValue({ content: '# README' });

    const moduleRef = await Test.createTestingModule({
      controllers: [BackstageCatalogController],
      providers: [
        { provide: BackstageCatalogService, useValue: service },
        { provide: RemoteAuthGuard, useValue: { canActivate: () => true } },
      ],
    }).compile();

    const controller = moduleRef.get(BackstageCatalogController);

    await expect(controller.list({} as any)).resolves.toEqual([
      { repoName: 'demo' },
    ]);
    await expect(controller.getOne('demo', {} as any)).resolves.toEqual({
      repoName: 'demo',
      readme: null,
    });
    await expect(controller.sync({} as any)).resolves.toEqual({
      total: 1,
      succeeded: 1,
      failed: 0,
      durationMs: 10,
    });
    await expect(controller.readme('demo', 'false')).resolves.toEqual(
      '# README'
    );
  });
});
