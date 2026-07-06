# C# token slicing fixture

```csharp
List<int[]> intervals = [[1, 3], [2, 6]];

// Define constants for start and end indices
var startIndex = 0; var endIndex = 1;
intervals.Sort((a, b) => a[startIndex] - b[startIndex]);
```
