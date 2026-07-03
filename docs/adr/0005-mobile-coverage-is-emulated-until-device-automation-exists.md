# Mobile Coverage Is Emulated Until Device Automation Exists

Status: proposed

Mobile coverage for this harness means desktop Obsidian after calling `app.emulateMobile(true)`. This boundary matters because emulation is valuable for Obsidian mobile code paths, but it is not proof of Android or iOS device behavior.

## Decision

- Mobile BDD scenarios must call `app.emulateMobile(true)` before mobile assertions.
- Teardown must call `app.emulateMobile(false)`.
- Reports must label this coverage as mobile-emulated.
- Do not claim real Android or iOS coverage unless a separate device or emulator automation harness is added.

## Consequences

Android and iOS automation remain future work, not a hidden promise of the WDIO desktop harness.
