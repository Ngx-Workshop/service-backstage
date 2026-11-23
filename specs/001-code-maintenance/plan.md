# Implementation plan: Code Maintenance

Status: Implemented locally; CI/lint and live verification pending · Updated: 2026-11-22
Spec: [spec.md](spec.md)

## Source baseline

Repository: `service-backstage` · audited HEAD: `46d5849`.
NestJS core declared: `^11.0.1`;
Prettier declared: `^3.4.2`.
At baseline, Prettier and native JSON HTTP logging existed; Husky/lint-staged
were absent. Implementation and actual baseline/final evidence are recorded in
[audit.md](audit.md) and [handoff.md](handoff.md).

Inspect these actual module/controller/service paths first:

- `src/app.module.ts`
- `src/backstage-catalog/backstage-catalog.module.ts`
- `src/observability/observability.module.ts`
- `src/backstage-catalog/backstage-catalog.controller.ts`
- `src/observability/health.controller.ts`
- `src/backstage-catalog/backstage-catalog.service.ts`

Also inspect `src/main.ts`, any bootstrap/config/adapter/DTO/schema files,
`src/observability/`, `package.json`, `package-lock.json`, Prettier/ESLint configs,
`Dockerfile`, `.dockerignore`, `.github/workflows/`, existing tests and local docs.

## Design and requirement mapping

T001/T002 findings and baselines are recorded in [audit.md](audit.md).
Keep controllers and the cohesive catalog service in place. Extract only GitHub
client construction into a catalog provider, with type-only service imports.
Characterize existing cache/sync/access behavior before this move. Add async
request context to existing observability and bounded sync outcome logs without
changing error persistence, response counters or rate-limit early-return semantics.
Touched paths: catalog module/service/provider/tests, existing observability/tests,
isolated HTTP e2e, package/lockfile, formatting/hook scripts and CI/context docs.
No API/schema change, speculative layers or async-pattern migration is planned.

| Requirement | Planned approach                                                                                             | Evidence  |
| ----------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| FR-001      | Record baseline commands, dependency map and findings by source path in `audit.md` here                      | T001–T002 |
| FR-002/003  | Characterize behavior, then extract only concrete misplaced responsibilities; keep module public APIs narrow | T003–T004 |
| FR-004      | Implement staged Prettier, guarded hook setup and CI checks without collateral formatting                    | T005–T006 |
| FR-005      | Inventory existing events, add safe use-case/upstream events and useful correlation through existing logger  | T007–T008 |
| FR-006      | Verify, update local docs and record remaining external acceptance                                           | T009–T010 |

Service focus: Keep GitHub/Octokit access and cache persistence behind catalog providers. Preserve sync/cache semantics and guard behavior. Never log GitHub credentials, private README contents or upstream response bodies.

## Constitution check

Keep domain ownership, contracts/access, persistence semantics, meaningful
verification and repository-local context intact. Recheck each local constitution
principle in T002 after source inspection and again in T010; justify any deviation.
No architecture-quality claim is made by adding this plan.

## Formatting and installation details

Use project-local pinned compatible devDependencies and regenerate the lockfile.
A prepare hook that invokes a missing script/tool will break images that copy only
`package*.json` before `npm ci`. Inspect the Dockerfile before choosing a lifecycle:
either make preparation self-contained and guarded in the manifest, or explicitly
copy the guarded installer before installing. Skip hooks for CI, `HUSKY=0`,
production/no-dev installs and no-Git environments without skipping other required
install scripts. Preserve existing lifecycle behavior. Verify using disposable
checkouts/directories, not fabricated pass messages. Avoid network-on-commit
fallbacks. Exclude generated paths from Prettier/lint-staged/CI consistently.
Choose a documented formatting baseline or format touched files; do not silently
claim existing whole-repo drift is clean or make CI unexpectedly fail on old drift.

Implemented: Husky 9.1.7/lint-staged 15.5.2; manifest-only guarded prepare avoids
Docker copy-order dependencies. Staged supported extensions use Prettier with
generated/vendor ignores. The clean source/test formatting baseline and new
maintenance tooling are CI-gated; historical Markdown/vendor assets are not
bulk-formatted. A separate validation workflow does not alter publication/deployment.
The strict full lint gate remains red on existing debt; no rules were disabled.

## Logging and collector compatibility

Read `docs/observability.md` and existing logging tests. Native JSON output wraps
structured payloads according to the installed NestJS version; confirm actual
field placement before documenting LogQL. Existing HTTP IDs are generated locally;
there is no automatic domain correlation just because an access record has an ID.
Prefer a small singleton context provider/AsyncLocalStorage if propagation is
needed; verify isolation and background-work behavior. Keep untrusted IDs bounded
and validated, don't create high-cardinality Loki labels, and preserve heartbeat
behavior. Extend existing tests with safe success/failure/canary coverage and
record useful query examples only after checking the emitted structure.

## Compatibility, dependencies and delivery

No intended consumer/schema change or migration. Preserve installed auth clients,
protocol adapters and generated output sources. If source inspection reveals a
necessary contract change, document consumer impact and producer-first delivery
before changing it; do not silently broaden maintenance scope. Other services,
Grafana/Alloy and production hosts are external owners; do not require sibling
checkouts. No publication or deployment is authorized by this task.

## Verification

T001 records actual scripts/baseline results. Use supported local tests and a
non-mutating lint command; existing `lint` scripts often include `--fix`.
AC-001 uses meaningful characterization/HTTP tests. AC-002/003 use disposable Git
and install fixtures, partial staging and a negative formatting check. AC-004 uses
existing observability tests plus domain success/failure/redaction/context checks.
AC-005 records build, lint, format and applicable contract checks. Separate local,
mocked, container and live Grafana results. Do not install latest NestJS-only
logging features without checking the pinned major version.

## References

- [NestJS modules](https://docs.nestjs.com/modules)
- [NestJS controllers](https://docs.nestjs.com/controllers)
- [NestJS logging](https://docs.nestjs.com/techniques/logger)
- [Prettier pre-commit integration](https://prettier.io/docs/precommit)
- [Husky installation](https://typicode.github.io/husky/get-started.html)
- [Husky CI/Docker/production guidance](https://typicode.github.io/husky/how-to.html)

Consult documentation matching installed versions before implementation.
