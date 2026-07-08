---
name: obsidian-cli
description: >-
    Use the Obsidian CLI to inspect a running advanced-code-block Obsidian plugin
    session during development. Covers plugin reloads, console/errors, runtime
    evaluation, settings tab checks, reading-mode and live-preview syntax
    highlighting, screenshots, and mobile emulation with app.emulateMobile(true).
    Use WebdriverIO for automated runtime acceptance.
metadata:
    author: obsidian-advanced-code-editor
    version: '1.2'
---

# Obsidian CLI For Advanced Code Editor

Use this skill to inspect a running Obsidian instance while developing `advanced-code-block`.
Prefix shell commands with `rtk` in this repo.

## Essentials

```bash
rtk obsidian plugin:reload id=advanced-code-block
rtk obsidian dev:errors
rtk obsidian dev:console level=error
rtk obsidian commands filter=advanced-code-block
rtk obsidian command id=advanced-code-block:reload-highlighter
```

`plugin:reload` can return success even when plugin load threw. Always follow with `dev:errors` or `dev:console level=error`.

## Runtime State

```bash
rtk obsidian eval code="app.plugins.plugins['advanced-code-block'] !== undefined"
rtk obsidian eval code="JSON.stringify(app.plugins.plugins['advanced-code-block'].settings, null, 2)"
rtk obsidian eval code="app.plugins.plugins['advanced-code-block'].highlighter !== undefined"
rtk obsidian eval code="app.vault.getName()"
```

Open settings:

```bash
rtk obsidian eval code="app.setting.open(); app.setting.openTabById('advanced-code-block')"
rtk obsidian dev:screenshot path=planning/test-reports/settings.png
```

## Syntax Highlighting Checks

Reading mode should render Expressive Code blocks:

```bash
rtk obsidian dev:dom selector="div.expressive-code" text
rtk obsidian dev:dom selector="div.expressive-code pre code" text
```

Live Preview should show token styling in the editor:

```bash
rtk obsidian dev:dom selector=".cm-content [style*='color'], .cm-content [class*='shiki']" text
```

Inline highlighting should render only `{lang} code` inline spans:

```bash
rtk obsidian dev:dom selector=".shiki-inline" text
```

When screenshots are needed:

```bash
rtk obsidian dev:screenshot path=planning/test-reports/live-preview.png
```

## Mobile Emulation

Use the official Obsidian runtime API when possible. This executes mobile-guarded paths by setting `app.isMobile`:

```bash
rtk obsidian eval code="app.emulateMobile(true)"
rtk obsidian plugin:reload id=advanced-code-block
rtk obsidian dev:screenshot path=planning/test-reports/mobile.png
rtk obsidian eval code="app.emulateMobile(false)"
```

If using CLI support, pass an explicit state and never rely on toggle behavior:

```bash
rtk obsidian dev:mobile on
rtk obsidian plugin:reload id=advanced-code-block
rtk obsidian dev:mobile off
```

## Automated Runtime Checks

Use WebdriverIO package scripts for automated interaction checks. Do not add CDP probes for runtime acceptance.

```bash
rtk bun run test:bdd
rtk bun run test:bdd:scroll
```

## Footguns

- Confirm `app.vault.getName()` before destructive actions.
- `dev:mobile` or `app.emulateMobile(true)` persists until turned off.
- CSS variable token colors are expected when the plugin uses the built-in Obsidian theme.
- A blank screenshot usually means UI did not settle. Inspect DOM before retesting.

## Resource Rules

- **One Obsidian instance only.** Never spawn a second instance. WDIO tests must run with `maxInstances: 1` and reuse the same Obsidian session across setup, debugging, and verification.
- If an instance is already running, reuse it: reload plugin, re-copy plugin files into the existing vault, and reload the test note.
- If you accidentally launch twice, kill the duplicate. Never leave orphan processes.
- `plugin:reload` is cheap and idempotent. Prefer it over relaunching Obsidian.
