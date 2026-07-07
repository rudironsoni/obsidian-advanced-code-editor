# 41.12+ Merge Intervals






```csharp
List<int[]> intervals = [[1, 3], [2, 6], [8, 10]];

List<int[]> expectedResult = [[1, 6], [8, 10]];

// Define constants for start and end indices
var startIndex = 0;
var endIndex = 1;

// Sort the intervals based on their start values
intervals.Sort((a, b) => a[startIndex] - b[startIndex]);

// Initialize an array to store the merged intervals
List<int[]> mergedIntervals = new();

// Initialize variables to track the current merge range
var mergeStart = intervals[0][startIndex];
var mergeEnd = intervals[0][endIndex];
```
