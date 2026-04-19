
## Plan: Per-User Permission System

### 1. Database migration
- `ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS permissions JSONB`
- Fix RLS on `projects`, `project_stages`, `tpv_items`, `production_schedule`, `production_inbox` so any authenticated user with a row in `user_roles` can SELECT (regardless of role). Currently `vedouci_vyroby`, `mistr`, `quality`, `vyroba` are blocked because policies (or `is_test_project` joins) gate them out.
  - Add SELECT policy: `USING (auth.uid() IN (SELECT user_id FROM user_roles))` alongside existing tester/test isolation logic where applicable.
- Extend `app_role` enum with new values: `vedouci_pm`, `vedouci_konstrukter`, `vedouci_vyroby`, `mistr`, `quality`, `kalkulant` (keep existing owner/admin/pm/konstrukter/viewer/vyroba/tester for backward compat).

### 2. Permission presets module
New file `src/lib/permissionPresets.ts`:
- Export `PERMISSION_FLAGS` (string[] of all 22 flags).
- Export `ROLE_PRESETS: Record<AppRole, Partial<Permissions>>` exactly as specified.
- Helper `resolvePermissions(role, overrides)` → merges preset + JSONB overrides, missing keys default `false`.

### 3. `useAuth.tsx` refactor
- Load `permissions` JSONB alongside `role` from `user_roles`.
- Compute resolved `permissions` object via `resolvePermissions(role, dbPermissions)`. When `simulatedRole` set (owner only), use **preset only** (ignore stored overrides).
- Expose every flag on AuthContext: `canEdit`, `canCreateProject`, `canDeleteProject`, `canEditProjectCode`, `canEditSmluvniTermin`, `canManageTPV`, `canAccessSettings`, `canManageUsers`, `canManagePeople`, `canManageExternisti`, `canManageProduction`, `canAccessAnalytics`, `canSeePrices`, `canAccessPlanVyroby`, `canWritePlanVyroby`, `canAccessDaylog`, `canQCOnly`, `canUploadDocuments`, `canPermanentDelete`, `canManageExchangeRates`, `canManageStatuses`, `canAccessRecycleBin`.
- Keep legacy booleans (`isAdmin`, `isPM`, …) for back-compat but derive UI gating from flags.
- `isFieldReadOnly(field, currentValue)`:
  - `!canEdit` → true for all
  - QC-only user (only `canAccessDaylog` + `canQCOnly`) → true for all
  - `!canSeePrices` and field ∈ {`prodejni_cena`, `marze`} → true
  - `!canEditProjectCode` and field === `project_id` → true
  - `!canEditSmluvniTermin` and field === `datum_smluvni` → true (always, not just when set)
- `defaultTab` derived per spec.

### 4. UI: Oprávnenia section in Uživatelé
Edit `src/components/UserManagement.tsx`:
- Add expand chevron per row; expanded panel renders below row (full-width).
- Panel content:
  - Badge with current role preset label + "Resetovat na preset" button (repopulates local state from preset, does not save).
  - Grid of 22 labeled `Checkbox`es bound to local state.
  - "Uložiť" button → upserts `user_roles.permissions` JSONB via supabase update; "Zrušit" reverts.
- Permission labels in Czech (e.g. "Editovat projekty", "Vytvárať projekty", "Vidieť ceny", …).
- No other UI changes.

### 5. Files touched
- `supabase/migrations/<new>.sql` — column + RLS fixes + enum values
- `src/lib/permissionPresets.ts` — new
- `src/hooks/useAuth.tsx` — load + expose permissions
- `src/components/UserManagement.tsx` — expandable Oprávnenia panel
- (No changes needed in consuming components — they already read flags from `useAuth()`.)

### 6. Out of scope
- No redesign of existing permission-gated UI beyond the new panel.
- Existing `isAdmin`/`isPM`/etc. checks remain (compute from role) so no cascading edits required this round.
