import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { NgxAuthClientModule, RemoteAuthGuard } from '@tmdjr/ngx-auth-client';
import { Octokit } from 'octokit';
import { BackstageCatalogController } from './backstage-catalog.controller';
import {
  BackstageCatalogService,
  GITHUB_CLIENT_TOKEN,
} from './backstage-catalog.service';
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
  providers: [
    BackstageCatalogService,
    ...FAKE_PROVIDERS,
    {
      provide: GITHUB_CLIENT_TOKEN,
      useFactory: (config: ConfigService) => {
        if (process.env.GENERATE_OPENAPI === 'true') {
          return {
            rest: { repos: {} },
            paginate: async () => [],
          } as unknown as Octokit;
        }
        const token = config.get<string>('WORKSHOP_GITHUB_TOKEN');
        if (!token) {
          throw new Error(
            'WORKSHOP_GITHUB_TOKEN is required to sync backstage repos'
          );
        }
        return new Octokit({
          auth: token,
          request: { timeout: 10000 },
        });
      },
      inject: [ConfigService],
    },
  ],
})
export class BackstageCatalogModule {}
