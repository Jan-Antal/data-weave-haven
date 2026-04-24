## Plán: Modul TPV v2 — Príprava výroby (rozšírená špec)

**Princíp:** READ-everywhere, WRITE-own. Modul číta z `projects`, `tpv_items`, `project_stages`, `people`, `production_*` atď., ale **zapisuje výhradne** do nových `tpv_*` tabuliek vyhradených pre tento modul. Existujúce live tabuľky zostávajú nedotknuté.

Stav: existujúce tabuľky `tpv_preparation` a `tpv_material` z v1 zostávajú a rozšírime ich o nové sady tabuliek pre subdodávky, dodávateľov, schvaľovanie hodín a TPV inbox/úlohy.

---

### 1. Database (migrácia v2)

#### 1.1 Nová rola
- Pridať `'kalkulant'` do enum `public.app_role`.
- RLS pravidlá pre TPV tabuľky budú akceptovať: `owner | admin | pm | konstrukter | kalkulant`.

#### 1.2 Nové tabuľky (všetky TPV-OWNED)

- **`tpv_project_preparation`** (1:1 k projektu, agreguje stav prípravy)
  - `project_id text UNIQUE` (FK na `projects.project_id`)
  - `calc_status text` CHECK (`draft | review | released`) default `draft`
  - `readiness_overall numeric` (0–100, počíta UI, len cache)
  - `target_release_date date`, `notes text`, timestamps
  - trigger updated_at

- **`tpv_subcontract`** (1:N k projektu, subdodávky)
  - `project_id text`, `tpv_item_id uuid NULL` (voliteľne viazané na položku)
  - `nazov text`, `popis text`, `mnozstvo numeric`, `jednotka text`
  - `dodavatel_id uuid NULL` (FK na `tpv_supplier`)
  - `cena_predpokladana numeric`, `cena_finalna numeric`, `mena text default 'CZK'`
  - `stav text` CHECK (`navrh | rfq | ponuka | objednane | dodane | zruseno`) default `navrh`
  - `objednane_dat date`, `dodane_dat date`, `poznamka text`, timestamps

- **`tpv_supplier`** (CRM dodávateľov — **merge supplier + contact**)
  - `nazov text NOT NULL`, `ico text`, `dic text`
  - kontaktné polia priamo: `kontakt_meno text`, `kontakt_email text`, `kontakt_telefon text`, `kontakt_pozice text`
  - `web text`, `adresa text`, `kategorie text[]` (napr. `['kov','sklo']`)
  - `rating int` (1–5), `notes text`, `is_active bool default true`, timestamps
  - **POZNÁMKA:** ak v budúcnosti bude treba viacero kontaktov per dodávateľ, doplníme samostatný `tpv_supplier_contact`. Zatiaľ jeden kontakt per riadok stačí.

- **`tpv_supplier_task`** (úlohy/follow-upy s dodávateľom)
  - `supplier_id uuid` (FK), `subcontract_id uuid NULL` (FK), `project_id text NULL`
  - `title text`, `description text`, `due_date date`
  - `status text` CHECK (`open | in_progress | done | cancelled`) default `open`
  - `assigned_to uuid` (FK na `auth.users`), `created_by uuid`, timestamps

- **`tpv_subcontract_request`** (RFQ — žiadosť o cenovú ponuku)
  - `subcontract_id uuid` (FK), `supplier_id uuid` (FK)
  - `sent_at timestamptz`, `responded_at timestamptz`, `cena_nabidka numeric`, `mena text`
  - `termin_dodani date`, `stav text` CHECK (`sent | received | accepted | rejected`) default `sent`
  - `poznamka text`, timestamps

- **`tpv_hours_allocation`** (workflow schvaľovania hodín — bez dotyku do `tpv_items`)
  - `project_id text`, `tpv_item_id uuid` (FK), `hodiny_navrh numeric`
  - `stav text` CHECK (`draft | submitted | approved | returned`) default `draft`
  - `submitted_by uuid`, `submitted_at timestamptz`
  - `approved_by uuid`, `approved_at timestamptz`
  - `return_reason text`, `notes text`, timestamps

- **`tpv_inbox_task`** (TPV-vlastné úlohy/inbox — pre denné riadenie konstruktérov a kalkulantov)
  - `project_id text NULL`, `tpv_item_id uuid NULL`
  - `title text`, `description text`, `category text` (napr. `material | doc | rfq | hours | other`)
  - `priority text` CHECK (`low | normal | high | urgent`) default `normal`
  - `assigned_to uuid`, `due_date date`
  - `status text` CHECK (`open | in_progress | done | cancelled`) default `open`
  - `created_by uuid`, timestamps

> **`tpv_supplier_price_list` zatiaľ nerealizujeme** — neskôr ako samostatná migrácia, ak bude potrebné.

