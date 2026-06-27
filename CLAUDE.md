<!-- headroom:rtk-instructions -->

# RTK (Rust Token Killer) - Token-Optimized Commands

When running shell commands, **always prefix with `rtk`**. This reduces context
usage by 60-90% with zero behavior change. If rtk has no filter for a command,
it passes through unchanged — so it is always safe to use.

## Key Commands

```bash
# Git (59-80% savings)
rtk git status          rtk git diff            rtk git log

# Files & Search (60-75% savings)
rtk ls <path>           rtk read <file>         rtk grep <pattern>
rtk find <pattern>      rtk diff <file>

# Test (90-99% savings) — shows failures only
rtk pytest tests/       rtk cargo test          rtk test <cmd>

# Build & Lint (80-90% savings) — shows errors only
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

- In command chains, prefix each segment: `rtk git add . && rtk git commit -m "msg"`
- For debugging, use raw command without rtk prefix
- `rtk proxy <cmd>` runs command without filtering but tracks usage

## Resource Rules

- **One Obsidian instance only.** Never spawn a second. Before launching, check `lsof -i :9230` or the helper's `isObsidianRunning()` check.
- If an instance is already running, reuse it: reload the plugin, re-copy plugin files into the existing vault, reload the test note. Do not create a new vault, user-data-dir, or `--user-data-dir`.
- If you accidentally launch twice, kill the duplicate. Never leave orphan processes.
- `plugin:reload` is cheap and idempotent. Prefer it over relaunching Obsidian.
- Visual-test scripts must probe the CDP port first and skip `spawn()` when a target is alive.
<!-- /headroom:rtk-instructions -->

## Project-Specific Rules
This is an Obsidian plugin. Do not claim UI or runtime bugs are fixed from unit tests alone.

### Architecture
- `packages/obsidian/src/main.ts` owns plugin lifecycle, registration, settings, and reload orchestration.
- `packages/obsidian/src/codemirror/Cm6_ViewPlugin.ts` owns CodeMirror extension wiring and decoration refresh.
- `packages/obsidian/src/modes/LivePreviewAdapter.ts` owns Live Preview code block discovery, Monaco widget mounting, raw-row hiding, surface syncing, and cleanup.
- `packages/obsidian/src/modes/SourceModeAdapter.ts` owns source-mode token decorations only. It must not create Monaco editors.
- `packages/obsidian/src/modes/ReadingViewAdapter.ts` owns reading-mode rendering.
- `packages/obsidian/src/monaco/MonacoCodeBlockSurface.ts` is the only place that may create Monaco editors.
- `packages/obsidian/src/codeblocks/*` owns parsing, block identity, and block models.

### Required Verification Ladder
For normal code changes:

```bash
rtk bun run typecheck
rtk bun test
```

For architecture, source/live-preview, Monaco, or startup changes:

```bash
rtk bun test tests/architecture-boundaries.test.ts
rtk bun run build
rtk bun run lint
```

For Live Preview redraw, Monaco mounting, scrolling, mobile, or mode-switch bugs:

```bash
rtk bun run verify:obsidian-live-preview-redraw-loop
rtk bun run verify:obsidian-monaco-mobile-rendering
```

For release-level confidence:

```bash
rtk bun run check
rtk env OBSIDIAN_VERIFY_BRAT_INSTALL=true bun run verify:obsidian-real
```

### Live Preview Redraw-Loop Success Criteria
A fix is not complete unless the runtime verifier proves:

- exactly one `.shiki-monaco-live-widget`
- exactly one Monaco host inside that widget
- exactly one `.monaco-editor`
- raw CodeMirror code rows are hidden after Monaco is ready
- Monaco host is not recreated during stability sampling
- Monaco host height and top do not jitter
- note horizontal scroll remains zero
- desktop and mobile emulation both pass

### Change Discipline
- Touch only files required for the bug.
- Do not refactor unrelated code.
- Do not add debug globals, console spam, or broad DOM polling.
- Do not spawn a second Obsidian instance.
- Reuse the existing CDP port and test vault.
- If a runtime check is skipped, report it explicitly.
