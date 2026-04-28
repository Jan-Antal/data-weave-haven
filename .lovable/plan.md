## Zistenie

Daily report momentálne nezhŕňa všetky bundles, ktoré ukazuje "Reporta Dílna" (Vyroba UI). Chýbajú **tri typy** záznamov:

### 1. Spillover bundles s falošným "done log" filtrom
**Příluky Valovi Dům (Z-2504-019, A T17)** — spillover z týždňa 04-20 do 04-27. Filter `has_done_log` je **per-projekt** (`bundle_id LIKE 'Z-2504-019::%'`), nie per-bundle. Akýkoľvek 100% log na ľubovoľnej položke v projekte za posledných 14 dní vyhodí celý projekt.

**Oprava**: zúžiť filter na konkrétny bundle (`bundle_label` v logoch musí matchovať). Ideálne: namiesto LIKE projekt:: použiť LIKE pattern `project_id::%::bundle_label::%` alebo lepšie zjoinovať s `logs_resolved`-podobnou logikou. Alternatívne: kontrolovať len logy z aktuálneho týždňa, nie 14 dní.

### 2. "Mimo plán výroby" — logy bez plánu
**Allianz - 6.patro (Z-2617-002), RD Cigánkovi Zlín (Z-2515-001), Gradus Kampa (Z-2512-001)** — projekty, ktoré majú v aktuálnom týždni log v `production_daily_logs`, ale NIE sú v `production_schedule` pre tento týždeň (nemajú plán).

UI ich zobrazí preto, že číta zo schedule + logov. Aktuálny SQL ich vidí len v `logs_resolved` → log časť funguje, ale ak v reporte nie je log presne pre `report_date`, projekt zmizne. Allianz 6.patro má 9h log — pravdepodobne starší.

**Oprava**: do `bundles_in_week` pridať CTE `unplanned_log_bundles`, ktorý nájde unikátne `(project_id, bundle_label)` z logov v aktuálnom **týždni** (nie len `report_date`), ktoré nie sú v active_schedule pre current_week_monday. Tieto sa pridajú s `scheduled_hours=0`, `is_spillover=false` a označením "mimo plán" (napr. nový stĺpec `is_unplanned`).

### 3. "Bez denného logu" pre dnes
Niektoré bundles majú plán, ale dnes (28.04) ešte nikto nelogoval. Príklad: **Allianz D-1** je v reporte ako `plan` row s `weekly_goal_pct=75`, ale bez log row → správne. Funguje OK.

## Plán

Migrácia ktorá v `public.get_daily_report(date)`:

1. **Opraví spillover filter `has_done_log`**: zúži ho na konkrétny bundle_label namiesto celého projektu. Pattern logov: `{project}::{week_key}::{stage_or_SG}::{bundle_label}::{split}::...` — porovnať `split_part(bundle_id, '::', 4) = ps.bundle_label`.

2. **Pridá CTE `unplanned_bundles`**: bundles s logom v aktuálnom týždni (week_key = current_week_monday) ktoré nemajú riadok v `active_schedule` pre tento týždeň ani v spillover. Zaradiť ich do `bundles_in_week` s `scheduled_hours=0`, `is_spillover=false` a `is_unplanned=true`.

3. **Pridá nový bool stĺpec `is_unplanned`** do návratovej tabuľky, aby n8n vedel zobraziť značku "Mimo Plán výroby". Ostatné existujúce stĺpce zostanú.

4. **Goal pre unplanned**: `weekly_goal_pct = 0` (nemajú plánované hodiny → cíl je 0%, presne ako Reklamace Bar terasa už ukazuje).

## Validácia po nasadení

Spustím `SELECT … FROM get_daily_report('2026-04-28')` a očakávam **9 projektov** rovnako ako screenshot UI:
- Allianz 5.patro (A-6, B, D-1)
- Příluky Valovi Dům (A) — spillover
- Insia (A-4, B)
- Reklamace Bar terasa (A) — unplanned
- RD Skalice (A-3)
- Multisport (A-3)
- Allianz 6.patro — unplanned
- RD Cigánkovi Zlín — unplanned
- Gradus Kampa — unplanned

## Súbory

- Nová migrácia `supabase/migrations/<timestamp>_report_include_all_dilna_bundles.sql` — `CREATE OR REPLACE FUNCTION public.get_daily_report` s vyššie popísanými zmenami a novým stĺpcom `is_unplanned boolean`.

Pošli `ok` a nasadím.
