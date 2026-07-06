# C# token slicing fixture

```csharp
public sealed class Solution
{
    public int[][] Merge(int[][] intervals)
    {
        // Define constants for start and end indices before sorting and merging intervals.
        const int startIndex = 0;
        const int endIndex = 1;
        var mergedIntervals = new List<int[]>();
        var orderedIntervals = intervals.OrderBy(interval => interval[startIndex]).ThenBy(interval => interval[endIndex]).ToArray();
        var currentInterval = new[] { orderedIntervals[0][startIndex], orderedIntervals[0][endIndex] };

        foreach (var interval in orderedIntervals)
        {
            if (interval[startIndex] <= currentInterval[endIndex])
            {
                currentInterval[endIndex] = Math.Max(currentInterval[endIndex], interval[endIndex]);
                continue;
            }

            mergedIntervals.Add(currentInterval);
            currentInterval = new[] { interval[startIndex], interval[endIndex] };
        }

        mergedIntervals.Add(currentInterval);
        return mergedIntervals.ToArray();
    }
}
```
