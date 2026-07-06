# Advanced Code Editor Migration Plan v0.9.0

Status: complete.

This plan records the completed migration from the old Shiki Highlighter identity
and Monaco-based runtime toward `advanced-code-block`, direct Shiki rendering,
and the WDIO-backed acceptance harness.

## Decisions

| #   | Decision                                                                                        | Date       | Guardrail                                                                 |
| --- | ----------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| 1   | Remove Monaco entirely, use direct Shiki                                                        | 2026-06-28 | `tests/architecture-boundaries.test.ts`, `tests/startup-bundle.test.ts`   |
| 2   | Plugin ID: `advanced-code-block`                                                                | 2026-06-28 | `tests/startup-bundle.test.ts`, WDIO plugin-load scenario                 |
| 3   | Display name: `Advanced Code Editor`                                                            | 2026-06-28 | `manifest.json`, `manifest-beta.json`, `tests/startup-bundle.test.ts`     |
| 4   | Version: `0.9.0`                                                                                | 2026-06-28 | `package.json`, `manifest.json`, `manifest-beta.json`, `versions.json`    |
| 5   | Settings names: `showLineNumbers` and `wrapLines`                                               | 2026-06-28 | `tests/startup-boundary.test.ts`                                          |
| 6   | No backward-compatible BRAT path for the old plugin ID                                          | 2026-06-28 | Release artifact integration installs only `advanced-code-block` payloads |
| 7   | Runtime script naming must be abstract and not Monaco-specific: `obsidian-advanced-codeblock-*` | 2026-06-28 | Startup bundle, workflow, and stale-string scans                          |

## Completed Work

### Runtime Migration

- Removed Monaco production runtime files and Monaco-specific production CSS.
- Replaced the renderer with direct Shiki highlighting through `ShikiHighlighter`.
- Kept Source mode as native CodeMirror Markdown editing with token decorations only.
- Kept Reading mode and Live Preview rendering on plugin-owned code block surfaces.
- Preserved Obsidian native note line numbers while keeping internal code block line numbers.

### Plugin Identity

- Renamed the package and plugin ID to `advanced-code-block`.
- Renamed the display name to `Advanced Code Editor`.
- Set the base version to `0.9.0`.
- Updated release and beta workflows to publish artifacts under the new plugin ID.
- Updated README install text and repository links.

### Settings

- Renamed code block defaults to `showLineNumbers` and `wrapLines`.
- Updated the settings tab heading to `Code block defaults`.
- Added a startup-boundary guard that prevents returning to `ecDefaultShowLineNumbers`,
  `ecDefaultWrap`, or `EC defaults`.

### Harness

- Added and stabilized WDIO Cucumber coverage for desktop and mobile-emulated Obsidian.
- Kept WDIO runs to `maxInstances: 1` and grouped features so each command uses a single
  Obsidian session.
- Added scroll-specific BDD scenarios for Reading mode, Live Preview, Source mode, and
  mobile emulation.
- Routed WDIO failure artifacts under `tests/runtime-session/wdio-artifacts/`.
- Exposed WDIO MCP through `.mcp.json` for MCP-aware agents.

## ADRs

The active design record lives under `docs/adr/`:

- `0001-block-owned-horizontal-scroll.md`
- `0002-keep-source-mode-raw.md`
- `0003-wdio-bdd-is-horizontal-scroll-acceptance.md`
- `0004-reuse-one-obsidian-session-for-bdd.md`
- `0005-mobile-coverage-is-emulated-until-device-automation-exists.md`
- `0006-pr-only-gui-bdd-ci.md`
- `0007-live-preview-native-gutter-and-row-scroll.md`

## Verification

Use the repository harness documented in `AGENTS.md`.

Minimum plan regression checks:

```bash
rtk bun run typecheck
rtk bun run test:unit
rtk bun run test:integration
rtk bun run test:bdd
```

Release-level confidence:

```bash
rtk bun run check
rtk bun run test:bdd
```

Mobile coverage is desktop Obsidian mobile emulation only. Real iOS or Android device
automation is not part of this completed plan.
