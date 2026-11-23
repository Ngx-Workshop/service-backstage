# Handoff: Code Maintenance

Status: Implemented locally; T006/target-runtime and live checks pending.
Updated: 2026-11-22 · [Spec](spec.md) · [Plan](plan.md) ·
[Tasks](tasks.md) · [Audit and exact evidence](audit.md)

## Changes

- Catalog controllers, guards, DTOs, Mongo schema/collection and module exports
  remain unchanged. Client construction is a catalog factory provider; type-only
  service imports avoid loading Octokit in injected-double unit tests.
- Jest transforms actual ESM p-limit/yocto-queue. Corrected model/auth fixtures
  and replaced obsolete Hello World HTTP expectations with catalog contracts.
- Existing observability now propagates generated request IDs via AsyncLocalStorage.
  Sync events include independent run IDs, durations and bounded outcomes. Raw
  upstream/parser errors and repository/content data are no longer domain logs.
- Husky 9.1.7/lint-staged 15.5.2 provide staged formatting. Prepare is self-contained
  and guarded for CI, HUSKY=0, production/omit-dev and no Git. Explicit ignores
  exclude generated/vendor outputs. No unrelated source formatting rewrite.
- Added non-mutating format/lint scripts and a separate maintenance CI workflow.
  Publication/deployment workflows are not changed or triggered by this work.

## Verified locally

Node 24.9.0/npm 11.6.0 (target CI/image remains Node 22.23.5):

- 23 unit tests, 5 isolated catalog HTTP scenarios, 4 real hook/install fixture
  tests pass. GitHub/cache/auth doubles are not live integration.
- Actual disposable commits preserve partial and unstaged changes; syntax errors
  block commit. The exact format:check script rejects drift without writes.
- Clean developer, CI=true, Docker-style package-only/no-Git and omit-dev
  production npm ci installations pass. Fixtures are removed after tests.
- Build and offline OpenAPI generation pass; generated OpenAPI is unchanged.
  No contract generation/publication is needed.
- Formatting and targeted logging/test lint pass. Native JSON success/warning
  records have payloads under message, with context/level at the root. Canary
  redaction, eight concurrent request contexts and quiet GET/HEAD health pass.

## Residual risks and blocked checks

1. **T006/full lint:** npm run lint:check fails with 117 errors/14 warnings,
   reduced from baseline 220/22. Remaining legacy source typing, missing
   declarations/ESM type resolution, DTO/interface and require-await issues are
   not suppressed. The strict new CI lint step will remain red until this debt
   is resolved. Targeted changed logging/tests lint is clean.
2. **Target runtime/image:** Docker daemon is unavailable. Package-only install
   verifies Docker copy-order/prepare safety, not an actual image build or startup.
   GitHub-hosted Node 22 execution is also not claimed. Production omit-dev
   verifies installation, not boot: the existing auth-client devDependency is
   still needed by runtime source; the current Dockerfile installs devDependencies.
3. **Compatibility debt intentionally retained:** non-rate sync failures update
   failed cache rows but can increment legacy success counters. Rate-limit batches
   return early while queued work continues. Tests explicitly preserve both;
   observedFailures is a snapshot distinct from reported counters.
4. **External integration:** no live MongoDB/GitHub calls, image deployment,
   Alloy ingestion or Grafana receipt were checked. Existing stored syncError/API
   failure strings remain untouched, but are never included in new domain logs.

## Exact next actions / owner handoffs

- Repository maintainer: resolve the recorded full-lint baseline without disabling
  rules, then run the maintenance workflow on Node 22.23.5. Keep T006 open until
  that gate passes. Build the existing image with an available Docker daemon;
  use isolated configuration/data for runtime checks, never production writes.
- Infrastructure owner `nginx-ngx-workshop.io/ops/grafana`: after an authorized
  deployment, verify existing Alloy discovery/JSON ingestion and query
  message.event=catalog_sync using the examples in
  [observability](../../docs/observability.md). Confirm the actual Loki service
  label and inspect bounded success/failure records plus quiet heartbeat polling.
  Tokens stay infrastructure-owned; no application Grafana credential is needed.
- Any future change to sync counters, cancellation, validation or auth-client
  dependency classification needs separately scoped compatibility work.

No service-checkout commit, push, publication or deployment was performed.
