# WDIO BDD Is Horizontal Scroll Acceptance

Status: proposed

WDIO Cucumber is the canonical acceptance layer for horizontal-scroll behavior because the failure is user-visible and must be proven in real Obsidian, not only by unit tests or custom DOM probes. Older CDP verifiers can remain as diagnostic helpers, but they should not be the final source of truth once equivalent WDIO coverage exists.

## Decision

- Horizontal-scroll scenarios belong in Gherkin feature files with reusable typed step definitions.
- Scenarios must assert desktop behavior, mobile-emulated behavior, exact edit after scroll, wrap-on behavior, and independent multi-block scroll.
- Failure artifacts must include screenshots, structured scroll-state JSON, DOM-derived measurements, and WDIO logs under `tests/runtime-session/wdio-artifacts/`.
- `verify:obsidian-codeblock-horizontal-scroll-regression` should route to the WDIO scroll scenarios once equivalent coverage exists.

## Consequences

Scroll tests should describe product behavior and hide selectors, sleeps, and implementation mechanics inside page objects or support helpers.
