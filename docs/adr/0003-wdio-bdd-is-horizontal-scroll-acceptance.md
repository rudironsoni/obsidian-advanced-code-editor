# WDIO BDD Is Horizontal Scroll Acceptance

Status: proposed

WDIO Cucumber is the canonical acceptance layer for horizontal-scroll behavior because the failure is user-visible and must be proven in real Obsidian, not only by unit tests or custom DOM probes. Legacy direct browser-protocol verifiers are not part of the supported harness for this repo.

## Decision

- Horizontal-scroll scenarios belong in Gherkin feature files with reusable typed step definitions.
- Scenarios must assert desktop behavior, mobile-emulated behavior, exact edit after scroll, wrap-on behavior, and independent multi-block scroll.
- Failure artifacts must include screenshots, structured scroll-state JSON, DOM-derived measurements, and WDIO logs under `tests/runtime-session/wdio-artifacts/`.
- `bun run test:bdd:scroll` is the supported horizontal-scroll runtime gate.

## Consequences

Scroll tests should describe product behavior and hide selectors, sleeps, and implementation mechanics inside page objects or support helpers.
