# Plán: Rozšírenie modulu Oprávnění o per-modulové sub-záložky

## Princípy (na základe tvojich odpovedí)

1. **Hybrid granularita:**
   - Sub-záložky kde sa **iba pozerá** (Analytics, Oprávnění) → **toggle Áno/Nie**
   - Sub-záložky kde sa **edituje dáta** (Project Info, TPV List, Plan Výroby...) → **Read / Write / Skryté**
   - Akcie typu "Vytvořit projekt", "Smazat", "Vidieť ceny" → samostatné **on/off feature flagy**

2. **Master prepínač modulu = hard gate:**
   Ak je modul vypnutý → modul **sa vôbec nezobrazí v navigácii** a všetky jeho sub-flagy sa ignorujú. Aby si nastavil sub-záložky, musíš najprv zapnúť modul.

3. **Modul Výroba** = ponecháme `canManageProduction` ako master, pridáme `canAccessQC`. Daylog ostane samostatný flag (už je tam).

4. **Ukladanie:** dvojvrstvové ako teraz — `role_permission_defaults` (default pre rolu) + `user_roles.permissions` (per-user override).

---

## Nové permission flagy (rozšírenie `PermissionFlag` v `src/lib/permissionPresets.ts`)

### Master flagy modulov (gate)
| Flag | Modul |
|---|---|
| `canAccessSystem` | Systém (Nastavenia: kurzy, réžie, výp. logika) |
| `canAccessOsoby` | Správa osob |
| `canAccessProjectInfo` | Project Info modul (= dnešné `/` Index) |
| existujúci `canAccessPlanVyroby` | Plán výroby |
| existujúci `canManageProduction` | Modul Výroba |
| existujúci `canAccessAnalytics` | Analytics |
| existujúci `canAccessTpv` | TPV — príprava výroby |

### Sub-záložky **Systém** (Áno/Nie)
- `canAccessExchangeRates` *(view kurzového lístka — write je `canManageExchangeRates`)*
- `canAccessOverheadProjects` *(view réžie — write je `canManageOverheadProjects`)*
- `canAccessFormulaBuilder` *(prístup k Výpočetnej logike — write je `canAccessSettings`)*

### Sub-záložky **Správa osob** (Áno/Nie pre view, write už máme)
- `canAccessZamestnanci` (view) — write = `canManagePeople`
- `canAccessExternistiTab` (view) — write = `canManageExternisti`
- `canAccessUzivateleTab` (view) — write = `canManageUsers`
- `canAccessOpravneni` (view + write zostáva `canManageUsers`)
- `canAccessKatalog` (view = vidieť pozície/úseky; write = `canManagePeople`)
- `canAccessKapacita` (view kapacity; write = `canManageProduction`)

### Sub-záložky **Analytics** (Áno/Nie)
- `canAccessAnalyticsProjekty`
- `canAccessAnalyticsRezije`
- `canAccessAnalyticsDilna`
- `canAccessAnalyticsVykaz`

### Sub-záložky **Project Info** (Read/Write/Skryté kde dáva zmysel)
- `canViewProjectInfoTab` / `canWriteProjectInfoTab` (R/W) — záložka *Project Info*
- `canViewPMStatusTab` / `canWritePMStatusTab` (R/W) — *PM Status*
- `canViewTPVStatusTab` / `canWriteTPVStatusTab` (R/W) — *TPV Status*
- `canViewTPVListTab` / `canWriteTPVListTab` (R/W) — *TPV List* (existujúci `canManageTPV` = write)
- `canViewHarmonogram` / `canWriteHarmonogram` (R/W)
- Features (a–h) zostávajú **bin** flagy ako máme:
  `canCreateProject`, `canDeleteProject`, `canEditProjectCode`, `canEditSmluvniTermin`, `canSeePrices`, `canUploadDocuments`, `canPermanentDelete`, `canAccessRecycleBin`

### Sub-záložky **Plán výroby** (R/W kde edit, on/off pre Forecast)
- `canViewPlanKanban` / `canWritePlanKanban` (R/W) — masterom je `canAccessPlanVyroby` / `canWritePlanVyroby`, toto sú jemnejšie
- `canAccessForecast` (Áno/Nie) — Forecast je len pre managerov
- `canAccessMidflight` — *podľa tvojej požiadavky vypustené z UI*, flag sa nepridá

### Sub-záložky **Modul Výroba** (R/W)
- `canViewVyroba` / **master = existujúci `canManageProduction`**
- `canAccessDaylog` (existuje, ostane on/off)
- **NOVÝ `canAccessQC`** (Áno/Nie) — nahradí významovo `canQCOnly` v UI logike (canQCOnly ostane back-compat pre RLS)

### Sub-záložky **TPV — Príprava výroby** (R/W)
- `canViewTpvPrehlad` / `canWriteTpvPrehlad`
- `canViewTpvMaterial` / `canWriteTpvMaterial`
- `canViewTpvHodinovaDotacia` / `canWriteTpvHodinovaDotacia`
- master = `canAccessTpv` / `canWriteTpv` (existujúce)

---

## Zmeny v kóde

### 1. `src/lib/permissionPresets.ts`
- Pridať všetky nové flagy do `PermissionFlag` union, `PERMISSION_FLAGS` arrayu a `PERMISSION_LABELS`.
- Aktualizovať `ROLE_PRESETS` — owner: všetko true; admin: všetko true okrem QC/TPV; rozumné defaults pre PM, vedouci_pm, mistr atď. (podľa toho čo dnes vidia).

