

# Rename `tpv_items.item_name` → `item_code` & Fix Runtime Error

## Context

The column `tpv_items.item_name` stores "kód prvku" (e.g. T01, BK-N11), not a name. The production tables already use `item_code` for the same concept. Renaming `tpv_items.item_name` → `item_code` will unify the naming convention across all tables.

Additionally, there's a runtime error (Tooltip not imported in TPVList.tsx) that needs fixing.

## Scope

**Database**: Rename column `tpv_items.item_name` → `item_code` via migration.

**~25+ files** referencing `tpv_items.item_name` need updating. The production tables (`production_inbox`, `production_schedule`, `production_expedice`) keep their `item_name` column — there it stores the display name (e.g. "Šatní skříň"), which is correct semantics.

## Migration

```sql
ALTER TABLE tpv_items RENAME COLUMN item_name TO item_code;
```

No data changes needed — same values, just the column name.

## Files to Update

### Core TPV hooks & components
1. **`src/hooks/useTPVItems.tsx`** — All references to `item_name` → `item_code` in queries, mutations, inserts
2. **`src/hooks/useAllTPVItems.ts`** — Query references
3. **`src/hooks/useCNDiff.ts`** — Matching logic `item.item_name` → `item.item_code`
4. **`src/components/TPVList.tsx`** — Table rendering, add item, sort, filter + fix missing Tooltip import
5. **`src/components/CNDiffDialog.tsx`** — Insert mapping and display
6. **`src/components/assistant/TPVExtractor.tsx`** — Save mapping `item_name: item.kod_prvku` → `item_code: item.kod_prvku`
7. **`src/components/ExcelImportWizard.tsx`** — Target field mapping and duplicate check

### Production integration (where tpv_items.item_name was read)
8. **`src/lib/recalculateProductionHours.ts`** — Select and match logic (`t.item_name` → `t.item_code`)
9. **`src/hooks/useProductionProgress.ts`** — Select query for tpv_items
10. **`src/hooks/useProductionStatuses.ts`** — If it reads tpv_items

### Production components (where production tables' item_name stays but code interactions change)
11. **`src/components/production/PlanVyrobyTableView.tsx`** — Where it cross-references tpv_items
12. **`src/components/production/ForecastOverlay.tsx`** — tpv_items select
13. **`src/components/production/ForecastSafetyNet.tsx`** — tpv_items select
14. **`src/components/production/InboxPanel.tsx`** — If it references tpv code
15. **`src/components/production/SplitItemDialog.tsx`** — No change (uses production_schedule.item_name)
16. **`src/components/production/SpillSuggestionPanel.tsx`** — No change (production tables)

### Other files
17. **`src/pages/Index.tsx`** — Mobile add item: `item_name` → `item_code`
18. **`src/components/mobile/MobileTPVCardList.tsx`** — Interface + rendering
19. **`src/components/mobile/MobileDetailProjektSheet.tsx`** — If it reads item_name from tpv
20. **`src/components/RecycleBin.tsx`** — `nameField="item_name"` → `"item_code"`
21. **`src/components/ProjectDetailDialog.tsx`** — If it references tpv item_name
22. **`src/data/projects.ts`** — If relevant
23. **`src/lib/exportExcel.ts`** / **`src/lib/exportPdf.ts`** — If they reference tpv item_name

### Edge Functions
24. **`supabase/functions/seed-test-env/index.ts`** — Test data inserts use `item_name`
25. **`supabase/functions/extract-tpv-from-sharepoint/index.ts`** — Already uses `kod_prvku` in AI schema (done previously)
26. **`supabase/functions/extract-tpv/index.ts`** — Already uses `kod_prvku` (done previously)

### Type file (auto-generated, no manual edit)
- `src/integrations/supabase/types.ts` — Will auto-update after migration

## Runtime Error Fix
- **`src/components/TPVList.tsx`**: Add missing import for `Tooltip, TooltipTrigger, TooltipContent` from `@/components/ui/tooltip` and wrap with `TooltipProvider`

## Key Principle
- Only `tpv_items` column changes. Production tables keep `item_name` (it's the display name there) and `item_code` (the code) — those are already correct.
- The `TPVItem` TypeScript type will change from `item_name: string` to `item_code: string`.

