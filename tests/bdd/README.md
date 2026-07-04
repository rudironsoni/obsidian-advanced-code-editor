# BDD WebdriverIO Harness

This harness uses WebdriverIO Cucumber with `wdio-obsidian-service` to run real Obsidian against built plugin artifacts.

For domain language, read `CONTEXT.md`. For durable horizontal-scroll decisions, read `docs/adr/`.

## Commands

```bash
bun install
bun run build
bun run test:bdd
bun run test:bdd:desktop
bun run test:bdd:mobile
bun run test:bdd:scroll
bun run test:bdd:scroll:debug
```

`bun run test:e2e` aliases `bun run test:bdd:desktop`.
`bun run test:e2e:mobile` aliases `bun run test:bdd:mobile`.

Prefer `bun run test:bdd` when validating the full BDD layer. It groups desktop and mobile-emulated feature files into one WebdriverIO worker so one Obsidian session is reused.

`bun run test:bdd:scroll` is the canonical horizontal-scroll acceptance verifier. It builds the plugin and runs WDIO Cucumber scenarios tagged `@horizontal-scroll`. Keep the horizontal-scroll desktop and mobile-emulated scenarios in the grouped WDIO run so the same Obsidian session is reused.

`bun run test:bdd:scroll:debug` runs the same scroll verifier with `WDIO_OBSIDIAN_DEBUG_PAUSE_MS=30000`. The hook pauses before horizontal-scroll cleanup so the sandboxed Obsidian window stays visible long enough to inspect flicker, clipping, and scroll position. Increase the hold when needed:

```bash
WDIO_OBSIDIAN_DEBUG_PAUSE_MS=120000 bun run test:bdd:scroll
```

## Structure

- `features/` contains Gherkin behavior descriptions.
- `steps/` maps product-readable steps to reusable typed implementation.
- `pages/` contains Obsidian runtime helpers and DOM queries.
- `support/` contains Cucumber hooks and failure artifact handling.
- `../wdio-vault/basic/` is the deterministic fixture vault used by `wdio-obsidian-service`.

## Runtime Model

Package scripts build `dist/` first. `wdio-obsidian-service` then launches a sandboxed Obsidian instance with `plugins: ['dist']` and vault `tests/wdio-vault/basic`. Tests assert the built payload that would be released: `main.js`, `manifest.json`, and `styles.css`.

This sandboxed WDIO vault is not the user's normal Obsidian vault. The Obsidian window may appear only briefly during a normal run because WebdriverIO closes the session after the scenarios finish. Use `bun run test:bdd:scroll:debug` when the window must remain visible for manual inspection.

Desktop and mobile-emulated scenarios run from `wdio.conf.mts`. The config groups feature files so WDIO keeps them in one worker/session instead of launching Obsidian once per feature file.

Mobile-emulated scenarios are tagged `@mobile`; steps call `app.emulateMobile(true)` and teardown resets it with `app.emulateMobile(false)`. This is Obsidian desktop mobile emulation. It is not real Android or iOS coverage.

Failure screenshots and structured JSON are saved to `tests/runtime-session/wdio-artifacts/`.

## Migration Map

- Previous WDIO smoke spec `tests/e2e/shiki-rendering.e2e.ts`, plugin load assertion: `features/plugin-loads.feature`.
- Previous WDIO smoke spec `tests/e2e/shiki-rendering.e2e.ts`, reading-mode render assertion: `features/rendering.feature`.
- Previous WDIO mobile smoke path: `features/mobile-emulation.feature`.
- Pure parser, render-helper, startup-boundary, cache, theme bridge, and architecture tests remain in Bun under `tests/*.test.ts` because they are faster and stronger as pure support tests than real Obsidian scenarios.
- Temporary-vault release artifact installation remains in `tests/integration/release-install.test.ts` because it verifies filesystem layout without paying Obsidian startup cost.

## Adding Scenarios

Add user-visible behavior in a `.feature` file. Keep selectors, sleeps, setup noise, and implementation details out of Gherkin. Put reusable Obsidian interactions in `pages/`, then bind them in `steps/`.

Prefer stable Obsidian runtime APIs, accessible labels, command palette interactions, or plugin-owned stable hooks. Do not depend on the user's real vault or personal Obsidian state.

## MCP

This repository exposes WebdriverIO MCP in `.mcp.json` as `wdio-mcp`:

```json
{
	"command": "npx",
	"args": ["-y", "@wdio/mcp"]
}
```

For agents that support MCP repo config, restart after repo config changes and use `wdio-mcp` for interactive WebdriverIO diagnostics. The automated BDD suite still runs through the package scripts above.

## Troubleshooting

- Override Obsidian app version with `OBSIDIAN_WDIO_APP_VERSION` and installer version with `OBSIDIAN_WDIO_INSTALLER_VERSION`.
- Override local Obsidian paths with `OBSIDIAN_APP` and `OBSIDIAN_APP_ASAR`.
- Keep `maxInstances: 1`; this harness is designed to reuse one Obsidian session.
- If Obsidian cannot launch locally, stop personal Obsidian before running WDIO so the suite owns one isolated Obsidian session.
- If Cucumber reports an undefined step, compare the exact Gherkin sentence with `tests/bdd/steps/*.ts`.
- If rendering times out or flickers, inspect screenshots and structured JSON in `tests/runtime-session/wdio-artifacts/`, then add or tighten WDIO page-object assertions that cover the missing behavior.
- CI should run non-GUI checks by default. Desktop Obsidian E2E and mobile-emulated WDIO scenarios need a runner that can launch Electron.
