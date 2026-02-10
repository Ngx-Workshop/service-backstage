## Backstage Catalog Service

Server-side catalog that discovers Ngx-Workshop repos, caches documentation in MongoDB, and exposes admin-only endpoints at `/backstage/*` for the Backstage Angular MFE.

### Environment

- `MONGODB_URI` – connection string for Mongo.
- `WORKSHOP_GITHUB_TOKEN` – required; personal access token with `repo` read scope (never exposed to the browser).
- `GITHUB_ORG` – defaults to `Ngx-Workshop`.
- `BACKSTAGE_SYNC_CONCURRENCY` – optional, default `3` concurrent repo fetches.
- `PORT` – optional; defaults to `3008`.

### Run locally

1. Install: `npm install`
2. Start API: `npm run start:dev`
3. Generate OpenAPI: `npm run build` (postbuild writes `openapi.json`).

### Backstage endpoints (admin-only)

- `GET /backstage/services` – list cached repos; query: `q` (text search), `include=readme,openapi,runbook,metadata`, `refresh=true` to pull latest before returning.
- `GET /backstage/services/:repo` – full detail (docs included); `refresh=true` to re-sync first.
- `POST /backstage/sync` – body `{ repos?: string[], force?: boolean }`; triggers a sync loop and returns `{ total, succeeded, failed, durationMs }`.
- `GET /backstage/services/:repo/readme` – raw README markdown.
- `GET /backstage/services/:repo/openapi` – raw OpenAPI YAML/JSON.
- `GET /backstage/services/:repo/runbook` – raw runbook markdown (404 if missing).
- `GET /backstage/services/:repo/metadata` – raw service metadata YAML/JSON (404 if missing).

### Repo file conventions

- OpenAPI (first match wins): `docs/openapi.yaml`, `docs/openapi.yml`, `docs/openapi.json`, `openapi.yaml`, `openapi.yml`, `openapi.json`.
- README: GitHub default (`getReadme`).
- Runbook (optional): `docs/runbook.md`, `runbook.md`.
- Service metadata (optional): `docs/service.yaml`, `service.yaml`, `docs/service.json`, `service.json`.
