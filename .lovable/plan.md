
## Plan: Add "Etapa" column to TPV List

### Goal
Add a new sortable, editable **Etapa** column to TPV List that:
- Only appears when the project has **2+ stages** (single-stage projects don't need it)
- Renders as a **dropdown** with options = stages of the current project (`stage.display_name || stage.stage_name`)
- Allows assigning each TPV item to a specific stage
- Persists assignment via new `stage_id` column on `tpv_items`

### Changes

**1. DB migration** — `tpv_items` add `stage_id UUID NULL` (no FK constraint to keep parity with existing nullable refs; index for query perf).

**2. `TPVList.tsx`**
- Add `{ key: "stage_id", label: "Etapa", defaultHidden: true }` to `TPV_LIST_COLUMNS` (default hidden so single-stage projects don't see clutter; auto-shown when 2+ stages)
- Fetch project stages via existing `useProjectStages(projectId)`
- When `stages.length >= 2` → force visible by default (override `DEFAULT_HIDDEN_KEYS` logic for this column)
- Render cell as `InlineEditableCell type="select"` with options built from stages, mapped by `id ↔ display label`
- `getTPVListColumnStyle("stage_id")` → `minWidth: 140, maxWidth: 200`
- Save via existing `updateItem` mutation (field: `stage_id`, value: stage UUID or empty for "—")

**3. `MobileTPVCardList.tsx`** — show stage badge in compact + expanded view when present.

**4. `useTPVItems.tsx`** — no change needed (generic field update already supports any column).

### Out of scope
- No auto-assignment from existing data; user assigns manually
- No cascade behavior when stage is deleted (stays as orphan UUID — UI shows "—")
- No filtering by stage in TPV List (can be added later if needed)
