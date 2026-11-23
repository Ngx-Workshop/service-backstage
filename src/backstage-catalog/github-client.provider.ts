import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Octokit } from 'octokit';
import { GITHUB_CLIENT_TOKEN } from './github.interface';

export const githubClientProvider: FactoryProvider = {
  provide: GITHUB_CLIENT_TOKEN,
  useFactory: (config: ConfigService) => {
    if (process.env.GENERATE_OPENAPI === 'true') {
      return {
        rest: { repos: {} },
        paginate: () => Promise.resolve([]),
      };
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
};
