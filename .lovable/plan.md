

# Expandable project cards with per-department (úsek) breakdown

## What changes
Add a collapsible expand/collapse to each project card in the Dílna dashboard. When expanded, it shows horizontal bars for each production department (cinnost_kod) that logged hours on that project during the selected week.

## Data changes

**`useDilnaData` hook** — extend the hours query to also select `cinnost_kod` and `cinnost_nazov`. Build a per-project map of `{ kod, nazov, hodiny }[]` alongside the existing totals. Pass this as `usekBreakdown` on each card object.

## UI changes

**Project card** — add a clickable expand chevron (ChevronDown icon) to the card header. Track expanded state via `useState<Set<string>>`.

When expanded, render a list of departments sorted by hours descending. Each row:
- Left: department label (e.g. "LAK · Lakovna") — 11px, muted
- Center: horizontal bar (height 6px, rounded) proportional to max department hours for that project
- Right: hours value (e.g. "24h") — 11px, tabular

Bar color matches the project's overall border color (green/amber/red/gray).

## Files to edit
1. **`src/components/DilnaDashboard.tsx`** — only file needed

## Technical details
- Add `cinnost_kod, cinnost_nazov` to the `production_hours_log` select in `useDilnaData`
- Aggregate hours by `(ami_project_id, cinnost_kod)` into a Map
- Extend the `cards` type with `usekBreakdown: Array<{ kod: string; nazov: string; hodiny: number }>`
- Filter out TPV/ENG/PRO codes (already excluded by query filter)
- Add `expandedProjects: Set<string>` state in the component
- On card click or chevron click, toggle project in/out of the set
- Render breakdown rows inside the card when expanded, with `animate-accordion-down` for smooth open

