import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { NgxAuthClientModule, RemoteAuthGuard } from '@tmdjr/ngx-auth-client';
import { BackstageCatalogController } from './backstage-catalog.controller';
import { BackstageCatalogService } from './backstage-catalog.service';
import { githubClientProvider } from './github-client.provider';
import {
  BackstageRepoCache,
  BackstageRepoCacheSchema,
} from './schemas/backstage-repo-cache.schema';

const SCHEMA_IMPORTS =
  process.env.GENERATE_OPENAPI === 'true'
    ? []
    : [
        MongooseModule.forFeature([
          { name: BackstageRepoCache.name, schema: BackstageRepoCacheSchema },
        ]),
      ];

const FAKE_PROVIDERS =
  process.env.GENERATE_OPENAPI === 'true'
    ? [
        {
          provide: getModelToken(BackstageRepoCache.name),
          useValue: {
            find: () => ({ exec: async () => [] }),
            findOne: () => ({ exec: async () => null }),
            findOneAndUpdate: () => ({ exec: async () => null }),
          },
        },
        { provide: RemoteAuthGuard, useValue: { canActivate: () => true } },
      ]
    : [];

@Module({
  imports: [ConfigModule, NgxAuthClientModule, ...SCHEMA_IMPORTS],
  controllers: [BackstageCatalogController],
  providers: [BackstageCatalogService, ...FAKE_PROVIDERS, githubClientProvider],
})
export class BackstageCatalogModule {}
