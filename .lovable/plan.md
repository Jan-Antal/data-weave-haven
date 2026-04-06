

# CN Change Detection — Background Diff with Warning Badge

## Understanding

The user wants:
1. When a new CN document is uploaded to the "Cenová nabídka" SharePoint folder, **automatically** (in background) extract and compare it against current TPV items
2. Show a **warning icon** in the TPV List header if differences are found
3. Clicking the warning opens a **diff popup** showing: new items, removed items, changed price/quantity
4. User can accept/dismiss changes from the popup
5. This should NOT depend on a previous extraction snapshot — it compares **CN document vs current `tpv_items`** directly
6. The comparison must run in the background without blocking the user

## Architecture

```text
┌─────────────────┐    ┌──────────────────┐    ┌─────────────┐
│ Upload CN file   │───▶│ Background       │───▶│ Store diff  │
│ to SharePoint    │    │ extraction       │    │ in state    │
└─────────────────┘    │ (edge function)  │    └──────┬──────┘
                       └──────────────────┘           │
                                                       ▼
                                              ┌─────────────────┐
                                              │ Warning badge   │
                                              │ in TPV List     │
                                              │ header          │
                                              └────────┬────────┘
                                                       │ click
                                                       ▼
                                              ┌─────────────────┐
                                              │ Diff dialog     │
                                              │ with accept     │
                                              └─────────────────┘
```

## Changes

### 1. New hook: `src/hooks/useCNDiff.ts`
- Accepts `projectId` and current `tpv_items` array
- Provides `checkCN()` function that:
  - Calls the existing `extract-tpv-from-sharepoint` edge function (action: "search" then "extract")
  - Compares extracted items against current `tpv_items` by matching `kod_prvku` ↔ `item_name`
  - Computes diff: `added[]`, `removed[]`, `changed[]` (with old/new values for cena, pocet, nazev)
  - Stores result in state
- Exposes: `diff`, `isChecking`, `hasDifferences`, `checkCN()`, `clearDiff()`
- No DB table needed — diff is ephemeral, computed on demand

### 2. New component: `src/components/CNDiffDialog.tsx`
- Shows a table of differences grouped by type (new / changed / removed)
- Color coding: green rows = new items, yellow = changed (shows old → new), red = removed
- Checkboxes per row to select which changes to apply
- "Aktualizovat vybrané" button:
  - Inserts new items into `tpv_items`
  - Updates changed items' cena/pocet/nazev
  - Optionally soft-deletes removed items (with confirmation)
- "Označit jako zkontrolováno" button to dismiss without changes

### 3. Update `src/components/TPVList.tsx`
- Import and use `useCNDiff` hook
- Add `AlertTriangle` warning icon next to the toolbar (between project title and buttons)
  - Only visible when `hasDifferences === true`
  - Tooltip on hover: "CN byla změněna — zkontrolovat"
  - Click opens `CNDiffDialog`
- Add a "Kontrola CN" button in toolbar (always visible when `canManageTPV`)
  - Triggers `checkCN()` manually
  - Shows spinner while checking

### 4. Auto-trigger on CN upload
- In `TPVList.tsx`, watch for changes in SharePoint `cenova_nabidka` files
  - After `TPVExtractor` closes with success (`onSuccess`), auto-run `checkCN()` in background
  - This also covers the case where CN was uploaded via DocumentDragDrop or any other method — user can manually trigger "Kontrola CN"

## Diff Logic (in `useCNDiff`)

```text
Match by: extracted.kod_prvku === tpv_item.item_name

For each extracted item:
  - If no matching tpv_item → "added"
  - If matching tpv_item exists but cena/pocet/nazev differs → "changed"
  
For each tpv_item:
  - If no matching extracted item → "removed" (only flagged, not auto-deleted)
```

## No DB Migration Needed
The diff is computed client-side and stored in React state. No snapshot table required since we compare CN document directly against live `tpv_items`.

## Technical Notes
- Reuses existing `extract-tpv-from-sharepoint` edge function — no backend changes
- The background extraction is fire-and-forget: errors are silently caught, user sees no disruption
- If multiple CN files exist, uses the same "pick" logic as TPVExtractor (latest/largest match)

