

## Logika výpočtu hodín v projekte (BEZ historických odpočtov)

### Krok 1 — Plán hodín projektu (`computePlanHours`)

Vstupy z DB:
- `tpv_items` projektu (cena, počet, status)
- `projects.prodejni_cena`, `marze`, `cost_production_pct`, `currency`, `created_at`
- `production_settings.hourly_rate` (default 550 Kč/h)
- `exchange_rates` (pre EUR projekty)
- `formula_config` (vzorce s defaultmi)

Vzorce (defaulty):
```
itemCostCzk     = cena × pocet × (eurRate ak EUR)
scheduled_hours = floor(itemCostCzk × (1 − marze) × production_pct / hourly_rate)
hodiny_plan_proj = floor(prodejni_cena × (1 − marze) × production_pct / hourly_rate)

tpv_hours_raw = SUM(scheduled_hours pre všetky TPV položky so statusom != Zrušeno a cena > 0)
project_hours = hodiny_plan_proj

hodiny_plan = MAX(tpv_hours_raw, project_hours)   // nikdy nestratíme hodiny pod cenu projektu
```

Ak `project_hours > tpv_hours_raw`, scale_ratio = `project_hours / tpv_hours_raw` a per-item TPV hodiny sa proporcionálne zväčšia (posledná položka dostane zvyšok aby sum sedel presne).

### Krok 2 — Distribúcia hodín do Inbox + Schedule (BEZ histórie)

Pre každý projekt po `computePlanHours`:

1. **TPV-mapované položky** (inbox + non-midflight schedule majú `item_code` čo existuje v `tpv_items`):
   - `tpv_full_hours` = `result.item_hours[i].hodiny_plan` (už škálované).
   - `activeParts` = počet **aktívnych** chain rows pre ten istý `item_code` (inbox `status=pending` + schedule `status≠cancelled` a `is_midflight=false`).
   - `per_row_hours = tpv_full_hours / activeParts`
   - `per_row_czk = per_row_hours × hourly_rate`

2. **Orphan položky** (inbox bez TPV match, bez `adhoc_reason`):
   - `assigned = SUM(per_row_hours všetkých TPV-mapovaných)`
   - `remainingProjectHours = max(0, hodiny_plan − assigned)`
   - `per_orphan_hours = remainingProjectHours / orphanCount`

3. **Adhoc položky** (`adhoc_reason IS NOT NULL`): nedotknuté, manuálne zadané.
4. **Midflight rows** (`is_midflight=true`): nedotknuté, len historický záznam — **nezapočítavajú sa do `assigned` ani neuberajú z `hodiny_plan`**.

### Príklad — Z-2605-001

DB stav:
- `prodejni_cena = 924 000 CZK`, `marze = 15%`, `cost_production_pct = 25%`, hourly_rate = 550
- TPV items: T01 (36h), T02 (133h), TK01 (37h) — `tpv_hours_raw = 206h`
- `project_hours = floor(924000 × 0.85 × 0.25 / 550) = 357h`
- `hodiny_plan = MAX(206, 357) = 357h` (scale_ratio = 1.733)

Po škálovaní:
- T01 → 62h, T02 → 230h, TK01 → 65h (sum = 357h)

Aktuálne aktívne chains v inboxe (všetky bundle vrátené do inboxu):
- T01: 1 inbox row → `62 / 1 = 62h`
- T02: 1 inbox row → `230 / 1 = 230h`
- TK01: 1 inbox row → `65 / 1 = 65h`
- **Inbox total = 357h** ✅ presne sedí na plán projektu.

Ak by bol T02 rozdelený na 2 aktívne časti (split_total=2 v inboxe alebo 1 inbox + 1 schedule), tak každá dostane `230 / 2 = 115h`. Súčet stále 357h.

**Midflight rows v `production_schedule` (is_midflight=true)** sa do tohto výpočtu vôbec nezapojujú — neuberajú hodiny, len existujú ako historický záznam.

### Krok 3 — Zápis späť do DB

- `production_inbox.estimated_hours / estimated_czk` = per_row_hours / per_row_czk
- `production_schedule.scheduled_hours / scheduled_czk` (non-midflight) = per_row_hours / per_row_czk
- `project_plan_hours` upsert s `hodiny_plan, tpv_hours, project_hours, source, marze_used, prodpct_used, eur_rate_used`

### Čo sa zmení v `recalculateProductionHours.ts`

1. **Odstrániť `consumedTotal` a `consumptionRatio`** zo schedule aj inbox slučky (cca r. 290–340).
2. **Build `activePartsByCode` raz pred slučkami** (inbox pending + schedule non-cancelled non-midflight pre daný `item_code`).
3. **Schedule per-item update** (non-midflight only): `tpv_full_hours / activePartsByCode[item_code]`.
4. **Inbox per-item update**: identický vzorec.
5. **Orphan fallback**: `(hodiny_plan − assignedToTpv) / orphanCount`, bez consumed odpočtu.
6. **Midflight rows**: úplne preskočiť update (len čítané pre kontext, nemenia sa).

### Dotknuté súbory

- `src/lib/recalculateProductionHours.ts` — zjednodušiť per-item logiku, odstrániť consumed odpočet.

### Po nasadení

1. Spustiť **„Přepočítat → Vše vč. historie"** na PlanVyroby.
2. Overiť že súčet aktívnych inbox + non-midflight schedule rows pre daný projekt = `hodiny_plan` v `project_plan_hours`.
3. Príklady na overenie: Z-2605-001 (357h), Z-2504-019, Z-2604-004 (4h), Z-2601-004 (4h).

