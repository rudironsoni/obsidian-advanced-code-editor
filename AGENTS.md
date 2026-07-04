<!-- headroom:rtk-instructions -->

# RTK (Rust Token Killer) - Token-Optimized Commands

When running shell commands, **always prefix `rtk`**. reduces context usage 60-90% zero behavior change. If rtk no filter command, passes through unchanged, so always safe use.

## Key Commands

```bash
# Git (59-80% savings)
rtk git status          rtk git diff            rtk git log

# Files & Search (60-75% savings)
rtk ls <path>           rtk read <file>         rtk grep <pattern>
rtk find <pattern>      rtk diff <file>

# Test (90-99% savings), shows failures only
rtk pytest tests/       rtk cargo test          rtk test <cmd>

# Build & Lint (80-90% savings), shows errors only
rtk tsc                 rtk lint                rtk cargo build
rtk prettier --check    rtk mypy                rtk ruff check

# Analysis (70-90% savings)
rtk err <cmd>           rtk log <file>          rtk json <file>
rtk summary <cmd>       rtk deps                rtk env

# GitHub (26-87% savings)
rtk gh pr view <n>      rtk gh run list         rtk gh issue list

# Infrastructure (85% savings)
rtk docker ps           rtk kubectl get         rtk docker logs <c>

# Package managers (70-90% savings)
rtk pip list            rtk pnpm install        rtk npm run <script>
```

## Rules

- In command chains, prefix segment: `rtk git add . && rtk git commit -m "msg"`
- For debugging, use raw command without rtk prefix
- `rtk proxy <cmd>` runs command without filtering but tracks usage

## Resource Rules

- **One Obsidian instance per WDIO command.** Never run parallel Obsidian instances. WDIO tests must run with `maxInstances: 1` and reuse that command's Obsidian session across setup, debugging, and verification.
- If instance already running, reuse it: reload plugin, re-copy plugin files into existing vault, reload test note. Do not create new vault, user-data-dir, or `--user-data-dir`.
- If you accidentally launch twice, kill duplicate. Never leave orphan processes.
- Runtime reload is cheap and idempotent. Prefer it over relaunching Obsidian.
- Reuse the same test vault and same Obsidian instance within a WDIO command across setup, debugging, and verification. Do not spin up extra instances.
- Use `tests/obsidian-test-vault/` as the canonical Obsidian test vault for manual/runtime debugging unless a verifier script explicitly requires a different vault.
- Keep all verification artifacts in one explicit runtime workspace, never scattered at top-level repo paths.
- Always use model's vision capabilities screenshots from real Obsidian to verify actually rendered before concluding UI bug fixed or understood.
- Preferred artifact root is `tests/runtime-session`.
- Route WDIO failure output to `tests/runtime-session/wdio-artifacts/`; do not scatter screenshots or JSON reports at the repo root.
- Before and after runtime verification, confirm the workspace is either clean or fully removed.
<!-- /headroom:rtk-instructions -->

## Project-Specific Rules
This is an Obsidian plugin. Do not claim UI or runtime bugs are fixed from unit tests alone.

### Architecture
- `packages/obsidian/src/main.ts` owns plugin lifecycle, registration, settings, and reload orchestration.
- `packages/obsidian/src/codemirror/Cm6_ViewPlugin.ts` owns CodeMirror extension wiring and decoration refresh.
- `packages/obsidian/src/modes/LivePreviewAdapter.ts` owns Live Preview code block discovery, Shiki-rendered block mounting, raw-row preservation, surface syncing, and cleanup.
- `packages/obsidian/src/modes/SourceModeAdapter.ts` owns source-mode token decorations only. It must not create rendered block chrome or editor replacements.
- `packages/obsidian/src/modes/ReadingViewAdapter.ts` owns reading-mode rendering.
- `packages/obsidian/src/codeblocks/*` owns parsing, block identity, and block models.

### Required Verification Ladder
Dependency install:

```bash
rtk bun install
```

For normal code changes:

```bash
rtk bun run typecheck
rtk bun run test:unit
```

For built artifact and temporary-vault install checks:

```bash
rtk bun run test:integration
```

For architecture, source/live-preview, rendering, or startup changes:

```bash
rtk bun test tests/architecture-boundaries.test.ts
rtk bun run build
rtk bun run lint
```

For Live Preview scrolling, mobile-emulated, or mode-switch bugs:

```bash
rtk bun run test:bdd:scroll
```

For release-level confidence:

```bash
rtk bun run check
rtk bun run test:bdd
```

