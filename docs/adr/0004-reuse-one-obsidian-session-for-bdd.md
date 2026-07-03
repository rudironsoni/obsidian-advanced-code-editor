# Reuse One Obsidian Session for BDD

Status: proposed

The WDIO BDD suite will reuse one Obsidian session for related desktop and mobile-emulated scenarios. This is a resource decision because repeatedly launching Obsidian is slow, noisy, and has already created risk around duplicate instances and orphaned runtime state.

## Decision

- Keep WDIO `maxInstances` at `1` for this harness.
- Group related feature files in WDIO config so one worker owns the run.
- Do not start one Obsidian instance per feature, scenario, mode, or mobile-emulated check.
- Reset Obsidian state inside the running session through reloads, fixture notes, settings, and `app.emulateMobile(false)`.

## Consequences

Scenarios must be isolated by fixture vault state and teardown, not by launching fresh Obsidian processes.
