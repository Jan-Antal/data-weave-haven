# Oprava daylog izolácie — Insia bug

## Diagnóza (potvrdená z DB)

V tabuľke `production_daily_logs` pre Insia / týždeň `2026-04-20` existujú **dve sady kľúčov**:
- Legacy: `Z-2605-001::2026-04-20` — obsahuje Po–Št (0–3) + pôvodný Piatok (98%, "Chybí dokončit T03…")
- Nový bundle-scoped: `Z-2605-001::2026-04-20::SG:2e7ac40e-…` — obsahuje LEN Piatok (4) zapísaný po dnešnom fixe

**Dôsledok pre UI:**
1. Pre Piatok nájde nový SG kľúč → čita ho len ten konkrétny bundle (správne).
2. Pre Po–Št pod novým kľúčom nič nie je → padá na legacy `Z-2605-001::2026-04-20` fallback → **obe bundles (A-4 aj B) čítajú tie isté legacy záznamy** = "obe sa menia naraz".
3. Záznamy nie sú stratené — len UI ich nezobrazuje konzistentne, lebo časť dní sa číta z bundle kľúča a časť z legacy fallbacku.
4. Undo prepísal záznam s novým `logged_at` → "úprava po termíne" zostala.

## Plán opráv

### 1. Jednorázová migrácia legacy záznamov (SQL migration)
Pre každý existujúci `bundle_id` typu `${pid}::${week}` (bez 3. časti):
- Zistiť, ktoré bundles existujú v `production_schedule` pre daný `(project_id, scheduled_week)`.
- Ak existuje **len jeden bundle** v tom týždni → premenovať `bundle_id` na nový bundle-scoped formát (buď `…::SG:<split_group_id>` alebo `…::<stage_id>::<bundle_label>`).
- Ak existuje **viac bundles** → záznam ponechať a označiť (alebo skopírovať pod každý bundle s pôvodným `logged_at`), aby UI nestratilo dáta. Pre Insiu konkrétne: skopírovať Po–Št pod oba kľúče (`SG:2e7ac…` aj druhý bundle), aby každý mal vlastnú kópiu, a ďalšie úpravy už šli iba pod jeho identitu.
- Migráciu vytvoriť ako idempotentnú (kontrola existencie cieľového kľúča pred zápisom).

### 2. Odstrániť legacy fallback v `getLogsForProject` (`src/pages/Vyroba.tsx`)
- Po migrácii čítať **iba** bundle-scoped kľúč. Ak nič nie je → bundle nemá log (správne).
- Tým sa zabráni tomu, aby dva rôzne bundles "zdieľali" legacy záznam.

### 3. Opraviť undo `logged_at` u všetkých daylog akcií
- Pre `phase_change`, `log_note` a `no_activity` undo akcie použiť priamy `supabase.update` so zachovaním pôvodného `logged_at` z `existingLog` (rovnako ako už existujúci pattern pre percent change).
- Po update invalidate `["production-daily-logs", weekKey]` aj `["production-daily-logs-all-non-mf"]`.

### 4. Zápis logu cez `saveDailyLog` — pridať `loggedAtOverride`
- Voliteľný parameter, ktorý umožní zachovať originálny `logged_at` (využije undo, prípadne import).

### 5. Verifikácia po nasadení
- Otvoriť Insia A-4 a Insia B v týždni 20.4.: každá karta musí mať vlastný daylog (žiadne zdieľanie).
- Zmena Piatku v B nesmie ovplyvniť A-4.
- Undo musí vrátiť hodnotu **aj** vyčistiť oranžový "úprava po termíne" indikátor.
- DB query `SELECT bundle_id, day_index, percent FROM production_daily_logs WHERE bundle_id LIKE 'Z-2605-001::2026-04-20%' ORDER BY day_index;` musí vrátiť pre každý bundle vlastnú sadu dní 0–4 bez kolízie.

## Súbory
- **NEW**: `supabase/migrations/<timestamp>_migrate_legacy_daylog_bundle_ids.sql`
- **EDIT**: `src/pages/Vyroba.tsx` — odstrániť legacy fallback, opraviť undo handlery (preserve `logged_at`)
- **EDIT**: `src/hooks/useProductionDailyLogs.ts` — pridať `loggedAtOverride` parameter do `saveDailyLog`

## Riziko / poznámka
Migrácia menia primárny kľúč riadkov (`bundle_id`). Pred spustením spravím SELECT preview, ktoré ukáže koľko riadkov bude premenovaných vs. duplikovaných, aby sa potvrdilo žiadne dáta sa nestratia.
