## Plán: Modul TPV — Príprava výroby

Postavím samostatný modul na `/tpv` s tromi záložkami, vlastnou ikonou v topbare a dvomi novými DB tabuľkami. Existujúca `tpv_items` zostáva nedotknutá — len z nej čítame.

---

### 1. Database (migrácia)

Vytvorím dve nové tabuľky presne podľa špecifikácie:

- **`tpv_preparation`** (1:1 k `tpv_items`)
  - FK `tpv_item_id → tpv_items(id) ON DELETE CASCADE`, `UNIQUE(tpv_item_id)`
  - polia: `doc_ok bool`, `hodiny_manual numeric`, `hodiny_schvalene bool`, `readiness_status text` s CHECK constraintom (`rozpracovane | ready | riziko | blokovane`), `notes`, `created_at`, `updated_at`
- **`tpv_material`** (1:N k `tpv_items`)
  - FK `tpv_item_id → tpv_items(id) ON DELETE CASCADE`
  - polia: `nazov`, `mnozstvo`, `jednotka`, `dodavatel`, `objednane_dat`, `dodane_dat`, `stav` s CHECK (`nezadany | objednane | caka | dodane`), `poznamka`, timestamps
- **RLS** pre obe podľa vzoru ostatných production tabuliek:
  - SELECT pre `authenticated` = true
  - INSERT/UPDATE/DELETE pre `owner | admin | pm | konstrukter` (TPV príprava je doména konstruktérov + nákupca = pm/admin)
  - `is_test_project(project_id) = is_test_user()` izolácia, aby tester sandbox neunikol do produkcie (rovnaký vzor ako `data_log`)
- **Trigger** `update_updated_at_column` na obe tabuľky
- **Indexy** na `tpv_item_id` a `project_id` pre obe

Po migrácii sa `src/integrations/supabase/types.ts` vygeneruje automaticky.

> Readiness logika sa **nepočíta v DB** — počíta sa v UI/hooku z aktuálneho stavu `tpv_preparation` + `tpv_material`. Pole `readiness_status` zostane v tabuľke ako voliteľný manuálny override (zatiaľ ho len ukladáme, default `'rozpracovane'`).

---

### 2. Routing + topbar ikona

- **`src/App.tsx`**: nová route `/tpv` chránená novým `TpvRoute` guardom (rovnaký pattern ako `PlanRoute`). Prístup: `canAccessPlanVyroby || canManageTPV || isAdmin || isOwner` (TPV pripravujú konstruktéri + admini).
- **`PersistentDesktopHeader`**: pridať `module: "tpv"` keď `pathname === "/tpv"`.
- **`ProductionHeader.tsx`**:
  - rozšíriť `HeaderModule` o `"tpv"`
  - moduleLabel: `"TPV — Príprava výroby"`
  - **Nová ikona** medzi LayoutDashboard (Project Info) a CalendarRange (Plán výroby). Použijem `ClipboardCheck` z lucide-react. Aktívny stav rovnaký ako ostatné — `bg-primary-foreground/10`.

### 3. Stránka `src/pages/Tpv.tsx` — shell

Použijem existujúci `PageTabsShell` (rovnako ako Analytics/Osoby) s tromi záložkami:
- `summary` → "Prehľad pipeline"
- `material` → "Materiál"
- `hodiny` → "Hodinová dotácia"

URL param `?tab=`. Defaultne `summary`.

### 4. Hooks (nové súbory v `src/hooks/`)

- **`useTpvPipelineProjects.ts`** — vracia projekty s `status IN ('Příprava','Konstrukce','TPV')` ktoré majú aspoň jednu `tpv_items` položku. Používa `useProjects` + `useAllTPVItems`, joinuje a vracia agregáty (počet items, termín výroby z `expedice/montaz/predani/datum_smluvni` cez existujúci `resolveDeadline`, sum hodín).
- **`useTpvPreparation.ts`** — `useTpvPreparationForProject(projectId)`, `useUpsertTpvPreparation()` (upsert na `tpv_item_id` UNIQUE), `useBulkApproveHours(projectId)` (set `hodiny_schvalene=true`).
- **`useTpvMaterial.ts`** — CRUD: `useTpvMaterialsForProject(projectId)`, `useTpvMaterialsAll()` (cez všetky projekty pre per-materiál view s konsolidáciou), `useUpsertTpvMaterial()`, `useDeleteTpvMaterial()`.
- **`src/lib/tpvReadiness.ts`** — čistá funkcia `computeReadiness(prep, materials): 'blokovane' | 'riziko' | 'ready' | 'rozpracovane'` podľa pravidiel zo zadania.

### 5. Tab 1 — Summary (`src/components/tpv/TpvSummaryTab.tsx`)

- 4 metric cards: V pipeline / Ready / Rizikové / Blokované
- Filter chips: Všetky | Blokované | Rizikové | Ready
- **Project pipeline table** so stĺpcami zo zadania. Ľavý 3px accent border z `getProjectColor(project_id)`. Termín výroby s countdown (red <14 dní, amber <30) — využijem existujúci `resolveDeadline` z `src/lib/deadlineWarning.ts`.
- **Rozbaľovacia inline detail karta** pri kliknutí na riadok (state `expandedProjectId`):
  - tabuľka items: kód, názov, výkres dot (8px green/red), agreg. materiál stav, hodiny (read-only z `tpv_items.hodiny_plan` + editable override `hodiny_manual`), stav badge
  - footer: Celkom hodín + tlačidlá `Uložiť`, `Odoslať rizikovo` (red outline), `Odoslať do výroby` (blue filled, disabled kým nie sú všetky `ready`/`riziko`)
  - "Odoslať do výroby" volá existujúci flow z `TPVList.tsx` (`executeSendToProduction`) — vyextrahujem ho do hooku `useSendItemsToProduction` aby sa dal volať aj odtiaľto bez duplikácie.

