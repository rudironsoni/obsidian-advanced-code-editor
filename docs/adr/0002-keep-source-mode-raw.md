# Keep Source Mode Raw

Status: proposed

Source mode remains native CodeMirror Markdown editing. It may use token mark decorations for syntax color, but it must not gain plugin-owned block scroll rows, block-bottom scrollbar widgets, rendered headers, copy controls, or internal block line numbers. Replacing Source mode blocks with rendered surfaces or Monaco editors would make editing behavior harder to trust and would conflict with the existing rule that Monaco editor creation stays out of Source mode.

## Decision

- Fences and Markdown source text stay visible and editable in Source mode.
- Source mode may use token decorations.
- Source mode must not mount Monaco.
- Source mode must not replace fenced code blocks with rendered Shiki block widgets.
- Source mode must not use Live Preview or Reading mode block chrome, including internal block line numbers or block-bottom scrollbar widgets.

## Consequences

Source mode implementation stays at the token-decoration layer. Horizontal scroll acceptance for plugin-owned block scroll applies to rendered Live Preview and Reading surfaces, while Source mode acceptance verifies raw Markdown editing, native Obsidian editor gutters, no Monaco, and no rendered block chrome.
