# Bug: Oprávnenia sa po uložení tvária že sa "vrátili" po refreshi

## Príčina
V `src/components/osoby/OsobyOpravneni.tsx` (riadky 336–338) sa pri každej zmene zvolenej role `draftPerms` resetuje **vždy na statický `ROLE_PRESETS[selectedRole]`**, namiesto aby sa načítali aktuálne uložené `permissions` z DB.

```tsx
useEffect(() => {
  setDraftPerms({ ...(ROLE_PRESETS[selectedRole] ?? ROLE_PRESETS.admin) });
}, [selectedRole]);
```

Overené v DB — `handleSave` reálne uloží zmeny správne (PM má v `user_roles.permissions` `canAccessAnalytics: false` pre všetkých 4 userov). Po F5 sa však UI postaví zo statického presetu (`canAccessAnalytics: true`) a checkbox je zase zapnutý → vyzerá to ako že sa zmena stratila. **Reálne všetko funguje, len UI klame.**

## Plán opravy

### 1. `OsobyOpravneni.tsx` — odvodiť `draftPerms` od skutočne uložených dát
- V `useEffect` reset draft brať z **prvého userov override** danej role (alebo zo session ak existuje konzistentný stav). Konkrétne: ak všetci useri v role majú rovnaký JSONB override, použiť ho. Inak fallback na `ROLE_PRESETS`.
- Závislosti effect-u rozšíriť na `[selectedRole, roles]`, aby sa po `fetchAll()` po uložení zobrazil aktuálny DB stav.

```tsx
useEffect(() => {
  const usersInRole = roles.filter((r) => r.role === selectedRole);
  const firstWithOverride = usersInRole.find(
    (r) => r.permissions && Object.keys(r.permissions).length > 0,
  );
  if (firstWithOverride?.permissions) {
    // Zlúčiť s presetom aby sa doplnili chýbajúce flagy
    setDraftPerms({
      ...ROLE_PRESETS[selectedRole],
      ...firstWithOverride.permissions,
    });
  } else {
    setDraftPerms({ ...(ROLE_PRESETS[selectedRole] ?? ROLE_PRESETS.admin) });
  }
}, [selectedRole, roles]);
```

### 2. `handleSave` — udržať konzistentnosť aj cez `role_permission_defaults`
Aktuálny save zapisuje len do `user_roles.permissions` per user. Ak owner zmení preset role (logická intencia tejto UI), mali by sme aj **upsertnúť `role_permission_defaults`** pre danú rolu, aby:
- noví user pridelený k role dostal okamžite správne defaults,
- `has_permission()` SQL helper vrátil správnu hodnotu aj pre userov bez explicit override.

```ts
// V persistSave po update user_roles:
await supabase.from("role_permission_defaults").upsert(
  { role: selectedRole, permissions: draftPerms as any },
  { onConflict: "role" },
);
```

### 3. Verifikácia po fixe
1. Odhlásiť/refresh, otvoriť Oprávnenia → PM → Analytics má byť **vypnuté** (čo je aktuálne reálne v DB).
2. Zapnúť Analytics, Uložiť, F5 → checkbox musí ostať zapnutý.
3. Vypnúť Analytics, Uložiť, F5 → checkbox musí ostať vypnutý.
4. SQL kontrola:
   ```sql
   SELECT role, permissions->>'canAccessAnalytics' FROM role_permission_defaults WHERE role='pm';
   SELECT user_id, permissions->>'canAccessAnalytics' FROM user_roles WHERE role='pm';
   ```

## Files to edit
- `src/components/osoby/OsobyOpravneni.tsx` — fix reset effect (1) + rozšíriť `persistSave` o upsert do `role_permission_defaults` (2)

## Riziko
Nulové na DB strane (žiadna migrácia). UI fix je čisto čítací — žiadne dáta sa nemažú. Upsert do `role_permission_defaults` je bezpečný (owner-only RLS). Owner aktuálne uložené overrides v DB zostanú nedotknuté.
