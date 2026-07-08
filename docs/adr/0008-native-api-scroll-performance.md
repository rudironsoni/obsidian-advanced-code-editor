# Native API Scroll Performance

Status: proposed

Live Preview horizontal scroll performance must improve without replacing native row scroll with transform or generated-style tricks. The plugin will keep native `scrollLeft` as the rendering mechanism, use Obsidian's editor-extension registration and CodeMirror's per-view event and measurement APIs, and add performance regression gates that prove Obsidian remains responsive after stress scrolling.

## Considered Options

- Transform or generated stylesheet based visual scrolling. Rejected because it already caused real Obsidian hangs and moves work into style recalculation/compositing instead of reducing risk.
- Keep raw DOM listeners and ad hoc layout reads. Rejected because it makes scroll performance depend on unsynchronized event timing and can mix layout reads with gesture writes.
- Use Obsidian registration plus CodeMirror event handlers, observers, and `requestMeasure`. Chosen because Live Preview scroll lives inside a CodeMirror editor view, while Obsidian owns plugin registration and runtime verification.

## Decision

- Horizontal-scroll hot paths stay native and only write row and scrollbar `scrollLeft`.
- Measurement of row widths, scrollbar widths, spacer CSS variables, and visibility is scheduled through CodeMirror measurement phases.
- Gesture bursts are coalesced so repeated wheel, pointer, or touch packets do not rewrite every mounted code row more than once per animation frame.
- Performance acceptance must include same-run Reading mode comparison, desktop and mobile-emulated stress scrolling, and an Obsidian responsiveness probe after stress scroll.

## Consequences

Future scroll-performance fixes must first prove they do not reintroduce transform/style-injection behavior, layout reads inside gesture handlers, or pass-only BDD checks that miss an unresponsive Obsidian window.
