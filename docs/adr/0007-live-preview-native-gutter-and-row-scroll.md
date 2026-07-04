# Live Preview Native Gutter and Row Scroll

Status: proposed

Live Preview code blocks must keep Obsidian's native note line numbers visible while also showing the plugin's internal code block line numbers. The previous hidden-gutter and per-row transform approach made native note line numbers disappear and allowed short lines to look disconnected from long lines during horizontal scroll.

## Decision

- Do not hide `.cm-lineNumbers` gutter rows for fenced code blocks in Live Preview.
- Keep internal block line numbers pinned inside the code block, matching Reading mode numbering.
- Synchronize horizontal scroll by applying the same native `scrollLeft` to every code row in the fenced block.
- Give every code row the same scrollable width so short and long rows move together.
- Keep Source mode as raw editable Markdown and keep Reading mode as the rendered reference layout.

## Consequences

Live Preview still uses native CodeMirror rows for editing and gutter behavior instead of replacing the fenced range with a rendered widget. This keeps the native note gutter real, avoids a second editor surface, and makes WDIO verify the user-visible behavior: native note line numbers remain visible, internal block line numbers remain visible, short and long code lines move together, and the surrounding note stays at horizontal scroll `0`.
