# BDD WebdriverIO Harness

This harness uses WebdriverIO Cucumber with `wdio-obsidian-service` to run real Obsidian against built plugin artifacts.

## Commands

```bash
bun install
bun run build
bun run test:bdd
bun run test:bdd:desktop
bun run test:bdd:mobile
```

`bun run test:e2e` aliases `bun run test:bdd:desktop`. `bun run test:e2e:mobile` aliases `bun run test:bdd:mobile`.

Prefer `bun run test:bdd` when validating the full BDD layer. It groups the desktop and mobile-emulated feature files into one WebdriverIO worker so one Obsidian session is reused.

## Structure

- `features/` contains Gherkin behavior descriptions.
- `steps/` maps product-readable steps to reusable typed implementation.
- `pages/` contains Obsidian runtime helpers and DOM queries.
- `support/` contains Cucumber hooks and failure artifact handling.
- `../wdio-vault/basic/` is the deterministic fixture vault used by `wdio-obsidian-service`.

## Runtime Model

The package scripts build `dist/` first. `wdio-obsidian-service` then launches a sandboxed Obsidian instance with `plugins: ['dist']` and vault `tests/wdio-vault/basic`. Tests assert the built payload that would be released: `main.js`, `manifest.json`, and `styles.css`.

Desktop and mobile-emulated scenarios run from `wdio.conf.mts`. The config groups the feature files so WDIO keeps them in one worker/session instead of launching Obsidian once per feature file. Mobile-emulated scenarios are tagged `@mobile`; the step calls `app.emulateMobile(true)` and teardown resets it with `app.emulateMobile(false)`. This is Obsidian desktop mobile emulation. It is not real Android or iOS coverage.

Failure screenshots are saved to `tests/runtime-session/wdio-artifacts/`.

## Migration Map

- Previous WDIO smoke spec `tests/e2e/shiki-rendering.e2e.ts`, plugin load assertion: `features/plugin-loads.feature`.
- Previous WDIO smoke spec `tests/e2e/shiki-rendering.e2e.ts`, reading-mode render assertion: `features/rendering.feature`.
- Previous WDIO mobile smoke path: `features/mobile-emulation.feature`.
- Pure parser, render-helper, startup-boundary, cache, theme bridge, and architecture tests remain in Bun under `tests/*.test.ts` because they are faster and stronger as pure support tests than as real Obsidian scenarios.
- Temporary-vault release artifact installation remains in `tests/integration/release-install.test.ts` because it verifies filesystem layout without paying Obsidian startup cost.

## Adding Scenarios

Add user-visible behavior to a `.feature` file. Keep selectors, sleeps, setup noise, and implementation details out of Gherkin. Put reusable Obsidian interactions in `pages/`, then bind them in `steps/`.

Prefer stable Obsidian runtime APIs, accessible labels, command palette interactions, or plugin-owned stable hooks. Do not depend on a user's real vault or personal Obsidian state.

## MCP

This repository exposes WebdriverIO MCP in `.mcp.json` as `wdio-mcp`:

```json
{
	"command": "npx",
	"args": ["-y", "@wdio/mcp"]
}
```

Agents that support MCP should restart after loading the repo config, then use `wdio-mcp` for interactive browser or mobile automation diagnostics. The automated BDD suite still runs through the package scripts above.

## Troubleshooting

- Override Obsidian version with `OBSIDIAN_WDIO_APP_VERSION` or installer version with `OBSIDIAN_WDIO_INSTALLER_VERSION`.
- Keep `WDIO_MAX_INSTANCES=1` unless the suite is explicitly made parallel-safe.
- If Obsidian cannot launch locally, check for a conflicting instance on CDP port `9230` and stop the personal vault before running WDIO.
- If a Cucumber step is undefined, compare the exact Gherkin sentence with `tests/bdd/steps/*.ts`.
- If rendering times out, inspect screenshots in `tests/runtime-session/wdio-artifacts/` and then use the custom CDP verifiers for deeper Live Preview or Monaco diagnosis.
- CI should run non-GUI checks by default. Desktop Obsidian E2E needs a runner that can launch Electron.
