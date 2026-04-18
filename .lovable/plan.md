

## Plán: Režie ako samostatná kategória v Analytics

### Cieľ
Oddeliť interné "režie" projekty (Z-2511-998, Z-2511-999, …) od bežných projektov v Analytics, vyhodnocovať ich utilizáciu samostatne a umožniť admin správu mapovania kód → názov.

### DB zmeny

**Nová tabuľka `overhead_projects`** (mapovanie režijných kódov):
```text
id uuid PK
project_code text UNIQUE NOT NULL  -- napr. 'Z-2511-998'
label text NOT NULL                 -- napr. 'Režie Dílna'
description text NULL
sort_order int DEFAULT 0
is_active bool DEFAULT true
created_at, updated_at
```
- RLS: authenticated read, admin/owner write
- Seed: `Z-2511-998 → Režije Dílna`, `Z-2511-999 → Provozní režije`

### Logika (`useAnalytics.ts`)

1. Načítať `overhead_projects` paralelne s ostatnými dotazmi
2. Pre každý riadok v `hoursMap` skontrolovať, či `ami_project_id` je v overhead set:
   - Ak **áno** → priradiť `category: "rezie"`, `project_name = label` z mapovania, ignorovať `projects` tabuľku
   - Ak **nie a v projects** → `category: "project"` (ako doteraz)
   - Ak **nie a nie v projects** → `category: "unmatched"` (existujúce ghost rows)
3. Rozšíriť `AnalyticsRow` o `category: "project" | "rezie" | "unmatched"`
4. Rozšíriť `AnalyticsSummary` o:
   - `totalRezieHours: number`
   - `totalProjectHours: number` (len kategória "project")
   - `reziePct: number` — `totalRezieHours / (totalRezieHours + totalProjectHours) * 100`

### UI zmeny (`Analytics.tsx`)

**1) Nová KPI dlaždica "Režie %"**
- V hornom rade dashboard kariet
- Zobrazí `reziePct` + absolútne `totalRezieHours h`
- Podtitulok: porovnanie s utilizáciou z `production_settings.utilization_pct` (default 83 %), ak väčšie → amber, ak menšie/rovné → zelená
- Tooltip: rozpis per režijný projekt (Z-2511-998: X h, Z-2511-999: Y h)

**2) Nový filter chip "Režije"** vedle existujúcich (Výroba / Dokončeno / Vše / atď.)
- Default view (Vše / Výroba / Dokončeno) → **skryje** režijné riadky
- Filter "Režije" → ukáže iba režijné projekty s ich `label` z `overhead_projects`
- Unmatched riadky zostávajú v "Vše" ako doteraz

**3) Správa režijných projektov**
- Nová sekcia v Nastavenia → "Režijné projekty" (admin/owner)
- Tabuľka kód / názov / aktívne / akcia (edit, deactivate)
- Tlačidlo "+ Pridať režijný kód"
- Dialog: `project_code`, `label`, `description`, `is_active`

### Súbory

**Nové:**
- `supabase/migrations/...` — `overhead_projects` table + RLS + seed
- `src/hooks/useOverheadProjects.ts` — CRUD hook
- `src/components/admin/OverheadProjectsSettings.tsx` — admin UI

**Upravené:**
- `src/hooks/useAnalytics.ts` — pridať overhead fetch, kategorizácia, nové summary metriky
- `src/pages/Analytics.tsx` — nová KPI dlaždica + filter chip + napojenie na settings
- `src/components/AccountSettings.tsx` (alebo wherever sa otvárajú settings) — link na novú sekciu

### Otvorené (potvrď)
1. **Porovnávacia hodnota pre Režie %** — má sa porovnať s `production_settings.utilization_pct` (83 %) ako "očakávaná réžia = 100 - utilization", alebo má admin nastaviť vlastný target (napr. "cieľová réžia 17 %") v overhead settings?
2. **Filter chip umiestnenie** — vedľa stávajúcich status chip-ov, alebo ako samostatný toggle „Zobraziť režie" nad tabuľkou?

