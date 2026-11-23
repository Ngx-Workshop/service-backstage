# Development — service-backstage

Source audit: `46d5849` on 2026-11-22. Use `package-lock.json` and `npm ci`; inspect the
Dockerfile and CI for the supported Node runtime. Do not upgrade NestJS/Node as
an incidental maintenance change.

## Existing npm scripts

| Script                        | Command                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build`                       | `nest build`                                                                                                                                         |
| `format`                      | `prettier --write "src/**/*.ts" "test/**/*.ts"`                                                                                                      |
| `format:check`                | `prettier --check "src/**/*.ts" "test/**/*.{ts,json}" "scripts/*.mjs" package.json .prettierrc .lintstagedrc.json .github/workflows/maintenance.yml` |
| `prepare`                     | Self-contained guarded Node installer for Husky (see package.json)                                                                                   |
| `start`                       | `nest start`                                                                                                                                         |
| `start:dev`                   | `nest start --watch`                                                                                                                                 |
| `start:debug`                 | `nest start --debug --watch`                                                                                                                         |
| `start:prod`                  | `node dist/main`                                                                                                                                     |
| `lint`                        | `eslint "{src,apps,libs,test}/**/*.ts" --fix`                                                                                                        |
| `lint:check`                  | `eslint "{src,apps,libs,test}/**/*.ts"`                                                                                                              |
| `test`                        | `jest`                                                                                                                                               |
| `test:watch`                  | `jest --watch`                                                                                                                                       |
| `test:cov`                    | `jest --coverage`                                                                                                                                    |
| `test:debug`                  | `node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand`                                               |
| `test:e2e`                    | `jest --config ./test/jest-e2e.json`                                                                                                                 |
| `test:maintenance`            | `node --test scripts/maintenance-workflow.test.mjs`                                                                                                  |
| `openapi`                     | `node dist/swagger.js`                                                                                                                               |
| `postbuild`                   | `node dist/swagger.js`                                                                                                                               |
| `contracts:backstage:gen`     | `npm --prefix ./contracts/backstage run gen`                                                                                                         |
| `contracts:backstage:build`   | `npm --prefix ./contracts/backstage run build`                                                                                                       |
| `contracts:backstage:publish` | `npm --prefix ./contracts/backstage publish --access public`                                                                                         |

`lint` fixes files; use `lint:check` for non-mutating verification.

## Staged formatting and CI

`npm ci` enables Husky 9.1.7 with lint-staged 15.5.2 in developer Git checkouts.
The pre-commit hook uses only the local binary (no network fallback) and formats
staged ts/js/mjs/cjs/json/md/yml/yaml files. Keep lint-staged's default backup and
partial-staging behavior; do not add git add or --no-stash to the hook.
The fixture suite verifies both preserved unstaged changes and blocked commits.

The manifest-only prepare lifecycle skips CI, HUSKY=0, NODE_ENV=production,
npm production/omit-dev installs and no-Git directories. Unexpected developer
installation errors fail visibly. No hook installer file needs copying before
Docker's package-only npm ci. No existing build/postbuild lifecycle was removed.

`.prettierignore` excludes contracts, openapi.json, build/coverage/node_modules,
generated Husky internals and vendored language/devicon data. CI gates the clean
source/test baseline plus introduced maintenance tooling. Historical Markdown
and other existing tooling are not blanket-reformatted; supported documents
still format when staged. Use format:check (not format) in validation.

[Maintenance CI](../.github/workflows/maintenance.yml) runs on PRs/main/manual
dispatch with Node 22.23.5, installs, formats non-mutatingly, runs unit/HTTP/hook
tests, builds and runs strict lint. It does not alter publication/deployment.
**Full lint currently fails on baseline debt (117 errors/14 warnings, down from
220/22); the strict CI lint gate will remain red until that debt is resolved.**
No rule disabling or success-shaped fallback was added.

## Runtime and verification

Inspect configuration reads in `src/`, Docker and workflow files for required
environment variables; never print or commit `.env` credentials. Use existing
local-development documentation and isolated data where available. Read
[observability.md](observability.md), existing security/deployment docs and previous
feature specs before touching runtime behavior.

On local Node 24.9.0/npm 11.6.0, 23 unit tests, 5 isolated catalog HTTP scenarios,
4 actual hook/install fixture tests, build/offline OpenAPI and format checks pass.
Jest transforms the actual ESM p-limit/yocto-queue; GitHub/cache/auth remain injected
doubles. Selected logging/test files also pass type-aware lint.

Fixture clean developer/CI/no-Git/omit-dev installs pass; test:maintenance downloads
locked packages into disposable directories and removes them. Production omission
is an install check only: the existing runtime auth client remains a devDependency,
and current Docker installs devDependencies. Docker's daemon is unavailable locally,
so neither an actual image build nor Node 22 runtime/hosted CI is claimed.
No live MongoDB/GitHub/Grafana check was performed. Do not use production writes
as tests. Exact commands and remaining owner actions:
[audit](../specs/001-code-maintenance/audit.md) / [handoff](../specs/001-code-maintenance/handoff.md).

Deployment and npm publication now follow [deployment-workflows](deployment-workflows.md).
