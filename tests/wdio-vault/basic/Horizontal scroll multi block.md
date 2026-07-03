# Horizontal scroll multi block

This fixture verifies independent horizontal scroll positions for neighboring fenced code blocks.

```ts title="First independent block"
const firstBlockAnchor = 'first-0123456789-first-0123456789-first-0123456789-first-0123456789-first-0123456789-first-0123456789-first-0123456789';
const firstBlockTail = firstBlockAnchor + 'FIRST_BLOCK_SCROLL_TARGET';
```

Text between the blocks keeps the note readable.

```ts title="Second independent block"
const secondBlockAnchor =
	'second-abcdefghijklmnopqrstuvwxyz-second-abcdefghijklmnopqrstuvwxyz-second-abcdefghijklmnopqrstuvwxyz-second-abcdefghijklmnopqrstuvwxyz';
const secondBlockTail = secondBlockAnchor + 'SECOND_BLOCK_SCROLL_TARGET';
```
