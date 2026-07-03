# PR-Only GUI BDD CI

Status: proposed

GUI WDIO BDD should run on pull requests to the repository default branch, currently `master`, plus manual dispatch. Pushes to arbitrary branches should not block on GUI tests because Electron startup is heavier than the normal non-GUI gate and branch pushes are often used for incremental agent work.

## Decision

- Keep non-GUI `bun run ci` as the regular build, lint, unit, artifact, and benchmark gate.
- Add or update GUI WDIO BDD CI to run on `pull_request` targeting `master` and `workflow_dispatch`.
- Do not require GUI WDIO BDD on every branch push.

## Consequences

Agents still run WDIO locally or manually when changing UI behavior, but branch pushes do not wait on the slowest GUI path by default.