#### 1.3 Notifikácie — bez novej tabuľky
- Použijeme existujúcu `public.notifications` (RLS už máme: user vidí len svoje).
- Nové hodnoty `type`:
  - `tpv_task_assigned` — pridelená TPV úloha
  - `tpv_task_due_soon` — úloha do 24h
  - `tpv_supplier_response_received` — RFQ odpoveď
  - `tpv_hours_submitted` — kalkulant odoslal návrh hodín
  - `tpv_hours_approved` / `tpv_hours_returned`
  - `tpv_subcontract_status_changed`
- Notifikačný panel rozšírime v ďalšej iterácii o sekciu „Inbox / Moje úlohy" napojenú na `tpv_inbox_task` + `tpv_supplier_task`.

#### 1.4 Views
- `vw_project_tpv_status` — agregát na projekt (z `tpv_project_preparation` + počty z `tpv_material`, `tpv_subcontract`, `tpv_hours_allocation`)
- `vw_open_tpv_tasks_by_user` — otvorené `tpv_inbox_task` + `tpv_supplier_task` per `assigned_to` (pre rozšírenie notifikačného panelu)

#### 1.5 RLS (jednotný vzor pre všetky nové tpv_* tabuľky)
- SELECT pre `authenticated` = true (s `is_test_project / is_test_user` izoláciou tam, kde je `project_id`)
- INSERT/UPDATE/DELETE pre `owner | admin | pm | konstrukter | kalkulant`
- Trigger `update_updated_at_column` na všetky tabuľky
- Indexy: `project_id`, `tpv_item_id`, `assigned_to`, `supplier_id`, `subcontract_id`, `status`

---

### 2. Routing + topbar
- Existujúca route `/tpv` zostáva. Žiadny meeting mode v tejto iterácii.
- TPV bell (mini inbox) **odložíme** spolu s prerábkou notifikačného panelu — pripravíme len dáta a hooky.

### 3. Stránka `src/pages/Tpv.tsx` — rozšírenie na 5 záložiek

| Tab key | Label | Komponent |
|---|---|---|
| `summary` | Prehľad pipeline | `TpvSummaryTab` (existuje, len doplniť KPI o subdodávky a hodiny workflow) |
| `material` | Materiál | `TpvMaterialTab` (existuje) |
| `subcontracts` | Subdodávky | **nový** `TpvSubcontractsTab` |
| `suppliers` | Dodávatelia | **nový** `TpvSuppliersTab` |
| `hodiny` | Hodinová dotácia | `TpvHoursTab` (existuje, doplniť workflow Draft → Submitted → Approved/Returned cez `tpv_hours_allocation`) |

### 4. Hooks (nové súbory)
- `useTpvProjectPreparation.ts` — CRUD k `tpv_project_preparation`
- `useTpvSubcontracts.ts` — CRUD + RFQ wizard helpers
- `useTpvSuppliers.ts` — CRUD k `tpv_supplier` (vrátane kontaktných polí v jednom riadku)
- `useTpvSupplierTasks.ts`
- `useTpvHoursAllocation.ts` — submit/approve/return workflow
- `useTpvInboxTasks.ts` — pre budúci inbox panel; už teraz vrátime `useMyOpenTpvTasks()` pre topbar badge
- `src/lib/tpvNotifications.ts` — helpery na vytvorenie notifikácií s `type='tpv_*'`

### 5. Komponenty (nové)
- `src/components/tpv/TpvSubcontractsTab.tsx` — tabuľka subdodávok + RFQ wizard (`SendRfqDialog`)
- `src/components/tpv/TpvSuppliersTab.tsx` — zoznam dodávateľov + `SupplierDialog` (edit/create) s kontaktnými poľami v jednom formulári
- `src/components/tpv/SupplierDialog.tsx`
- `src/components/tpv/SendRfqDialog.tsx`
- `src/components/tpv/HoursWorkflowBar.tsx` — submit/approve/return tlačidlá pre `TpvHoursTab`

### 6. Súbory ktoré upravím
- `src/pages/Tpv.tsx` — pridať 2 nové taby
- `src/components/tpv/TpvSummaryTab.tsx` — KPI rozšíriť o subdodávky a hours workflow stav
- `src/components/tpv/TpvHoursTab.tsx` — napojiť na `tpv_hours_allocation` (read pôvodných hodín z `tpv_items.hodiny_plan`, write výhradne do allocation)

### 7. Memory
- Nový súbor `mem://features/tpv/preparation-module-v2.md` s popisom architektúry "READ-everywhere, WRITE-own", zoznamom tabuliek a workflow.
- Update `mem://index.md`.

---

### Otvorené otázky (pokračujem s defaultmi ak nepovieš inak)
- **Kalkulant prístupy mimo `/tpv`:** zatiaľ rovnaké ako konstrukter (read-only všade, write len do `tpv_*`). OK?
- **TPV inbox panel v topbare:** v tejto iterácii len pripravím dáta + hook `useMyOpenTpvTasks`. UI panel doriešime v ďalšej iterácii spolu s mergom do existujúceho notifikačného panelu.
- **Subcontract ↔ tpv_item naviazanie:** voliteľné (`tpv_item_id NULL`). Subdodávka môže existovať aj na úrovni projektu bez konkrétnej položky.
