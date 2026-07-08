# Native API Scroll Performance

Status: accepted

Live Preview horizontal scroll performance must improve without replacing native row scroll with transform or generated-style tricks. The plugin will keep native `scrollLeft` as the rendering mechanism, use Obsidian's editor-extension registration and CodeMirror's per-view event and measurement APIs, and add performance regression gates that prove Obsidian remains responsive after stress scrolling.

## Considered Options

- Transform or generated stylesheet based visual scrolling. Rejected because it already caused real Obsidian hangs and moves work into style recalculation/compositing instead of reducing risk.
- Keep raw DOM listeners and ad hoc layout reads. Rejected because it makes scroll performance depend on unsynchronized event timing and can mix layout reads with gesture writes.
- Use Obsidian registration plus CodeMirror event handlers, observers, and `requestMeasure`. Chosen because Live Preview scroll lives inside a CodeMirror editor view, while Obsidian owns plugin registration and runtime verification.

## Decision

- Obsidian still owns editor integration through `registerEditorExtension`; the scroll subsystem stays inside the CodeMirror extension registered from there.
- Wheel, pointer, and touch gesture routing uses CodeMirror `ViewPlugin` event handlers or observers rather than broad root-level gesture listeners.
- Native `scroll` observation may use narrowly scoped row or scrollbar listeners only when CodeMirror cannot directly own the descendant scroll event, and those listeners must have explicit teardown.
- Layout reads use `EditorView.requestMeasure` read phases, and derived spacer or visibility writes use the matching write phase.
- Horizontal-scroll hot paths stay native and only write row and scrollbar `scrollLeft`.
- Gesture hot paths must not read layout, refresh block caches, or update spacer CSS variables.
- Gesture bursts are coalesced so repeated wheel, pointer, or touch packets do not rewrite every mounted code row more than once per animation frame.
- Performance acceptance must include same-run Reading mode comparison, desktop and mobile-emulated stress scrolling, and an Obsidian responsiveness probe after stress scroll.

## Consequences

Future scroll-performance fixes must first prove they do not reintroduce transform/style-injection behavior, `will-change`, layout reads inside gesture handlers, spacer updates inside gesture sync, or pass-only BDD checks that miss an unresponsive Obsidian window.
