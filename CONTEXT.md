# Advanced Code Editor

This context defines the language for Obsidian code block rendering, scrolling, and automated verification in this plugin.

## Language

**Block-owned horizontal scroll**:
Horizontal scrolling belongs to the fenced code block that received the gesture. The surrounding note, editor, or workspace must not move horizontally.
_Avoid_: Note-owned scroll, editor-wide scroll, page horizontal scroll

**Block scrollbar**:
The single native horizontal scrollbar rendered at the bottom of an overflowing fenced code block.
_Avoid_: Fake scrollbar, synthetic scrollbar, per-row scrollbar

**Native row scroll**:
Horizontal movement produced by the browser's own row and scrollbar scroll positions rather than by visual offset tricks.
_Avoid_: Transform scroll, generated-style scroll, fake row movement

**Fenced code block**:
A Markdown code block delimited by opening and closing fences, including its optional language and metadata.
_Avoid_: Snippet, code widget

**Raw Source mode**:
The normal editable Markdown Source mode where fences and source text remain visible and editable.
_Avoid_: Source renderer, Source Monaco block

**Live Preview code block**:
A fenced code block shown inside Obsidian Live Preview, where the user edits Markdown while seeing plugin-rendered code block structure.
_Avoid_: Reading block, Source block

**Reading code block**:
A fenced code block rendered in Obsidian Reading mode.
_Avoid_: Live Preview block, Source block

**Pinned gutter**:
The line-number area that remains visually fixed while code content scrolls horizontally.
_Avoid_: Scrolling line numbers

**Pinned header**:
The rendered code block header that remains visually fixed while code content scrolls horizontally.
_Avoid_: Scrolling header

**Open-block persistence**:
Horizontal scroll position preserved only while the same block remains open and mounted in the current editor session.
_Avoid_: Session persistence, restart persistence, saved scroll state

**Render churn**:
Normal Obsidian or plugin updates that refresh code block DOM without intentionally replacing the user-visible block.
_Avoid_: Full reload, restart

**Gesture hot path**:
The smallest interaction path that runs while a wheel, pointer, or touch gesture is actively moving a code block horizontally.
_Avoid_: Refresh path, measurement path, cleanup path

**Measurement phase**:
A coordinated read/write pass used to calculate scroll dimensions and apply derived layout state outside the gesture hot path.
_Avoid_: Gesture measurement, ad hoc layout read

**Exact edit after scroll**:
A verification behavior where a test scrolls horizontally, clicks or taps a visible marker, inserts text, and verifies the file changed at the expected line and column.
_Avoid_: Approximate click check, visual-only edit check

**Mobile-emulated coverage**:
Coverage from desktop Obsidian after calling `app.emulateMobile(true)`.
_Avoid_: Android coverage, iOS coverage, real-device coverage

**Trace package**:
The failure artifact set for a WDIO scenario, including screenshots, structured scroll state, DOM-derived measurements, and WDIO logs.
_Avoid_: Screenshot-only evidence

**Canonical acceptance layer**:
The test layer whose passing scenarios define whether a user-visible behavior is accepted.
_Avoid_: Smoke-only check, helper script

**Single Obsidian session**:
A test run model where related WDIO scenarios reuse one launched Obsidian instance instead of starting a new instance per feature, scenario, or mode.
_Avoid_: Per-scenario launch, parallel Obsidian launch

**Scroll responsiveness**:
The user-visible ability to keep Obsidian interactive while repeatedly scrolling an overflowing code block horizontally.
_Avoid_: Dispatch-only performance, synthetic smoothness

**Performance regression gate**:
An automated acceptance check that fails when horizontal-scroll responsiveness becomes slower than the agreed budget or slower than the same-run reference surface.
_Avoid_: Best-effort benchmark, informational metric

**Same-run reference surface**:
A behaviorally comparable rendering mode measured in the same WDIO run to keep performance assertions tied to the current machine and Obsidian session.
_Avoid_: Historical baseline, static benchmark

**Runtime visual parity**:
User-visible agreement between Reading mode, Live Preview, and Raw Source mode for Shiki token ownership, theme background, gutters, and code block controls.
_Avoid_: Screenshot-only parity, unit-test parity

**Beta release path**:
The documented workflow that turns a verified implementation batch into a GitHub prerelease that BRAT can install.
_Avoid_: Ad hoc beta, local-only release

**Enhancement batch**:
A coherent set of product-facing improvements built only after the relevant runtime gates protect the behavior being changed.
_Avoid_: Opportunistic feature change, unguarded polish
