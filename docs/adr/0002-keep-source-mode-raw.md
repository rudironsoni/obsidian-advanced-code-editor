# Keep Source Mode Raw

Status: proposed

Source mode will remain native CodeMirror Markdown editing while gaining block-owned horizontal scroll metadata and a block-bottom scrollbar for fenced code blocks. This is a deliberate boundary decision because replacing Source mode blocks with rendered surfaces or Monaco editors would make editing behavior harder to trust and would conflict with the existing rule that Monaco editor creation stays out of Source mode.

## Decision

- Fences and Markdown source text stay visible and editable in Source mode.
- Source mode may use token decorations and block scroll affordances.
- Source mode must not mount Monaco.
- Source mode must not replace fenced code blocks with rendered Shiki block widgets.

## Consequences

Source mode implementation has to synchronize horizontal scroll through CodeMirror rows and block widgets instead of using a custom editor surface.
