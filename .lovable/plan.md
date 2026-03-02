

## Fix: Chevron click triggers drag instead of expand/collapse

### Problem
In both `InboxPanel.tsx` and `WeeklySilos.tsx`, the chevron is inside a draggable container that has `{...listeners}` spread on it. Clicking the chevron fires the drag listeners instead of toggling expand/collapse.

### Fix approach

**InboxPanel.tsx (InboxProjectGroup)** — lines 175-222:
- The project group header (`<button>`) is not draggable itself (no `useDraggable`), so this component actually works fine. The issue is only in the `DraggableInboxProject` "whole project" button. Let me re-check... Actually the `InboxProjectGroup` header is a plain `<button>` with `onClick`, not draggable. The chevron issue is primarily in **WeeklySilos**.

**WeeklySilos.tsx (CollapsibleBundleCard)** — lines 397-451:
- The bundle header div (line 408-434) has `{...attributes} {...listeners}` spread on it, making the entire header a drag handle — including the chevron.
- **Fix**: Remove `{...listeners}` from the header div. Instead, add a `GripVertical` drag handle icon that gets `{...listeners}` exclusively. The chevron gets `e.stopPropagation()` on click. The rest of the header area stays as a click-to-toggle (no drag).

### Changes

1. **`WeeklySilos.tsx` — `CollapsibleBundleCard`** (~line 407-434):
   - Remove `{...listeners}` and `cursor-grab` from the header div
   - Add a `<GripVertical>` icon with `{...listeners}` as the explicit drag handle
   - Keep `onClick` on the header div for expand/collapse toggle
   - Add `e.stopPropagation()` on the chevron click for safety

2. **`WeeklySilos.tsx` — `CollapsibleBundleCard`** — also add `ref={setDragRef}` only to the grip handle (or keep on header but ensure listeners are isolated).

   Actually, `setDragRef` (the node ref) needs to stay on the header for proper drag detection. Only `listeners` need to be on the grip handle.

3. **`InboxPanel.tsx`** — The `InboxProjectGroup` doesn't use draggable, so the chevron should work. But verify and add `e.stopPropagation()` on the chevron click as a safety measure anyway.

