# Metadata parity

```ts title="Parity metadata block" showLineNumbers {2} ins={3} del={4}
const stable = 1;
const highlighted = stable + 1;
const inserted = highlighted + 1;
const deleted = inserted + 1;
```

```diff title="Diff metadata block" showLineNumbers
 unchanged
+added line
-removed line
```
