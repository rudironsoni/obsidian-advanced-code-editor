# Block-Owned Horizontal Scroll

Status: proposed

Fenced code blocks will own horizontal scrolling in Live Preview and Reading mode. Each overflowing rendered block gets one visible native scrollbar at the bottom of the block because hidden per-row Live Preview scroll makes user behavior hard to reason about and hard to verify.

Source mode is the exception. It remains native editable CodeMirror Markdown and must not receive rendered block scroll rows, block-bottom scrollbar widgets, internal block line numbers, headers, or copy controls.

## Considered Options

- Keep hidden per-row scroll sync in Live Preview. Rejected because it preserves inconsistent behavior and hides the scroll affordance.
- Replace Source mode code blocks with custom editor surfaces or rendered block scroll rows. Rejected because Source mode must remain native CodeMirror Markdown editing and Monaco must not be mounted there.
- Use one native block-bottom scrollbar per overflowing fenced code block. Chosen because it is visible, theme-compatible, testable, and can share one user-facing model across modes.

## Decision

- The surrounding note or editor must keep `scrollLeft` at `0` when the user scrolls horizontally inside a rendered code block.
- Live Preview and Reading mode keep rendered headers and line numbers pinned while code content moves.
- Source mode keeps raw fences and source text visible and editable. It relies on native editor behavior instead of plugin-owned rendered block scroll chrome.
- Multiple code blocks keep independent horizontal scroll positions.
- Horizontal scroll survives edits, token refresh, viewport changes, and mode class refreshes while the same block remains open and mounted.
- Horizontal scroll is not persisted across note close, vault reload, or Obsidian restart.
- Wrap-on scenarios should not require horizontal block scroll when wrapping removes overflow.
- Scrollbar styling uses Obsidian theme variables and must not hide native scrollbars.
