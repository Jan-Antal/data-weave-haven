
# Oprava systému Oprávnění — B1 (DB-level granular) + UI sync + TPV sekcia

## Cieľ
1. **B1** — UI toggly v Oprávneniach reálne menia DB-level prístup cez nový SQL helper `has_permission(user, flag)`. RLS policies sa prepíšu z hardcoded `has_role(...)` na `has_permission(...)`.
2. **UI ↔ realita** — všetky hardcoded role checky (`isAdmin`, `isPM`, `isKonstrukter`, `isVyroba`, `isOwner` použité na gating funkcií) nahradiť granular flagmi tak, aby UI presne odrážalo, čo používateľ reálne smie v DB.
3. **TPV sekcia v Oprávneniach** — pridať novú sekciu "TPV — Príprava výroby" s flagmi `canAccessTpv` / `canWriteTpv`. Globálne disabled na presetoch (okrem owner) → modul ostane vypnutý pre všetkých okrem ownera, ale dá sa zapnúť kliknutím v UI keď bude pripravený.

---

## Etapa 1 — DB: nový helper `has_permission()` + presety v DB

### 1.1 Migrácia: tabuľka `role_permission_defaults`
Single source of truth pre presety jednotlivých rolí (zrkadlo `ROLE_PRESETS` z `permissionPresets.ts`). Umožní DB-side fallback keď používateľ nemá `permissions` JSONB override.

```sql
CREATE TABLE public.role_permission_defaults (
  role app_role PRIMARY KEY,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.role_permission_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read role_permission_defaults"
  ON public.role_permission_defaults FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owner manage role_permission_defaults"
  ON public.role_permission_defaults FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner')) WITH CHECK (has_role(auth.uid(), 'owner'));
```

Seed initial rows pre všetky roly (owner=všetko true, viewer=skoro všetko false, atď.) — presná kópia `ROLE_PRESETS` + nové TPV flagy nastavené `false` pre všetkých okrem `owner`.

### 1.2 Helper funkcia `has_permission`
```sql
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _flag text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    -- 1) per-user override v user_roles.permissions
    (SELECT (ur.permissions ->> _flag)::boolean
       FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.permissions ? _flag
      LIMIT 1),
    -- 2) preset z role_permission_defaults
    (SELECT (rpd.permissions ->> _flag)::boolean
       FROM public.user_roles ur
       JOIN public.role_permission_defaults rpd ON rpd.role = ur.role
      WHERE ur.user_id = _user_id
      LIMIT 1),
    false
  )
$$;
```

### 1.3 Prepísanie RLS policies
Nahradiť `has_role(...)` checky v policies cez `has_permission(...)` na všetkých "user-facing" tabuľkách. Konkrétne (zoznam je výsledok auditu):

| Tabuľka | Akcia | Nový check (`has_permission(auth.uid(), …)`) |
|---|---|---|
| `projects` | INSERT | `canCreateProject` |
| `projects` | UPDATE | `canEdit` |
| `projects` | DELETE | `canDeleteProject` |
| `project_stages` | INSERT/UPDATE | `canEdit` |
| `project_stages` | DELETE | `canDeleteProject` |
| `tpv_items` | INSERT/UPDATE/DELETE | `canManageTPV` |
| `production_schedule` | INSERT | `canWritePlanVyroby` |
| `production_schedule` | UPDATE/DELETE | `canWritePlanVyroby` |
| `production_inbox` | INSERT/UPDATE/DELETE | `canWritePlanVyroby` |
| `production_daily_logs` | INSERT/UPDATE/DELETE | `canAccessDaylog` |
| `production_quality_checks` | INSERT/UPDATE/DELETE | `canAccessDaylog` (alebo `canQCOnly OR canManageProduction`) |
| `production_quality_defects` | INSERT/UPDATE/DELETE | `canAccessDaylog` |
| `production_expedice` | INSERT/UPDATE/DELETE | `canManageProduction` |
| `production_capacity` (+ employees) | INSERT/UPDATE/DELETE | `canManageProduction` |
| `people` | INSERT/UPDATE/DELETE | `canManagePeople` |
| `ami_employees` / `ami_absences` | INSERT/UPDATE/DELETE | `canManagePeople` |
| `position_catalogue` | INSERT/UPDATE/DELETE | `canManagePeople` |
| `exchange_rates` | INSERT/UPDATE/DELETE | `canManageExchangeRates` |
| `overhead_projects` | INSERT/UPDATE/DELETE | `canManageOverheadProjects` |
| `cost_breakdown_presets` | INSERT/UPDATE/DELETE | `canAccessSettings` |
| `column_labels` / `custom_column_definitions` | INSERT/UPDATE/DELETE | `canAccessSettings` |
| `project_status_options` / `tpv_status_options` | INSERT/UPDATE/DELETE | `canManageStatuses` |
| `formula_config` | ALL | `canAccessSettings` |
| `company_holidays` | INSERT/UPDATE/DELETE | `canManageProduction` |
| `production_settings` | UPDATE | `canAccessSettings` |
| `data_log` | INSERT | `has_any_role` (necháme — log slúži všetkým auth) |
| `tpv_*` (všetkých 7 tabuliek) | ALL | `canWriteTpv` (write), `canAccessTpv` (read kde to platí) |
| `user_roles` / `profiles` | INSERT/UPDATE/DELETE | `canManageUsers` |
| `role_permission_defaults` | UPDATE | iba `owner` (nie cez permission) |

