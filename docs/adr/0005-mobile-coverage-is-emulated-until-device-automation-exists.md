# Mobile Coverage Is Emulated Until Device Automation Exists

Status: proposed

Mobile coverage for this harness means desktop Obsidian booted by `wdio-obsidian-service` with `emulateMobile: true`. This exercises Obsidian's mobile UI code path on the Electron desktop app, but it is not proof of Android or iOS device behavior.

## Decision

- Mobile BDD scenarios must run through `wdio.mobile.conf.mts`.
- `wdio.mobile.conf.mts` must set `wdio:obsidianOptions.emulateMobile` to `true`.
- The mobile step asserts `app.isMobile === true`; it must not call `app.emulateMobile(true)` at runtime.
- Teardown does not call `app.emulateMobile(false)` for service-booted mobile sessions. The isolated WDIO session ends in mobile mode.
- Reports must label this coverage as mobile-emulated.
- Do not claim real Android or iOS coverage unless a separate device or emulator automation harness is added.

## Consequences

Android and iOS automation remain future work, not a hidden promise of the WDIO desktop harness. Runtime mobile toggles are intentionally avoided because they can replace Obsidian's Electron web view and cause WDIO `no such window` failures.