### 2. `src/components/osoby/OsobyOpravneni.tsx` — kompletná reorganizácia GROUPS
Prerobiť `GROUPS` array tak, že každá skupina = **modul**, s novou štruktúrou:

```ts
type Group = {
  title: string;
  masterFlag: PermissionFlag;   // master toggle modulu
  rows: Row[];                  // sub-záložky a features (zobrazia sa iba ak master = true)
  icon?: { bg: string; color: string };
};
```

Skupiny v poradí: **Project Info, Plán výroby, Modul Výroba, TPV, Analytics, Správa osob, Systém**.

UI správanie:
- Vedľa názvu modulu **veľký Switch (master)**.
- Ak master = `false` → sub-rows sú **disabled & sivé** (vidno čo by išlo zapnúť, ale nedá sa).
- Ak master = `true` → sub-rows aktívne. `tri` rows = Read/Write/Skryté segmented; `bin` rows = on/off.

### 3. `src/hooks/useAuth.tsx`
Pridať do `AuthContextType` všetky nové `can*` boolean shortcuts (resp. exposovať cez `permissions`).

**Master gate logika** v `resolvePermissions` (alebo v useAuth pri vystavovaní):
Ak `canAccessAnalytics === false` → vynútiť všetky `canAccessAnalytics*` sub-flagy = false. To isté pre ostatné moduly.

```ts
// Príklad
if (!perms.canAccessAnalytics) {
  perms.canAccessAnalyticsProjekty = false;
  perms.canAccessAnalyticsRezije = false;
  perms.canAccessAnalyticsDilna = false;
  perms.canAccessAnalyticsVykaz = false;
}
```

### 4. Konzumenti (gating UI)

| Súbor | Zmena |
|---|---|
| `src/App.tsx` (`AnalyticsRoute`, `PlanRoute`, `TpvRoute`, `OsobyRoute`, `VyrobaRoute`) | Pridať Route guard pre `canAccessProjectInfo` na `/`, `canAccessSystem` (ak treba). Existujúce gate-y zostanú. |
| `src/components/production/ProductionHeader.tsx` | Skryť tlačidlá modulov v navigácii podľa master flagov (Analytics, Plán výroby, Výroba, TPV, Osoby) — väčšina už je. Pridať gate pre Project Info. |
| `src/pages/Osoby.tsx` | Visibility tabov `zamestnanci/externisti/uzivatele/opravneni/katalog/kapacita` naviazať na nové `canAccess*` namiesto `isAdmin/isOwner`. |
| `src/pages/Analytics.tsx` | Sub-tabs (Projekty/Réžie/Dílna/Výkaz) visibility podľa nových sub-flagov. |
| `src/pages/Index.tsx` | Sub-tabs Project Info / PM Status / TPV Status / TPV List / Harmonogram visibility podľa nových R/W flagov. ReadOnly mód podľa `canWrite*`. |
| `src/pages/PlanVyroby.tsx` | Forecast tlačidlo / mode podmieniť `canAccessForecast`. |
| `src/pages/Vyroba.tsx` | QC sekcia podmienená `canAccessQC` (namiesto `canQCOnly` v UI). |
| `src/pages/Tpv.tsx` | Sub-tabs Prehľad/Material/Hodinová dotácia podľa nových sub-flagov. |
| `src/components/ProductionHeader.tsx` Settings dropdown položky | Kurzy / Réžia / Statusy / Formula builder — gating na nové `canAccess*` flagy (view) + existujúce `canManage*` (write). |

### 5. Migrácia DB
- **Nepotrebujeme** schema migration (permissions sú JSONB, prijmú nové kľúče automaticky).
- **Data migration:** Reset `user_roles.permissions = NULL` pre všetkých, ktorí nemajú `canAccessProjectInfo` v JSONB — aby zdedili nové defaults z `role_permission_defaults`. (Rovnako ako pri minulej oprave.)
- Upsert `role_permission_defaults` pre všetky role s novou kompletnou sadou flagov.

### 6. Backward compatibility
- `canQCOnly` ostane v presetoch a v RLS politikách (mení sa len UI semantika).
- `canManageProduction` ostane masterom modulu Výroba.
- Všetky existujúce flagy ostávajú — pridávame iba nové.

---

## Akceptačné kritériá

1. V Oprávnění vidím **7 sekcií modulov** so master switchom.
2. Vypnem master *Analytics* pre rolu **PM** → uložím → po refreshi PM nevidí Analytics v menu **ani** žiadne sub-záložky Analytics.
3. Zapnem *Analytics* pre PM, ale vypnem sub-flag `canAccessAnalyticsRezije` → PM vidí Analytics, ale tab "Réžie" je skrytý.
4. Pre Project Info → PM Status nastavím **Read** → PM vidí PM Status tab, polia sú read-only.
5. Owner v simulácii roly PM vidí presne to isté čo reálny PM.
6. Konfigurácia prežije F5 refresh aj relogin (per-user override + role default sa správne načítajú).
7. Existujúci používatelia, ktorí majú staré snapshoty bez nových flagov, dostanú resetované permissions na NULL → zdedia nové role defaults.

---

## Mimo rozsahu (potvrdené)
- **Midflight** — necháme bez UI flagu (už je vypustené).
- DB schema migration — netreba (JSONB).
- Real-time subscription na zmeny permissions — má sa to prejaviť po refreshi (ako teraz).
