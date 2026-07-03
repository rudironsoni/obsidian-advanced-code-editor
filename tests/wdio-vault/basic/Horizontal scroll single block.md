# Horizontal scroll single block

This fixture verifies that one overflowing fenced code block owns horizontal scroll.

```ts title="Block owned horizontal scroll"
const horizontalScrollAnchor =
	'alpha-0123456789-beta-0123456789-gamma-0123456789-delta-0123456789-epsilon-0123456789-zeta-0123456789-eta-0123456789-theta-0123456789';
const exactEditTarget =
	'HORIZONTAL_SCROLL_MARKER: keep this marker on a very long line so the editor must scroll horizontally before the edit lands in the intended place';
const followupValue = horizontalScrollAnchor + exactEditTarget + 'omega-0123456789-omega-0123456789-omega-0123456789';
```

After the block.
