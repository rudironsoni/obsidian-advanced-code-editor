# Block-Owned Horizontal Scroll

Status: proposed

Fenced code blocks will own horizontal scrolling across Source mode, Live Preview, and Reading mode. Each overflowing block gets one visible native scrollbar at the bottom of the block because the current mix of hidden per-row Live Preview scroll and editor-wide Source mode scroll makes user behavior hard to reason about and hard to verify.

## Considered Options

- Keep hidden per-row scroll sync in Live Preview and editor-wide scroll in Source mode. Rejected because it preserves the current inconsistent behavior and hides the scroll affordance.
- Replace code blocks with custom editor surfaces. Rejected because Source mode must remain native CodeMirror Markdown editing and Monaco must not be mounted there.
- Use one native block-bottom scrollbar per overflowing fenced code block. Chosen because it is visible, theme-compatible, testable, and can share one user-facing model across modes.

## Decision

- The surrounding note or editor must keep `scrollLeft` at `0` when the user scrolls horizontally inside a code block.
- Live Preview and Reading mode keep rendered headers and line numbers pinned while code content moves.
- Multiple code blocks keep independent horizontal scroll positions.
- Horizontal scroll survives edits, token refresh, viewport changes, and mode class refreshes while the same block remains open and mounted.
- Horizontal scroll is not persisted across note close, vault reload, or Obsidian restart.
- Wrap-on scenarios should not require horizontal block scroll when wrapping removes overflow.
- Scrollbar styling uses Obsidian theme variables and must not hide native scrollbars.
