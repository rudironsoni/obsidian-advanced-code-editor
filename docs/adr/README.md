# ADRs

Architecture decision records repository.

- `0001-block-owned-horizontal-scroll.md`: make rendered fenced code blocks own horizontal scrolling in Live Preview and Reading mode while keeping Source mode native.
- `0002-keep-source-mode-raw.md`: keep Source mode native editable Markdown, token-decoration only, with Monaco and rendered block chrome out of it.
- `0003-wdio-bdd-is-horizontal-scroll-acceptance.md`: make WDIO Cucumber the canonical acceptance layer for horizontal-scroll behavior.
- `0004-reuse-one-obsidian-session-for-bdd.md`: run one Obsidian session per WDIO command and use separate desktop and mobile configs.
- `0005-mobile-coverage-is-emulated-until-device-automation-exists.md`: label mobile coverage as service-booted desktop Obsidian mobile emulation until real device automation exists.
- `0006-pr-only-gui-bdd-ci.md`: run GUI WDIO BDD on pull requests, `master`, and manual dispatch, not on every branch push.
- `0007-live-preview-native-gutter-and-row-scroll.md`: keep native Obsidian note gutters visible and synchronize Live Preview code rows so short and long lines scroll together.
- `0008-native-api-scroll-performance.md`: improve Live Preview horizontal-scroll responsiveness through native row scroll, CodeMirror event and measurement APIs, and hard performance regression gates.
- `0009-reliability-gates-before-enhancements.md`: finish runtime reliability, visual parity, and beta-release gates before adding new user-facing enhancement batches.
