# Advanced Code Editor Implementation Roadmap

This roadmap records the next implementation sequence for Advanced Code Editor after the Live Preview token retention, gutter parity, and scroll performance work landed on `master`.

## Current State

- `master` contains the latest Live Preview token-retention and gutter-parity fixes.
- The latest observed beta release is `0.9.1-beta.24`, which predates those two latest fixes.
- The only open tracker items are the scroll hardening issues: `#29`, `#30`, `#31`, and `#32`.
- The accepted architecture keeps Raw Source mode editable, keeps Live Preview inside CodeMirror, uses native row scroll, and treats WDIO runtime proof as the acceptance layer for visible behavior.

## Implementation Order

1. Reconcile the scroll hardening issues.
    - Audit `#29`, `#30`, `#31`, and `#32` against the current implementation and tests.
    - Close only criteria that are proved by source guards, unit tests, WDIO artifacts, or runtime screenshots.
    - Implement only missing acceptance criteria.

2. Tighten the no-regression scroll performance gate.
    - Keep the repeated-wheel Live Preview stress scenario as the base desktop gate.
    - Compare Live Preview against a same-run Reading mode reference.
    - Keep absolute budgets for event count, p95 dispatch, max dispatch, and zero backtracking.
    - Add equivalent mobile-emulated touch or pointer stress coverage.
    - Keep artifacts under `tests/runtime-session/wdio-artifacts/`.

3. Add a focused runtime visual parity gate.
    - Prove Shiki-owned token colors in Reading mode, Live Preview, and Raw Source mode across the language matrix.
    - Prove Live Preview keeps tokens after note focus loss and sidebar layout changes.
    - Prove Source mode keeps fences editable and has no rendered block chrome.
    - Prove Live Preview and Reading mode match for gutters, header alignment, and copy button alignment.
    - Prove Raw Source mode background matches the selected Shiki theme in dark and light mode.

4. Make beta releases predictable.
    - Decide and document whether beta releases come from typed branches or `master`.
    - Adjust the workflow only if the documented path should change.
    - Verify BRAT can install the beta containing the latest validated fixes.

5. Build enhancement batches after the gates exist.
    - Theme confidence: settings preview and custom theme validation.
    - Code block controls: consistent copy behavior and stable copied/error states.
    - Metadata parity: consistent title, line-number, line-highlight, and diff-highlight behavior in Reading mode and Live Preview.
    - Language support UX: clearer disabled-language and custom-language validation, backed by the language matrix.

## Required Verification

- `rtk bun run typecheck`
- `rtk bun run test:unit`
- `rtk bun test tests/architecture-boundaries.test.ts`
- `rtk bun test tests/block-horizontal-scroll.test.ts`
- `rtk bun run build`
- `rtk bun run lint`
- `rtk bun run test:integration`
- `rtk bun run test:bdd:scroll`
- `rtk bun run test:bdd`
- `rtk bun run check`

Runtime checks remain mandatory for any rendering, scrolling, mode-switching, or Source mode claim.
