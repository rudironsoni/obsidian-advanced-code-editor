# Syntax language matrix

<!-- prettier-ignore-start -->

```cs
List<int[]> mergedIntervals = new();
var mergeEnd = Math.Max(mergeStart, 10);
```

```ts
type User = { id: number; name: string };
const user: User = { id: 1, name: "Rudi" };
```

```js
const result = items.map(item => item.id);
console.log(result);
```

```py
def merge(values: list[int]) -> list[int]:
    return sorted(values)
```

```rs
fn merge(values: Vec<i32>) -> Vec<i32> {
    values.into_iter().collect()
}
```

```go
func Merge(values []int) []int {
    return append([]int{}, values...)
}
```

```json
{
  "enabled": true,
  "count": 3
}
```

```yml
enabled: true
count: 3
items:
  - alpha
```

```bash
for file in *.md; do echo "$file"; done
```

```html
<section class="note"><h1>Title</h1></section>
```

```css
.note { color: rebeccapurple; display: grid; }
```

<!-- prettier-ignore-end -->