**SELECT** policies ostanú väčšinou otvorené pre `authenticated` (čítanie všetci, gating len writes a UI viditeľnosť) — okrem `tpv_*` kde SELECT zviažeme na `canAccessTpv` (aby sa modul dal reálne vypnúť aj na DB úrovni).

### 1.4 Edge functions
`update-user`, `create-user`, `delete-user`, `setup-admin` — overovanie autorizácie cez `has_permission(caller, 'canManageUsers')` namiesto hardcoded `admin/owner`. Dôvod: granular flag `canManageUsers` má teraz reálnu váhu.

---

## Etapa 2 — UI: zosúladenie s realitou

### 2.1 `useAuth.tsx` — odstránenie zavádzajúcich legacy boolov
- Ponechať `isOwner`, `isAdmin`, `isTestUser`, `realRole`, `role` (potrebné pre owner-only operácie a simulačný režim).
- Označiť `isPM`, `isKonstrukter`, `isVyroba`, `isViewer` ako **deprecated** a postupne nahradiť granular flagmi na všetkých call sites.
- Pridať nové flagy: `canAccessTpv`, `canWriteTpv` (aj v `permissionPresets.ts`).

### 2.2 `permissionPresets.ts`
- Pridať `canAccessTpv` a `canWriteTpv` do `PERMISSION_FLAGS` + `PERMISSION_LABELS`.
- Všetky presety dostanú `canAccessTpv: false, canWriteTpv: false` okrem `owner` (true/true). Tým je modul vypnutý plošne, ale v Oprávneniach zapnuteľný.

### 2.3 `App.tsx` — opravy route guardov
- `TpvRoute` → `if (!canAccessTpv) return <Navigate to="/" />` (namiesto `!isOwner`).
- `OsobyRoute` — odstrániť `|| isAdmin || isOwner` ako fallback (oba sú aj tak pokryté granular flagmi cez presety).

### 2.4 `ProductionHeader.tsx`
- `canSeeVyroba = canManageProduction || canQCOnly` (odstrániť `|| isAdmin || isOwner` — owner aj admin majú flagy v presete).
- `canSeePlanVyroby = canAccessPlanVyroby`.
- `canSeeAnalytics = canAccessAnalytics`.
- `canSeeTpv = canAccessTpv` (namiesto `isOwner`).
- `canOpenSettingsMenu` — odstrániť `|| isOwner` fallback.
- `showDataLog` — odvodiť z `canAccessDaylog || canAccessSettings` (zbaviť sa `role === "pm"`).
- Položky settings menu (`User mgmt`, `Exchange rates`, `Statuses`, `Recycle bin`, `Overhead`, `Cost presets`, `Formula builder`) — gateovať každú zvlášť cez svoj flag, nie cez `isAdmin`.

### 2.5 `pages/Vyroba.tsx`
- Nahradiť `if (!loading && !isOwner && !isAdmin && !isTester) navigate("/")` cez `canManageProduction || canQCOnly || canAccessPlanVyroby` check (v súlade s `VyrobaRoute`).
- Riadky 1776, 3155 — preniesť do granular flagov (`canManageProduction`, `canAccessSettings`).

### 2.6 `pages/PlanVyroby.tsx`, `pages/Index.tsx`, `pages/Tpv.tsx`
- Audit a zámena `isAdmin`/`isPM`/`isOwner` checkov za príslušné `can*` flagy. Owner-only operácie (transfer ownership, simulovaná rola, role_permission_defaults edit) ostávajú na `isOwner`.

### 2.7 Komponenty
- `ProjectInfoTable.tsx`, `TPVList.tsx`, `MobileTPVCardList.tsx` — `canEdit`/`canManageTPV` už používajú flagy, len pridať `canAccessTpv` gate kde je potreba (TPV list zobraziť aj keď `canAccessTpv=false`? — necháme kontrolu na úrovni TPV modulu, TPV List vnútri projektu zostáva pod `canManageTPV`).
- `RecycleBin.tsx` — `canPermDeleteProjectsStages = canPermanentDelete && !isTestUser` (zbaviť sa `isAdmin`). `isKonstrukter` tab logika sa zjednoduší: zobraziť všetky taby ak `canAccessRecycleBin`, gate akcií cez `canDeleteProject`/`canManageTPV`.
- `PeopleManagement.tsx` — `canDelete/canRename/canToggleAllRoles = canManagePeople && !isTestUser`.
- `NotificationSettings.tsx` — admin-only prefs gateovať cez `canManageUsers` namiesto `isAdmin || isOwner`.
- `AccountSettings.tsx` — backup section gate cez `canAccessSettings` namiesto `isAdmin`.
- `OsobyOpravneni.tsx` — pridať guard `if (!canManageUsers) return <NoAccess/>` na začiatok komponentu.
- `MobileBottomNav.tsx` — `canSeeVyroba = canManageProduction || canQCOnly || canAccessPlanVyroby`.
- `CapacitySettings.tsx` — `isAdmin` (lokálny derived) prepísať na `canManageProduction`.
- `UserManagement.tsx` — owner-only operácie (transfer ownership) nechať na `isOwner`; ostatné na `canManageUsers`.