### 6. Tab 2 — Materiál (`src/components/tpv/TpvMaterialTab.tsx`)

Toggle `Per projekt | Per materiál` (Tabs alebo button group).

**Per projekt view:**
- Filter: project selector (Select) + stav selector
- Tabuľka materiálov pre vybraný projekt (alebo všetky), spojená s `tpv_items` cez `tpv_item_id` aby sme vedeli kód/názov položky
- Inline edit pre `stav`, `objednane_dat`, `dodane_dat`, `poznamka`, `dodavatel` — využijem existujúci `InlineEditableCell`
- Pri každom item-e tlačidlo `+` na pridanie ďalšieho materiálu (jeden item môže mať viac materiálov)

**Per materiál view (read-only):**
- 3 metric cards: Unikátnych materiálov | Zdieľané 2+ projektov (blue badge) | Čaká na dodanie
- Grupovanie cez `tpv_material.nazov` (case-insensitive trim). Pre každú skupinu:
  - hlavný riadok: názov + dodávateľ, celkom množstvo, "X proj." badge (modrý ak ≥2, šedý inak), agreg. stav
  - rozbalené: sub-riadky per project — kód, mini horizontálny bar (proportional quantity vzhľadom k max v skupine), množstvo + jednotka, stav

### 7. Tab 3 — Hodinová dotácia (`src/components/tpv/TpvHoursTab.tsx`)

- Project selector (len projekty z TPV pipeline)
- 4 metric cards:
  - **Budget** = `prodejni_cena × cost_production_pct / 100` (z `projects` tabuľky; `cost_production_pct` má fallback z `cost_breakdown_presets` defaultu rovnako ako v RozpadCeny)
  - **Auto plán** = `Σ tpv_items.hodiny_plan`
  - **Po úprave** = `Σ COALESCE(tpv_preparation.hodiny_manual, tpv_items.hodiny_plan)`
  - **Zostatok** = budget − po úprave (amber border + warning ak <10% budgetu)
- Alert banner ak zostatok <10% budgetu
- Tabuľka: Kód | Názov | Auto (gray) | Manuálny zásah (editable, modrý border po zmene) | Rozdiel (+amber/-red/0 gray) | Stav (OK / Upravené / Veľká odchýlka >50% → row bg `#FCEBEB`)
- Footer: Celkom / Budget / Zostatok + `Uložiť` + `Schváliť hodiny` (set `hodiny_schvalene=true` pre všetky items projektu)

### 8. Status badges + design tokens

Vytvorím malý helper `src/components/tpv/TpvStatusBadge.tsx`:
- Ready `#EAF3DE` / `#27500A`
- Riziko `#FAEEDA` / `#633806`
- Blokované `#FCEBEB` / `#791F1F`
- Rozpracované `#F1EFE8` / `#5F5E5A`
- pill, 10px font, uppercase letter-spacing

Tabuľky používajú existujúce shadcn `Table` so štýlmi rovnakými ako Project Info / Analytics (header `bg-muted`, 10px uppercase, hover `bg-muted/50`).

### 9. Notifikácie (light)

Pri "Odoslať do výroby" / "Odoslať rizikovo" — využijem existujúce `createNotification` aby PM dostal notifikáciu (rovnaký vzor ako v `useTPVItems`). Žiadne nové typy notifikácií, použijem existujúce TPV-related typy + nový `tpv_sent_to_production_risky`.

### 10. Memory update

Pridám `mem://features/tpv-status/preparation-module.md` s popisom modulu a aktualizujem `mem://index.md`.

---

### Súbory ktoré vytvorím
1. migrácia (`tpv_preparation`, `tpv_material` + RLS + trigger + indexy)
2. `src/pages/Tpv.tsx`
3. `src/components/tpv/TpvSummaryTab.tsx`
4. `src/components/tpv/TpvMaterialTab.tsx`
5. `src/components/tpv/TpvHoursTab.tsx`
6. `src/components/tpv/TpvStatusBadge.tsx`
7. `src/hooks/useTpvPipelineProjects.ts`
8. `src/hooks/useTpvPreparation.ts`
9. `src/hooks/useTpvMaterial.ts`
10. `src/lib/tpvReadiness.ts`

### Súbory ktoré upravím
- `src/App.tsx` — route + guard + module detection
- `src/components/production/ProductionHeader.tsx` — `"tpv"` module + nová ikona medzi Project Info a Plán výroby
- `src/components/TPVList.tsx` — vyextrahovať `executeSendToProduction` do reusable hooku (alebo vytvoriť shared `src/lib/sendTpvToProduction.ts`)
- `mem://index.md`

### Otvorené otázky (pokračujem s defaultmi ak nepovieš inak)
- **Mobile**: zatiaľ len desktop (`hidden md:block` shell). Mobil neriešim v prvej iterácii.
- **Permissions**: prístup na `/tpv` pre `admin | owner | pm | konstrukter`. `vyroba` a `viewer` nemajú prístup.
- **Per-materiál konsolidácia**: kľúč skupiny = `lower(trim(nazov))`. Ak chceš striktnejšie (vrátane `dodavatel` alebo jednotky), povedz.