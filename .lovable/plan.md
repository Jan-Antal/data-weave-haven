
## Plan: Role-First Permission Manager

Replace `OsobyOpravneni.tsx` with a two-column UI. Keep `permissionPresets.ts` and `useAuth.tsx` untouched.

### Layout

```text
┌───────────────────────────────────────────────────────────┐
│ ROLY (220px)         │  Header: [Role name] [Dup][Uložit]│
│ ─ owner       (2)    │                                    │
│ ─ admin       (1)    │  Pridelení uživatelia              │
│ ▌pm           (5) ●  │  ◯JK ✕  ◯PN ✕  + Přidat            │
│ ─ konstruktér (3)    │                                    │
│ ...                  │  ── Projekty & TPV ──              │
│ + Nová rola          │  Projekty       [– │Čítať│Upraviť] │
│                      │  TPV list       [– │Čítať│Upraviť] │
│                      │  Vytvořit       [– │Áno]           │
│                      │  ...                               │
└───────────────────────────────────────────────────────────┘
```

### Component structure (`src/components/osoby/OsobyOpravneni.tsx`)

State:
- `selectedRole: AppRole` (default `pm`)
- `draftPerms: Permissions` — starts from `ROLE_PRESETS[selectedRole]`, mutated by toggle clicks
- `assignedUsers: { id, full_name, email }[]` (for selected role)
- `addUserOpen: boolean`, `newRoleOpen: boolean`
- `confirmOverwrite: { count: number } | null`

Data:
- Fetch profiles + user_roles once. Group user counts per role.
- On role select: load assigned users, reset `draftPerms` to preset.

### Permission row mapping

Tri-state rows (`–` / `Čítať` / `Upraviť`):
| Row | Read flag | Write flag |
|---|---|---|
| Projekty | (always read if any access) | `canEdit` |
| TPV list | implicit read | `canManageTPV` |
| Plán výroby | `canAccessPlanVyroby` | `canWritePlanVyroby` |
| Správa osob | implicit read | `canManagePeople` |

For "Projekty"/"TPV list"/"Správa osob" — `–` means the user has no access at all (handled via `canEdit=false` and either keeping read-only via existing logic or hiding). Since `useAuth` doesn't have separate read flags for these, treat: `–` = false write + no related access; `Čítať` = false write + visible (default for any role); `Upraviť` = write true. We persist only the write flag — read is implied by role membership.

Binary rows (`–` / `Áno`):
- `canCreateProject`, `canDeleteProject`, combined `canEditProjectCode`+`canEditSmluvniTermin` (saved together), `canSeePrices`, `canAccessVyroba` (NEW — see note), `canAccessDaylog`, `canQCOnly`, `canAccessAnalytics`, `canManageExternisti`, `canAccessSettings`, `canManageUsers`, `canPermanentDelete`

NOTE: `canAccessVyroba` does not exist in `permissionPresets.ts`. Per instruction we must NOT change presets. We will store it in the JSONB as an additional key — `useAuth.resolvePermissions` ignores unknown keys, so it's safe data-wise; the row just won't gate UI yet (acceptable, future wiring).

### Save flow

1. On "Uložit": query `user_roles` for users with `role = selectedRole`.
2. For each, compare current `permissions` JSONB against `ROLE_PRESETS[selectedRole]`. Count those with non-null custom overrides differing from preset.
3. If count > 0 → open `ConfirmDialog` "X uživatelů má vlastní úpravy — přepsat?".
4. On confirm → bulk update `user_roles.permissions = draftPerms` where `role = selectedRole`. Toast success.

### Add/remove users

- "+ Přidat uživatele": Popover with `Command` search over profiles not in role. Select → update that user's `user_roles.role` to selectedRole.
- ✕ on chip → set user's role to `viewer` (cannot null role given existing schema). Confirm before demoting.

### "+ Nová rola"

The `app_role` enum is fixed. Show toast: "Nové role je možné pridať len cez DB migráciu" instead of allowing creation. (Documented limitation — keeps spec scope without enum migration.)

### Styling

- Use existing tokens: `bg-muted`, `bg-background`, `border-border`. Map spec colors:
  - Active item left border: `border-l-2 border-[#0a2e28]`
  - Read selected: `bg-[#E6F1FB] text-[#0C447C] border-[#85B7EB]`
  - Write selected: `bg-[#EAF3DE] text-[#27500A] border-[#97C459]`
  - Save button: `bg-[#0a2e28] text-white`

### Files touched

- `src/components/osoby/OsobyOpravneni.tsx` — full rewrite
- No changes to `permissionPresets.ts`, `useAuth.tsx`, `Osoby.tsx`, or other components.
