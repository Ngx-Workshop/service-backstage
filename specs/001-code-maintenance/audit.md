# Code Maintenance audit

Inspected HEAD: `46d5849`, 2026-11-22. Initial worktree contains untracked
workflow/spec/context files supplied with the task; preserve them. The referenced
parent AGENTS/index do not exist; the repository-local entry points are authoritative.
No older feature folders exist in this checkout.

## T001 baseline

Local Node `v24.9.0`, npm `11.6.0`; Docker/CI target Node `22.23.5`.
Installed Prettier `3.6.2`, ESLint `9.30.0`, TypeScript `5.8.3`.

| Command                                                          | Actual result                                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `npm test -- --runInBand`                                        | HTTP observability: 5 pass; two catalog suites cannot load Octokit ESM                        |
| `npm run test:e2e -- --runInBand`                                | Cannot load Octokit ESM; stale fixture also expects removed Hello World route                 |
| `npm run build`                                                  | Pass, including offline OpenAPI generation; no tracked output change                          |
| `npx --no-install eslint "{src,apps,libs,test}/**/*.ts"`         | 220 errors, 22 warnings; unsafe legacy types/test doubles, ESM type resolution, require-await |
| `npx --no-install prettier --check "src/**/*.ts" "test/**/*.ts"` | Pass                                                                                          |

No live MongoDB/GitHub/Grafana calls are authorized as verification. Docker CLI
exists; daemon/runtime availability remains to be checked. Local unit/HTTP doubles
must not be described as live integration.

## T002 source-backed dependency map

- `AppModule` composes global ConfigModule, Mongo connection, catalog and
  observability. OpenAPI mode omits Mongo; no provider exports at the root.
- `BackstageCatalogModule` explicitly imports ConfigModule, auth-client module
  and its own Mongoose schema. Controller -> catalog service -> injected cache
  model, ConfigService and GitHub client. No exports, circular dependencies,
  forwardRef or cross-service collection access.
- `ObservabilityModule` -> TerminusModule -> health controller. Middleware is
  installed at bootstrap; currently generated HTTP IDs do not flow into async work.
- All seven catalog routes delegate to the service, with RemoteAuthGuard on each.
  Raw document endpoints adapt content/refresh/header transport semantics only.
- Catalog service owns cache reads/DTO mapping and bounded-concurrency sync.
  GitHub requests, optional-document precedence, SHA caching and cache writes
  stay behind catalog providers. Client factory currently lives in the module.
- Main installs whitelist/forbidNonWhitelisted validation (without transform).
  Query DTOs preserve current boolean conversion; regex search and unrestricted
  repository names are existing behavior, not changed by maintenance.
- Config defaults org/concurrency; client requires token and uses 10-second
  timeout. Mongo server selection is bounded at 5 seconds.

## Findings and selected scope

1. **High: unsafe domain logging** — service discovery/sync/parser logs interpolate
   repository names and raw upstream/YAML errors. Replace with bounded stable
   events, safe status/category and request/run IDs, never message/body/content.
2. **Medium: missing domain correlation** — observability middleware generates
   IDs but has no async context. Add a small AsyncLocalStorage context there;
   continue ignoring incoming IDs (no trust boundary change).
3. **Medium: module construction responsibility** — move token/client factory to
   a catalog provider file; service uses a type-only Octokit import. Do not split
   cohesive catalog use cases or alter module exports.
4. **Medium: tests unusable/incomplete** — characterize public service methods
   with corrected fixtures (missing listLanguages/select) and transform the actual
   ESM limiter in Jest. Replace obsolete e2e with isolated guarded catalog HTTP
   coverage; no live credentials/DB. Test SHA/force, missing docs, failures and
   concurrency before refactoring.
5. **Medium: no commit/CI formatting gate** — pinned compatible Husky/lint-staged,
   self-contained guarded prepare, explicit generated ignores. Existing source
   formatting is clean: gate source/test plus maintenance tooling, not all historical
   documents/vendor data. Verify with disposable Git/install fixtures.
6. **Baseline debt, not a behavior fix:** syncRepo swallows non-rate errors after
   recording failed cache state, so sync response may report success; rate limits
   resolve the batch early while queued work continues. Preserve both semantics,
   distinguish observed failures from legacy reported counters in logs.
7. **Baseline debt:** full type-aware lint fails widely. Do not disable rules or
   silently claim a clean full check; record remaining errors and gate new work
   independently if necessary. No new API/schema/auth contracts are intended.

