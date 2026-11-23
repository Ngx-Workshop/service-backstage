# Service logging and heartbeat

This service uses native NestJS 11 `ConsoleLogger` JSON output to stdout/stderr, with `Logger` context for application events. No Angular logger or application-held Grafana credential is used. HTTP logs contain generated request ID, method, route template, status and duration; bodies, cookies, authorization headers, concrete identifiers and query strings are not logged by the middleware. Health polling is excluded from access logs. Avoid embedding secrets or personal search text in domain log messages.

## Catalog events and correlation

Maintenance on 2026-11-22 added bounded structured domain events through the same
logger/collector pipeline:

- `catalog_sync`: one aggregate event per completed/early-return batch, at log for
  ok or warn for partial/rate_limited. Includes runId, optional requestId, total,
  observedFailures, reportedSucceeded/reportedFailed, stoppedEarly and durationMs.
  No per-repository batch events or failure strings are exported.
- `catalog_repo_sync`: log/warn outcome for a direct single-repository refresh,
  with run/request IDs, duration and optional validated numeric upstreamStatus.
  No concrete repository name, SHA, URL, token, content or error message.
- `catalog_discovery`: error for rejected organization discovery, with run/request
  IDs, duration and optional safe numeric status; the original failure still propagates.
- `catalog_document_rejected`: debug-only stable parser rejection reason/format
  and optional request ID, never parser excerpts/errors. Debug remains excluded
  from the configured production output levels.

Request middleware uses AsyncLocalStorage to propagate its generated UUID across
async use-case work. Incoming X-Request-ID is ignored, even if syntactically valid;
no external ID is trusted/forwarded. Each batch/direct sync gets a generated run UUID.
Background work outside a request omits requestId. These are process-local
correlations, not distributed tracing; no new cross-service header is sent.
Concurrent HTTP context isolation and quiet GET/HEAD health are covered by tests.
Ordinary cache reads retain HTTP-only logging to avoid noisy duplicate events.

The native Nest JSON envelope has level/context at the root and structured fields
under message. Actual domain success/warning output was parsed in tests:

```json
{
  "level": "log",
  "context": "BackstageCatalogService",
  "message": {
    "event": "catalog_sync",
    "outcome": "ok",
    "runId": "64c62982-62f9-49c5-bc08-0fd658661d21",
    "total": 0,
    "observedFailures": 0,
    "reportedSucceeded": 0,
    "reportedFailed": 0,
    "durationMs": 0,
    "stoppedEarly": false
  }
}
```

Nest also adds its normal timestamp/process fields. HTTP fields remain under
message too. Do not turn requestId/runId into high-cardinality Loki labels.
Illustrative LogQL (infrastructure must confirm the deployed service label):

```logql
{service_name="backstage"} | json event="message.event", outcome="message.outcome" | event="catalog_sync"
{service_name="backstage"} | json requestId="message.requestId" | requestId="GENERATED-UUID"
```

The service intentionally preserves legacy sync response counters: swallowed
non-rate failures can still increment reportedSucceeded. observedFailures is the
failure snapshot, not a rewritten public response. After a rate limit, stoppedEarly
signals that queued work can continue; aggregate counts/duration are not a claim
that all background tasks finished. Stored syncError/returned failure strings
remain existing contracts but must never be copied into logs.

Local maintenance verification: 23 unit tests and 5 isolated catalog HTTP cases
pass, including native JSON success/warning serialization, discovery/parser canary
redaction and eight concurrent contexts. This verifies local payload compatibility,
not Alloy delivery or live Grafana receipt. The infrastructure owner must verify
receipt after authorized deployment; the Docker daemon was unavailable here.

`GET /health` and HEAD return the anonymous operational Terminus heartbeat with `status: ok` and `heartbeat: up`, plus `Cache-Control: no-store`. This is liveness only; it does not claim MongoDB or upstream readiness. Existing business-route authentication remains enforced. The gateway's exact read-only heartbeat is the only exception to its normalized proxy-envelope requirement. The operational endpoint is excluded from business Swagger/contracts where that service generates them.

Docker probes `/health` every 30 seconds. Deployments bound each container's local JSON log files to 10 MiB × 3. Host Alloy discovers active service names and ships logs and private HTTP heartbeat probe metrics to Grafana Cloud stack `ivorytoffee195`. Collector configuration/dashboard lives in infrastructure owner `nginx-ngx-workshop.io/ops/grafana`; its ingestion token remains host-owned, scoped to logs/metrics write, and requires account authorization before activation. No production credential belongs in this repository.

Validation on 2026-11-21: the isolated observability HTTP suite passed (5 scenarios), build passed, Linux-targeted lockfile dry run passed. Guarded services additionally passed the anonymous-heartbeat/protected-business-route HTTP test. Gateway production ingress e2e passed (51 scenarios), including exact-path/method heartbeat boundaries. Gateway and publisher lint passed. Full existing unit suites passed except Backstage's unchanged Octokit ESM test-loader failure, reproduced on its pre-change HEAD. Uploader tests pass under its documented `npm test` command; its 10 optional cases remain skipped. Publisher persistence e2e cases require the isolated Mongo URI and remain skipped when unavailable. These are local checks, not evidence of Grafana ingestion or live deployment.
