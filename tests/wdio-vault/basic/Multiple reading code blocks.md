# Detailed Implementation Steps

## Step 1: Define DotnetSpider Entity Pattern

```csharp
public class PrimitivaDrawEntity
{
    public int[] Numbers { get; set; }
}
```

## Step 2: Create DotnetSpider Ingestor Pattern

```csharp
public class PrimitivaIngestor
{
    public Task InitializeAsync() => Task.CompletedTask;
}
```