## Compatibility and constitution

Characterize first. Retain Mongo collection/schema/indexes, DTO/decorator routes,
raw response content, auth guards, optional 404 handling, SHA precedence, existing
sync error persistence and response counters, limiter/concurrency and early return.
Do not log stored syncError or concrete names. No incoming tracing header is trusted.
All six constitution principles apply; no deviation or external-domain access is
needed. Generated contracts should remain identical; compare generated OpenAPI.

## Implementation and final evidence (T003-T010)

Before moving runtime code, corrected limiter loading/model/auth fixtures passed
17 unit tests and 5 isolated HTTP cases. No live Octokit request was mocked into
a claimed integration pass: GitHub and persistence are injected doubles, while
the actual ESM p-limit/yocto-queue implementation is transformed in Jest.
The obsolete Hello World e2e was replaced by catalog HTTP characterization.
No conflict endpoint exists; not-found, invalid input, forbidden, upstream and
storage failures are covered instead of inventing conflict behavior.

Final local evidence:

| Command/check                                                                                                                                                                     | Result                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --runInBand`                                                                                                                                                         | 23 tests pass; includes exact early rate-limit return with queued work continuing, SHA/force/404 precedence, cache projection, native success/warning JSON, canaries and 8 concurrent request contexts                                              |
| `npm run test:e2e -- --runInBand`                                                                                                                                                 | 5 scenarios pass with auth/use-case doubles; seven business routes guarded, anonymous GET/HEAD health, validation, media types, 201 sync, 404/500                                                                                                   |
| `npm run test:maintenance`                                                                                                                                                        | 4 fixture tests pass; actual disposable commits format staging, retain partial/unstaged content, block syntax failure, and exact `npm run format:check` rejects drift without writes                                                                |
| Fixture `npm ci --no-audit --no-fund`                                                                                                                                             | Clean developer install enables hooks; CI=true skips hooks; package-only/no-Git install succeeds                                                                                                                                                    |
| Fixture `npm ci --no-audit --no-fund --omit=dev`                                                                                                                                  | Production omission succeeds without hook files/Husky/lint-staged                                                                                                                                                                                   |
| `npm run build`                                                                                                                                                                   | Pass, including offline OpenAPI generation                                                                                                                                                                                                          |
| `git diff --exit-code -- openapi.json`                                                                                                                                            | Pass, generated public contract unchanged                                                                                                                                                                                                           |
| `npm run format:check`                                                                                                                                                            | Pass; source/test and introduced maintenance tooling baseline                                                                                                                                                                                       |
| `npx --no-install eslint src/backstage-catalog/backstage-catalog.service.spec.ts src/observability/observability.ts src/observability/observability.spec.ts test/app.e2e-spec.ts` | Pass, no disabled rules                                                                                                                                                                                                                             |
| `npm run lint:check`                                                                                                                                                              | Still fails: 117 errors, 14 warnings (baseline 220/22). Remaining legacy service types, missing declarations/ESM type resolution, require-await, DTO/interface/bootstrap errors. Client-factory diagnostics moved with unchanged construction logic |
| `docker version --format '{{.Server.Version}}'`                                                                                                                                   | Blocked: cannot connect to Docker daemon at unix:///var/run/docker.sock                                                                                                                                                                             |

An intermediate production-fixture assertion failed because the fixture itself
set npm_config_production=false, overriding omission. Removing that fixture
override made the real omit-dev install pass; no production workaround was added.
An intermediate middleware placement error was caught by build/tests and corrected.
All disposable Git/install fixtures clean up their own directories. The service
checkout has no staged changes/commits, and original setup files remain present.

Final runtime diff review and an explicit no-diff check confirmed catalog
controller/DTO/schema/health code and generated OpenAPI were unchanged. Review
caught and removed two now-unused parser catch variables. The existing
`PYTHONDONTWRITEBYTECODE=1 python3 scripts/test_cleanup_deployment.py` check also
passed (3 tests); deployment workflows were not altered.

The new workflow will report existing full-lint failures rather than hiding them;
it is not a new deployment dependency. GitHub-hosted Node 22 checks and an actual
image build remain unverified here (local Node 24). No Mongo/GitHub/Grafana live
verification, publication or deployment was performed. Preserve those distinctions
in acceptance/handoff; external-owner steps remain pending.
