# Fix oprávnení – stale overrides, sekcia Daylog, PM read-only

## Problém
- PM (a možno aj iné role) majú v `user_roles.permissions` JSONB **starý snapshot** uložený pred pridaním flagov `canAccessPlanVyroby` / `canWritePlanVyroby` / `canAccessTpv` / `canWriteTpv`. Helper `has_permission()` najprv pozrie do JSONB a ak kľúč chýba → vráti **false** (nepadá na role default). Preto PM nevidí Plán Výroby aj keď preset hovorí že má.
- V UI `OsobyOpravneni.tsx` je riadok **Daylog** v sekcii „Plán výroby". Patrí do **Modul Výroba**.
- `useAuth.tsx` flag `isQCOnlyUser` môže reštrikčne ovplyvňovať PM ak má omylom `canQCOnly = true` v starom snapshote.

## Plán

### 1. DB: cleanup migrácia – reset stale overrides pre VŠETKY role
Migrácia jednorázovo:
```sql
UPDATE public.user_roles
SET permissions = NULL
WHERE permissions IS NOT NULL
  AND NOT (permissions ? 'canAccessTpv');
```
Účinok: každý user, ktorého JSONB neobsahuje nový kľúč `canAccessTpv`, stratí svoj uložený snapshot a začne dediť aktuálny **role preset** z `role_permission_defaults` (čo už obsahuje všetky nové flagy podľa `permissionPresets.ts`). Owner-uložené explicitné overrides (kde už `canAccessTpv` je) zostanú nedotknuté.

### 2. UI: presun Daylog do sekcie „Modul Výroba"
Súbor: `src/components/osoby/OsobyOpravneni.tsx`
- V poli `GROUPS` presunúť riadok `canAccessDaylog` zo skupiny **„Plán výroby"** do skupiny **„Modul Výroba"** (vedľa `canManageProduction`, `canQCOnly`).

### 3. useAuth.tsx – PM nesmie spadnúť do QC-only módu
Súbor: `src/hooks/useAuth.tsx`
- `isQCOnlyUser` upraviť tak, aby vracal `true` len ak `canQCOnly === true` **a zároveň** `canManageProduction === false` **a** `canEdit === false` (zabráni omylu, že editor s QC flagom dostane read-only UI).

### 4. Verifikácia po nasadení
SQL kontrola pre každú rolu:
```sql
SELECT ur.role, p.email,
  has_permission(ur.user_id, 'canAccessPlanVyroby') AS plan,
  has_permission(ur.user_id, 'canWritePlanVyroby') AS plan_w,
  has_permission(ur.user_id, 'canAccessDaylog') AS daylog,
  has_permission(ur.user_id, 'canManageProduction') AS prod,
  has_permission(ur.user_id, 'canAccessTpv') AS tpv
FROM public.user_roles ur
JOIN public.profiles p ON p.id = ur.user_id
ORDER BY ur.role;
```
Očakávané hodnoty musia zodpovedať `ROLE_PRESETS` v `src/lib/permissionPresets.ts` (PM má `canAccessPlanVyroby = true`, `canWritePlanVyroby = false`, `canAccessTpv = false`, atď.).

## Files to edit
- **new migration** – UPDATE user_roles (reset stale snapshots)
- `src/components/osoby/OsobyOpravneni.tsx` – presun Daylog
- `src/hooks/useAuth.tsx` – spresnenie `isQCOnlyUser`

## Riziko
Žiadne owner-explicitné nastavenie sa nestratí (filter `NOT (permissions ? 'canAccessTpv')`). Po reset-e budú všetci dotknutí useri dediť presety – čo je presne to, čo chceš („nastavené pristupy ktoré majú mať"). Nové úpravy v Oprávneniach sa odteraz uložia s kompletným kľúčovým setom (vrátane `canAccessTpv`) takže tento problém sa nezopakuje.
