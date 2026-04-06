

# Fix TPV List Navigation from Project Info & PM Status Tabs

## Problem
When TPV List is opened from **TPV Status** tab, a "TPV List" breadcrumb appears in the tab bar, and switching to another tab closes it. But when opened from **Project Info** or **PM Status**, there's no breadcrumb and tab switching doesn't close the list — because those tables manage TPV List state internally without reporting it to `Index.tsx`.

## Solution
Mirror the same pattern `TPVStatusTable` already uses (`closeDetailRef` + `onActiveProjectChange`) in `ProjectInfoTable` and `PMStatusTable`, then unify the tab bar breadcrumb logic.

## Changes

### 1. `src/components/ProjectInfoTable.tsx`
- Add props: `closeDetailRef?: MutableRefObject<(() => void) | null>` and `onActiveProjectChange?: (active: boolean) => void`
- Add effects (same as in `TPVStatusTable`):
  - Expose `closeDetailRef.current = () => setActiveTPVProject(null)`
  - Call `onActiveProjectChange?.(!!activeTPVProject)` when `activeTPVProject` changes

### 2. `src/components/PMStatusTable.tsx`
- Same changes as `ProjectInfoTable` — add `closeDetailRef` and `onActiveProjectChange` props + effects.

### 3. `src/pages/Index.tsx`
- Add two more refs and state trackers for Project Info and PM Status TPV list:
  - `projectInfoCloseRef`, `pmStatusCloseRef`
  - `projectInfoTPVActive`, `pmStatusTPVActive`
- Pass these to `<ProjectInfoTable>` and `<PMStatusTable>` as props
- Update `handleTabChange` to close TPV lists from all three tables (call all close refs)
- Update the breadcrumb display: show "› TPV List" when **any** of the three tables has an active TPV list (not just `tpv-status` tab)
- Compute combined `anyTpvListActive` for undo page context

This gives identical behavior across all three tabs — open TPV List as a sub-view, see the breadcrumb, switch tab to dismiss it.

