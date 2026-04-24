# Oprava permission systému

## Problém (root cause)

Skontroloval som DB, `useAuth`, `permissionPresets`, `OsobyOpravneni`, `ProductionHeader`, `MobileBottomNav`, `App.tsx` route guards a Settings dropdown. Našiel som **3 reálne bugy** a **1 nekonzistenciu UI**, ktoré spôsobujú, že PM (a iné role) reálne nevidia funkcie, ktoré majú v matici „povolené".

### Bug 1 — PM nevidí ikonu „Plán výroby" v desktop hlavičke

V `src/components/production/ProductionHeader.tsx` (riadky 193–236) sú navigačné tlačidlá **Výroba / Plán Výroby / Analytics** zabalené do hardcoded podmienky `(isAdmin || isOwner)`. To znamená:

- PM má `canAccessPlanVyroby = true`, ale tlačidlo na Plán Výroby sa mu **vôbec nezobrazí**.
- Rovnako `canAccessAnalytics`, `canManageProduction`, `canQCOnly` sa pri navigácii ignorujú.
- Route guard `PlanRoute` v `App.tsx` síce povolí prístup cez priamu URL, ale UI nemá kde kliknúť.

DB potvrdzuje, že `Aleš Macháček`, `Michal Konečný`, `Josef Heidinger` (role `pm`) majú práve `canAccessPlanVyroby: false` v overrides — takže pri ich nastaveniach **nemajú prístup**, ale `Radim Křenek` (PM bez overrides → preset) `canAccessPlanVyroby: true` a stále nevidí ikonu. Skontrolujeme aj iné role.

### Bug 2 — Mobile bottom nav rovnaká chyba

V `src/components/mobile/MobileBottomNav.tsx` (r. 14, 20) sa „Výroba" zobrazuje len ak `isAdmin || isOwner || isVyroba`. PM s `canAccessPlanVyroby` to nevidí.

### Bug 3 — Settings dropdown ignoruje permission flags

V `ProductionHeader.tsx` (r. 320–344) sú položky `Rozpad ceny`, `Režijní projekty`, `Výpočetní logika`, `Reset dát výroby` zamknuté na `isAdmin`, hoci na ne existujú permission flags (napr. `canManageOverheadProjects` má aj `vedouci_pm`/`pm`/`kalkulant`). Položka `Správa osob` je za `canManageUsers || canManagePeople`, ale tlačidlo **Settings ozubené koliesko** sa zobrazí len ak `canAccessSettings || realRole === "owner"` — PM nemá `canAccessSettings`, takže celý dropdown vrátane `Správa osob` nevidí, hoci `canManagePeople = true` v presete.

### Bug 4 — Save v OsobyOpravneni nikdy neuloží stav „rovnaký ako preset"

V `OsobyOpravneni.tsx`, `persistSave()` (r. 449) ukladá `draftPerms` do `user_roles.permissions` cez UPDATE. Keď admin klikne na rolu, draft sa inicializuje z presetu, **takže ak chce niečo „resetovať na preset" alebo zmeniť 1 flag a uložiť pre celú rolu, uloží sa kompletný JSON do DB pre všetkých**. Tým pádom rola už **NEPOUŽÍVA preset**, ale natvrdo zafixovaný snapshot. Akékoľvek budúce zmeny presetov v kóde sa ignorujú.

Navyše: tlačidlo „Uložiť" píše „uložené pre rolu", ale neexistuje žiadne tlačidlo „Resetovať na preset" — takže nedá sa vrátiť späť.

## Plán opravy

### 1. ProductionHeader — naviazať navigáciu na permissions

Súbor: `src/components/production/ProductionHeader.tsx` (r. 193–236, 295–344)

Zmeny:
- **Výroba** (r. 193–206): zobraziť ak `canManageProduction || canQCOnly` (namiesto `isAdmin || isOwner`).
- **Plán Výroby** (r. 208–221): zobraziť ak `canAccessPlanVyroby`.
- **Analytics** (r. 223–236): zobraziť ak `canAccessAnalytics`.
- **Settings ozubené koliesko** (r. 295): zobraziť ak `canAccessSettings || canManagePeople || canManageUsers || canManageExchangeRates || canManageStatuses || canAccessRecycleBin || canManageOverheadProjects || isOwner` — t.j. ak má aspoň jednu položku v menu, zobraz koliesko.
- Položky vnútri dropdown: použiť konkrétne flags namiesto `isAdmin`:
  - `Rozpad ceny` → `canAccessSettings`
  - `Režijní projekty` → `canManageOverheadProjects`
  - `Výpočetní logika` → `canAccessSettings && (isAdmin || isOwner)` (citlivé — ostáva admin-only)
  - `Reset dát výroby` → `isAdmin` (zostáva)

### 2. MobileBottomNav — naviazať na permissions

Súbor: `src/components/mobile/MobileBottomNav.tsx` (r. 14, 20)

`canAccessProduction = canManageProduction || canQCOnly || canAccessPlanVyroby || isVyroba || isAdmin || isOwner`.

### 3. OsobyOpravneni — pridať „Reset na preset" + indikátor stavu

Súbor: `src/components/osoby/OsobyOpravneni.tsx`

- Pri načítaní role: ak **aspoň jeden užívateľ má custom permissions**, zobraz badge „Vlastné nastavenie (X osôb)".
- Pridať tlačidlo **„Vrátiť na predvolené"** vedľa „Uložiť" — uloží `permissions: null` do DB pre všetkých v role, čím sa vráti používanie presetu z kódu.
- Pridať na pravej strane sekcie info text: *„Aktuálne nastavenie sa berie z {predvoleného presetu | vlastnej konfigurácie z DB}"*.
- Drobnosť: po uložení invalidovať session — užívateľom sa preložia nové práva pri ďalšom auth state change. (Reálne sa už načíta správne pri ďalšom prihlásení, takže pridáme len toast „Užívatelia uvidia zmenu po obnovení stránky".)

### 4. Pridať diagnostický „Permission preview" pre Owner

V `AccountSettings` (alebo nový tab v Osoby/Oprávnenia) pridať pre Ownera možnosť „Zobraziť výsledné permissions pre rolu X" — zoznam všetkých 24 flagov s ✓/✗, aby bolo jasné, čo daná rola reálne dostane (preset + override merge).

## Ovplyvnené súbory

- `src/components/production/ProductionHeader.tsx`
- `src/components/mobile/MobileBottomNav.tsx`
- `src/components/osoby/OsobyOpravneni.tsx`

## Out of scope (na potvrdenie)

- Návrh **nemení** preset hodnoty pre PM v `permissionPresets.ts`. PM v preset-e má `canAccessPlanVyroby: true, canAccessDaylog: true, canSeePrices: true, canManageTPV: true, canCreateProject: true, …` Reálne PM používatelia v DB (Heidinger, Konečný, Macháček) majú **override `canAccessPlanVyroby: false`** — t.j. niekto im to v UI vypol. Po oprave Bug 1+3 to admin môže v `OsobyOpravneni` jednoducho prepnúť späť a uložiť.
- Nemažem hardcoded `isAdmin` checky v iných miestach (UserManagement transfer ownership, RecycleBin permanent delete) — tie sú zámerne reštriktívne na destruktívne operácie.
