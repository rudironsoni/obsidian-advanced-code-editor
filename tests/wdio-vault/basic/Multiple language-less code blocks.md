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
