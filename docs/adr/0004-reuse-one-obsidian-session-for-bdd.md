# Reuse One Obsidian Session Per WDIO Command

Status: proposed

Each WDIO command will run with `maxInstances: 1` so a single Obsidian instance owns that command's setup, scenarios, debugging, and cleanup. Desktop and mobile-emulated scenarios use different WDIO configs because reliable mobile emulation must be selected before Obsidian boots.

## Decision

- Keep WDIO `maxInstances: 1` in all configs.
- Group related feature files so one worker owns each desktop or mobile run.
- Run desktop scenarios through `wdio.conf.mts`.
- Run mobile-emulated scenarios through `wdio.mobile.conf.mts`, which sets `wdio-obsidian-service` `emulateMobile: true` at launch.
- Do not toggle mobile emulation inside an already-running desktop WDIO session. Obsidian can replace the Electron web view during runtime mobile toggles and leave WebDriver attached to a dead target.
- Do not start one Obsidian instance per feature or scenario.

## Consequences

Full BDD commands may run one desktop Obsidian session followed by one mobile-emulated Obsidian session. This is a deliberate reliability tradeoff. It avoids the repeated launch per scenario problem while also avoiding runtime mobile toggles that produce `no such window` or `web view not found` WDIO failures.
