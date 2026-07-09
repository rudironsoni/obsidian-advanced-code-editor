# Reliability Gates Before Enhancements

Status: accepted

Advanced Code Editor will finish scroll-performance hardening, runtime visual parity, and beta-release predictability before adding new user-facing enhancement batches. The plugin recently had fragile behavior in Live Preview scroll, Source mode token decorations, syntax color retention, and gutter alignment, so feature work must now ride behind runtime gates that prove Reading mode, Live Preview, Raw Source mode, desktop, and mobile-emulated Obsidian still behave correctly.

## Considered Options

- Continue directly into new settings and code block features. Rejected because it can hide regressions behind untrusted runtime coverage.
- Treat the current scroll issues as stale and move on. Rejected because the issue tracker still contains acceptance criteria that should either be proved complete or tightened before closure.
- Finish the hardening loop first, then build enhancements. Chosen because it keeps the product roadmap moving while making future regressions harder to ship.

## Decision

- Reconcile open scroll-hardening issues against the implementation and close only what is proved by tests or runtime artifacts.
- Tighten the no-regression scroll performance gate before broader product work.
- Add a focused runtime visual parity gate for Reading mode, Live Preview, and Raw Source mode.
- Make the beta release path predictable before relying on BRAT feedback for new enhancements.
- Prioritize theme confidence, code block controls, metadata parity, and language support UX only after those gates are in place.

## Consequences

Future enhancement work should include the focused runtime gate for the surface it changes. A passing unit test or static check is not enough to claim a rendering, scroll, or Source mode behavior is complete.