### Harness Layers
- `bun run test:unit` runs pure Bun tests for parser, rendering helpers, startup boundaries, architecture boundaries, and other non-Obsidian logic.
- `bun run test:integration` builds `dist/`, runs artifact assertions against the generated bundle, installs `main.js`, `manifest.json`, and `styles.css` into a temporary vault layout, enables the plugin in `community-plugins.json`, and removes the vault afterward.
- `bun run test:bdd` builds release artifacts, runs desktop BDD scenarios with `wdio.conf.mts`, then runs mobile-emulated BDD scenarios with `wdio.mobile.conf.mts`.
- `bun run test:bdd:desktop` builds release artifacts and runs WebdriverIO Cucumber with `wdio-obsidian-service`, excluding `@mobile`.
- `bun run test:bdd:mobile` builds release artifacts and runs only the `@mobile` WebdriverIO Cucumber scenarios with `wdio.mobile.conf.mts`, which launches Obsidian through `wdio-obsidian-service` with `emulateMobile: true`.
- `bun run test:bdd:scroll` builds release artifacts, runs desktop horizontal-scroll scenarios with `wdio.conf.mts`, then runs mobile-emulated horizontal-scroll scenarios with `wdio.mobile.conf.mts`.
- `bun run test:bdd:scroll:debug` runs the same horizontal-scroll verifier with `WDIO_OBSIDIAN_DEBUG_PAUSE_MS=30000`, pausing before scenario cleanup so the sandboxed WDIO Obsidian window remains visible for manual flicker and clipping inspection.
- `bun run test:e2e` and `bun run test:e2e:mobile` are compatibility aliases for the desktop and mobile BDD commands.
- `bun run ci` runs the non-GUI CI gate: formatting check, production build, lint, unit tests, artifact integration, startup benches, and temporary-vault integration.
- Android or iOS real-device automation is not part of this harness. Mobile coverage here is desktop Obsidian mobile emulation only.

### BDD and MCP Conventions
- Feature files live in `tests/bdd/features/`. Keep them product-readable and free of selectors, sleeps, and setup noise.
- Step definitions live in `tests/bdd/steps/`. Put reusable Obsidian interactions in `tests/bdd/pages/`.
- Keep related `.feature` files grouped in `wdio.conf.mts` so WDIO does not spawn a fresh Obsidian session per feature file.
- Mobile-emulated scenarios are tagged `@mobile` and run through `wdio.mobile.conf.mts`. The step asserts `app.isMobile === true`; it does not toggle mobile mode inside an already-running desktop WDIO session because Obsidian can replace the Electron web view and leave WebDriver attached to a dead target.
- Failure screenshots go to `tests/runtime-session/wdio-artifacts/`.
- `.mcp.json` exposes `wdio-mcp` through `npx -y @wdio/mcp` so MCP-aware agents can use WebdriverIO for interactive diagnostics.

### Runtime Harness Troubleshooting
- Local Obsidian defaults to `/Applications/Obsidian.app/Contents/MacOS/Obsidian`. Override with `OBSIDIAN_APP` when needed.
- WDIO Obsidian version can be overridden with `OBSIDIAN_WDIO_APP_VERSION`; installer version can be overridden with `OBSIDIAN_WDIO_INSTALLER_VERSION`.
- Runtime reports should go under `planning/test-reports/` or `tests/runtime-session/wdio-artifacts/`. Do not scatter screenshots or JSON summaries at the repo root.
- WDIO and `wdio-obsidian-service` are the automated desktop and mobile-emulated E2E entrypoints.
- Run mobile-tagged WDIO scenarios with `wdio.mobile.conf.mts`; do not run `@mobile` scenarios through `wdio.conf.mts`.
- WDIO launches the sandboxed vault `tests/wdio-vault/basic`, not the user's normal Obsidian vault. Normal runs may close the window before it is noticed; use `bun run test:bdd:scroll:debug` or set `WDIO_OBSIDIAN_DEBUG_PAUSE_MS=<ms>` for visible debugging.
- Do not spawn a second Obsidian instance.
- If a runtime check is skipped, report it explicitly.

### Live Preview Scroll Success Criteria
A fix is not complete unless the WDIO runtime verifier proves:

- the whole Live Preview code block scrolls horizontally as one block
- short lines move with long lines instead of scrolling independently
- Obsidian native note line numbers remain visible
- the block's internal Reading-mode-style line numbers remain visible
- note horizontal scroll remains zero
- desktop and mobile emulation both pass

### Change Discipline
- Touch only files required for the bug.
- Do not refactor unrelated code.
- Do not add debug globals, console spam, or broad DOM polling.
- Do not spawn a second Obsidian instance.
- If a runtime check is skipped, report it explicitly.
