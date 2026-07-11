# Migration

## Phase 1: Entity Consolidation

**Files to Consolidate:**

```
Current (Duplicate):
- Lottery/Entities/LotteryDrawEntity.cs
- Lottery/Extraction/LotteryDrawEntities.cs
```

**Target Structure:**

```
Lottery/Entities/
├── PrimitivaDrawEntity.cs
├── BonolotoDrawEntity.cs
└── EuromillionsDrawEntity.cs
```

## Phase 2: Ingestor Migration

**Current Pattern (Custom):**

```
public class SpiderBasedPrimitivaIngestor : ILotteryIngestor
{
    private async Task CrawlAsync() { ... }
}
```

**Target Pattern (DotnetSpider):**

```csharp
[DisplayName("La Primitiva")]
public class PrimitivaIngestor : Spider
{
    protected override async Task InitializeAsync() { }
}
```
