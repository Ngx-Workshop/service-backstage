# Architecture - service-backstage

Source inspected at `46d5849`; maintenance verified locally on 2026-11-22.
[Audit](../specs/001-code-maintenance/audit.md) records baselines and limitations.

## Ownership and dependency flow

This service owns repository catalog and cached repository metadata. It accesses
only its own `backstage_repo_cache` collection; other domains remain behind owner
APIs. No sibling checkout is needed.

- [AppModule](../src/app.module.ts) is the composition root: global ConfigModule,
  Mongo connection, BackstageCatalogModule and ObservabilityModule.
- [BackstageCatalogModule](../src/backstage-catalog/backstage-catalog.module.ts)
  explicitly imports ConfigModule, auth client and its Mongoose schema. It exports
  no providers. The thin controller delegates to BackstageCatalogService.
- [BackstageCatalogService](../src/backstage-catalog/backstage-catalog.service.ts)
  owns cache reads/DTO mapping and sync use cases. It injects its own cache Model,
  ConfigService and the GitHub client token. GitHub access, document precedence/
  validation and cache persistence stay inside catalog providers.
- [GitHub client provider](../src/backstage-catalog/github-client.provider.ts)
  owns token validation and Octokit construction with a 10-second request timeout.
  The service's Octokit import is type-only. No speculative repository layer,
  circular flow, duplicate registration or new module exports were introduced.
- [ObservabilityModule](../src/observability/observability.module.ts) imports
  Terminus and owns anonymous liveness. Bootstrap installs native JSON logging
  and HTTP middleware. The shared AsyncLocalStorage context in
  [observability](../src/observability/observability.ts) holds only generated IDs;
  it has no reverse catalog dependency. See [logging](observability.md).

OpenAPI mode omits Mongo and substitutes schema/client/auth providers for offline
generation. It does not certify runtime authentication or upstream readiness.

## Preserved contracts and operational semantics

All seven catalog routes keep RemoteAuthGuard. Raw document routes retain content
types and literal refresh=true behavior. Global validation still forbids unknown
fields without enabling a new transform mode. No DTO, route, persisted schema,
collection/index or module-public-API change was made; generated OpenAPI is identical.

SHA caching, optional 404 handling, document-path priority, configured p-limit
concurrency and cache upsert semantics are preserved. Legacy non-rate failures
may be reported as sync successes after failure persistence; rate-limit batches
return while queued work continues. Characterization explicitly covers both.
New aggregate logs distinguish observed failures from legacy reported counters.
Changing those semantics requires a separate compatibility decision.

## Verification boundaries

Unit tests inject GitHub/cache doubles and exercise the real limiter. HTTP tests
exercise decorators, validation/status/media types and all guard placements with
auth/use-case doubles. They are not live MongoDB/GitHub/auth integration.
Build/offline OpenAPI, format and selected changed-file lint pass. Full lint has
recorded baseline debt; Node 22 hosted CI, actual Docker image startup and live
Grafana ingestion remain pending. See [handoff](../specs/001-code-maintenance/handoff.md).

Generated deployment orchestration is centrally managed by the Node CLI; see [deployment-workflows](deployment-workflows.md).
