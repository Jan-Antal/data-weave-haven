## Cieľ

1. Pridať dve nové role do systému: **Nákupčí** (kopíruje preset PM) a **Finance** (kopíruje preset Viewer + povolené `canSeePrices` všade, kde má rola prístup).
2. Odstrániť nefunkčné UI tlačidlá pre dynamické vytváranie/duplikovanie/mazanie rolí v `OsobyOpravneni`.

## Prečo nie dynamické role

`app_role` je Postgres ENUM používaný v RLS politikach (`has_role()`), preto každá nová rola vyžaduje DB migráciu + úpravu TypeScriptu. Plné dynamické vytváranie z UI by bola veľká refaktorizácia – preto teraz pridáme len tieto dve role natvrdo a UI tlačidlá zmiznú.

## Zmeny

### 1) DB migrácia – nové enum hodnoty + defaulty

```sql
-- Pridať dve nové hodnoty do enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'nakupci';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance';
```

Potom v samostatnej migrácii (enum hodnoty nemôžu byť použité v tej istej transakcii, kde sú vytvorené):

```sql
-- Nákupčí = kópia PM presetu z role_permission_defaults
INSERT INTO public.role_permission_defaults (role, permissions)
SELECT 'nakupci'::app_role, permissions
FROM public.role_permission_defaults
WHERE role = 'pm'
ON CONFLICT (role) DO UPDATE
  SET permissions = EXCLUDED.permissions;

-- Finance = kópia Viewer + canSeePrices = true
INSERT INTO public.role_permission_defaults (role, permissions)
SELECT 'finance'::app_role,
       permissions
         || jsonb_build_object('canSeePrices', true)
FROM public.role_permission_defaults
WHERE role = 'viewer'
ON CONFLICT (role) DO UPDATE
  SET permissions = EXCLUDED.permissions;
```

### 2) `src/hooks/useAuth.tsx`

Rozšíriť typ `AppRole` o `"nakupci" | "finance"` a doplniť všetky odvodené flagy (napr. `canAccessOsoby`, `canSeePrices` atď.) tak, aby pracovali rovnako ako PM, resp. Viewer + ceny. Konkrétne pridať tieto role do tých istých vetiev kde sa už spomína `pm` / `viewer`.

### 3) `src/lib/permissionPresets.ts`

- Pridať `nakupci` a `finance` do `ROLE_LABELS` (`"Nákupčí"`, `"Finance"`).
- Pridať `ROLE_PRESETS.nakupci = { ...ROLE_PRESETS.pm }` a `ROLE_PRESETS.finance = { ...ROLE_PRESETS.viewer, canSeePrices: true }`.

### 4) `src/components/osoby/OsobyOpravneni.tsx`

- `ROLE_ORDER` doplniť `"nakupci"` (za `pm`) a `"finance"` (pred `viewer`).
- Odstrániť tlačidlo **Duplikovať** v hlavičke (riadky 749–757) a funkciu `handleDuplicate`.
- Odstrániť tlačidlo **Nová rola** v sidebare (riadky 717–723) a funkciu `handleNewRole`.
- Žiadne mazanie rolí ani premenovanie sa nezavádza.

## Výsledok

V module *Oprávnenia* sa v zozname rolí objaví `Nákupčí` (správa rovnaká ako PM) a `Finance` (rovnaká ako Viewer, ale vidí ceny). Owner môže ďalej upravovať ich oprávnenia štandardne cez UI (uložia sa do `role_permission_defaults` aj `user_roles`). Tlačidlá Duplikovať a Nová rola už nebudú zavádzať toast „len cez DB migráciu".
