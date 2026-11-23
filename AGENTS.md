# Agent entry point — service-backstage

This repository owns repository catalog and cached repository metadata. Work from this checkout; sibling source is
not required.

Read [.specify/memory/constitution.md](.specify/memory/constitution.md),
[architecture](docs/architecture.md), [development](docs/development.md),
[workflow](.specify/README.md) and the [feature index](specs/README.md) before edits.

- Inspect source and git status; preserve unrelated work and historical specs.
- Keep feature spec, plan, tasks and handoff aligned; mark complete with evidence.
- Preserve public contracts and access policies. Generate contracts from source.
- Keep controllers thin, providers cohesive and module exports intentional.
- Use owner-service APIs; do not couple to another service's collections.
- Keep GitHub/Octokit access and cache persistence behind catalog providers. Preserve sync/cache semantics and guard behavior. Never log GitHub credentials, private README contents or upstream response bodies.
- Reuse existing structured logging; read [observability](docs/observability.md).
- Verify changed behavior and distinguish local tests from live integration.
- Resolve routine choices; ask only for consequential missing decisions.

This is a Spec Kit-inspired Markdown setup, not an installed Spec Kit CLI.

## Next task: Code Maintenance

The selected work is [Code Maintenance](specs/001-code-maintenance/spec.md)
(implemented locally; CI/lint and live verification pending).
Read its [plan](specs/001-code-maintenance/plan.md), [tasks](specs/001-code-maintenance/tasks.md) and
[handoff](specs/001-code-maintenance/handoff.md). Continue the recorded T006 follow-up;
retain older unfinished
feature records without treating them as the next task. The requested work covers
NestJS module/domain boundaries, thin controllers, cohesive services, Prettier
with Husky/lint-staged, CI checks and safe domain logging through existing
observability. Local implementation evidence is in the audit/handoff; do not repeat
completed refactors or claim full lint, target-runtime or live Grafana verification.
