

## Plan: Polish Oprávnění — colors + fix non-functional Ne toggles

### 1. Unified color semantics (TriToggle + BinToggle)

Replace the current pale neutral "Ne" with **red** and the blue "Čítať" with **orange** for instant visual reading:

| State | Background | Text | Border |
|---|---|---|---|
| Ne (selected) | `#FDECEC` | `#B42318` | `#F4A6A0` |
| Čítať (selected) | `#FFF1E0` | `#9A4A00` | `#F4B66A` |
| Upraviť / Áno (selected) | `#EAF3DE` | `#27500A` | `#97C459` (unchanged) |
| Unselected | transparent | muted | transparent |

Apply to `SegBtn` `variant`s: rename `neutral` → `none` styling to red; `read` → orange. No changes to `write`.

### 2. Fix "Modul výroba" + "Správa osob" tri toggles that can't go to Ne

Root cause: `triState()` returns `"read"` as the fallback when a row has no separate `read` flag and `write` is false. So clicking "Ne" sets the write flag to false, then the state immediately reads back as "Čítať" — Ne is never selected and the section feels inert.

Fix: change rows in `Modul výroba` and `Správa osob` from **tri** to **bin** (one flag, Ne / Áno), since there is no separate read permission backing them in `permissionPresets.ts`. Specifically:

- `Modul výroba` (write `canManageProduction`) → bin row `["canManageProduction"]`
- `Správa osob` (write `canManagePeople`) → bin row `["canManagePeople"]`
- Same fix for `Project Info`, `PM Status`, `TPV Status`, `TPV List` — they all use `canEdit`/`canManageTPV` with no read flag. Convert to binary so "Ne" actually deselects them visibly.

Keep `Plán výroby — Kanban / Tabulka` as **tri** (it has both `canAccessPlanVyroby` read + `canWritePlanVyroby` write — the only row where tri-state is meaningful).

### 3. Stronger section color blocks

Wrap each `GROUPS[]` section in a tinted card using the same color from `g.icon`:

```text
┌─ ▌ Project Info ──────────────────────┐  <- left border 3px, header bg = icon.bg
│ rows...                                │  <- card has subtle bg = icon.bg @ 30%
└────────────────────────────────────────┘
```

- Section root: `border-l-[3px]` using `icon.color`, `rounded-md`, `bg-[icon.bg]/40`
- Header bar inside: solid `bg-[icon.bg]`, text `icon.color`, larger 12px label
- Replaces the current 18×18 swatch with a real colored band

### 4. RLS verification (no DB changes — audit only)

Will quickly cross-check via `supabase--read_query` that each permission flag has a corresponding RLS policy on the relevant tables, and document any gap (e.g. `canManageProduction` for `vyroba` role — DB only allows `pm/admin/owner` to write `production_schedule`, so revoking it client-side matches DB enforcement). If gaps exist they'll be listed in the implementation message — no migration unless user approves.

### Files touched

- `src/components/osoby/OsobyOpravneni.tsx` — update `GROUPS` (convert several tri→bin), update `SegBtn` color variants, restructure section rendering with colored cards.

No changes to `permissionPresets.ts`, `useAuth.tsx`, or DB schema.

