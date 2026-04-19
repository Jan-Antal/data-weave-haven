

Two simple edits to `src/components/osoby/OsobyOpravneni.tsx`:

1. **Change "–" to "Ne"** in both toggle components:
   - `TriToggle` (line ~692): change first `SegBtn` child from `–` to `Ne`
   - `BinToggle` (line ~726): change first `SegBtn` child from `–` to `Ne`

2. **Replace GROUPS constant** (lines ~75-136) with the restructured app modules layout:
   - Update `Group` type to include optional `icon?: { bg: string; color: string }`
   - 5 groups: "Project Info", "Plán výroby", "Modul výroba", "Analytics", "Správa osob & Nastavenia"
   - Each group has colored icon square (18×4px, border-radius 4px) before the title
   - Update group header rendering to show the icon

No logic changes, no save behavior changes, no data fetching changes.