### 2.8 `OsobyOpravneni.tsx` — nová sekcia TPV + sync presetov do DB
- Pridať novú sekciu `GROUPS` na koniec:
  ```ts
  {
    title: "TPV — Príprava výroby",
    icon: { bg: "#FEF3C7", color: "#92400E" },
    rows: [
      { kind: "tri", label: "TPV modul", desc: "Príprava výroby (vo vývoji)",
        read: "canAccessTpv", write: "canWriteTpv" },
    ],
  }
  ```
- Po `Save` v `persistSave()`:
  1. Update `user_roles.permissions` per user (existujúci kód).
  2. **Update `role_permission_defaults` row pre selectedRole** — aby DB-side fallback zodpovedal UI presetu. Toto je nové.
- "Reset to preset" tlačidlo načíta z `role_permission_defaults` (nie iba z FE konštanty).

### 2.9 `useProjects.ts`, ostatné read-only hooky
Žiadna zmena potrebná — SELECT policies ostanú otvorené pre authenticated (gating len writes).

---

## Etapa 3 — Validácia

### 3.1 Manual smoke test (po nasadení)
Pre každú rolu (`owner`, `admin`, `vedouci_pm`, `pm`, `vedouci_konstrukter`, `konstrukter`, `vedouci_vyroby`, `mistr`, `quality`, `kalkulant`, `viewer`):
- Header — viditeľné len ikony modulov ku ktorým má prístup.
- Settings menu — viditeľné len položky pre granted flagy.
- Pokus o write do tabuľky bez flagu → DB vráti RLS error (potvrdí, že B1 funguje).
- Toggling flagu v Oprávneniach → okamžite mení dostupnosť (po reload session).

### 3.2 TPV vypnutý overiť
- Owner: ikona TPV viditeľná, route prístupná.
- Všetci ostatní: ikona skrytá, route redirectuje na `/`, `tpv_*` SELECT vráti `[]`.
- V Oprávneniach pri ktorejkoľvek roli zapnúť `canAccessTpv` + `canWriteTpv` → daná rola začne vidieť TPV.

---

## Súbory ktoré sa upravia

**Migrácia (1 nová):**
- `supabase/migrations/<ts>_permission_system_b1.sql` — `role_permission_defaults` tabuľka + seed, `has_permission()` funkcia, prepis RLS policies pre ~25 tabuliek.

**Frontend:**
- `src/lib/permissionPresets.ts` — pridanie `canAccessTpv`, `canWriteTpv`.
- `src/hooks/useAuth.tsx` — vystavenie nových flagov.
- `src/App.tsx` — `TpvRoute`, `OsobyRoute`.
- `src/components/production/ProductionHeader.tsx` — gating.
- `src/components/osoby/OsobyOpravneni.tsx` — TPV sekcia + sync do `role_permission_defaults` + guard.
- `src/components/RecycleBin.tsx`, `PeopleManagement.tsx`, `NotificationSettings.tsx`, `AccountSettings.tsx`, `UserManagement.tsx`, `mobile/MobileBottomNav.tsx`, `production/CapacitySettings.tsx` — prepis hardcoded role checkov.
- `src/pages/Vyroba.tsx`, `PlanVyroby.tsx`, `Index.tsx`, `Tpv.tsx`, `Osoby.tsx` — prepis legacy gateov.

**Edge functions:**
- `supabase/functions/update-user/index.ts`, `create-user/index.ts`, `delete-user/index.ts` — autorizácia cez `has_permission('canManageUsers')`.

**Memory:**
- Update `mem://features/authentication/role-based-access-control` — nový popis: granular permissions presadené v DB cez `has_permission()`, presety v `role_permission_defaults`, TPV vypnutý cez `canAccessTpv` flag.

---

## Otvorené body
- `production_quality_checks/defects` — gateovať cez `canAccessDaylog` alebo cez nový samostatný `canManageQuality`? Návrh: **`canAccessDaylog OR canManageProduction`** (kvalita patrí k dennému logu). Ak chceš samostatný flag, dopíš.
- Po nasadení etapy 1 (DB) sa môže stať, že existujúci používatelia stratia prístup, ak ich rola v `role_permission_defaults` nemá flag, ktorý reálne potrebujú. Seed bude **1:1 kópia** súčasných `ROLE_PRESETS`, takže nemalo by sa to stať — ale po deploy je odporúčané prejsť cez Oprávnenia a verifikovať.
