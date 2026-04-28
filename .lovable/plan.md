# Zahrnúť spillovers z minulých týždňov do daily reportu

## Problém
Projekt *Příluky Valovi Dům (Z-2504-019)* (a ďalšie podobné) zmizne z denného reportu, keď jeho posledný bundle bol naplánovaný v minulom týždni a tento týždeň už nemá žiadny záznam v `production_schedule`. V realite sa však na ňom stále pracuje – len plán "pretiekol".

## Riešenie
Upraviť SQL funkciu `public.get_daily_report` tak, aby do reportu zahŕňala aj **aktívne spillover bundle** z predchádzajúcich týždňov.

### Definícia spillover bundle
Bundle z minulého týždňa, ktorý:
- má status `scheduled`, `in_progress` alebo `paused` (NIE `completed`/`cancelled`/`expedice`),
- jeho `split_group_id` (alebo kombinácia `project+stage+bundle_label`) **nemá** žiadny záznam v aktuálnom týždni,
- nebol uzavretý logom s `phase = 'Hotovo'` / `percent = 100`.

### Zmeny v `get_daily_report`

1. **Nové CTE `spillover_bundles`** – vyberie aktívne bundle s `scheduled_week < current_week_monday`, ktoré nemajú náprotivok v aktuálnom týždni.

2. **Pridať ich do `bundles_in_week`** ako virtuálne riadky s:
   - `scheduled_week` = pôvodný (minulý) týždeň,
   - `scheduled_hours` = zostávajúce hodiny chainu (chain_total - chain_prior_completed),
   - goal_pct = 100 (mali byť hotové už minulý týždeň).

3. **Display label**: pridať príznak `is_spillover` do výstupu, alebo riešiť cez `bundle_display_label` (napr. ponechať pôvodný label – n8n/Slack to spozná podľa `scheduled_week < dnešný pondelok`).

4. **Logy** – už teraz fungujú: ak dnes pridajú log s `split_group_id`, alias logiku v `logs_resolved` rozšírime tak, aby fallback bral aj posledný spillover bundle (nielen z aktuálneho týždňa).

### Návrh SQL (kľúčová časť)

```sql
spillover_bundles AS (
  SELECT DISTINCT ON (ps.project_id, ps.stage_id, ps.bundle_label, ps.split_group_id)
    ps.project_id, ps.stage_id, ps.scheduled_week, ps.bundle_label,
    ps.split_part, ps.split_total, ps.split_group_id,
    ps.scheduled_hours
  FROM production_schedule ps, today_info ti
  WHERE ps.status IN ('scheduled', 'in_progress', 'paused')
    AND ps.bundle_label IS NOT NULL
    AND ps.scheduled_week < ti.current_week_monday
    AND ps.scheduled_week >= ti.current_week_monday - interval '4 weeks'
    AND NOT EXISTS (
      SELECT 1 FROM production_schedule ps2
      WHERE ps2.scheduled_week = ti.current_week_monday
        AND ps2.bundle_label IS NOT NULL
        AND (
          (ps.split_group_id IS NOT NULL AND ps2.split_group_id = ps.split_group_id)
          OR (ps.split_group_id IS NULL
              AND ps2.project_id = ps.project_id
              AND ps2.stage_id IS NOT DISTINCT FROM ps.stage_id
              AND ps2.bundle_label = ps.bundle_label)
        )
    )
    -- nemá log "Hotovo" 100%
    AND NOT EXISTS (
      SELECT 1 FROM production_daily_logs pdl
      WHERE pdl.bundle_id LIKE ps.project_id || '::%'
        AND pdl.percent >= 100
    )
  ORDER BY ps.project_id, ps.stage_id, ps.bundle_label, ps.split_group_id, ps.scheduled_week DESC
)
```

Potom `UNION ALL` so súčasným `bundles_in_week` a v hlavnom SELECT pre planne riadky pridať príznak / použiť `scheduled_week` ako indikátor spilloveru.

### Spillover indikátor pre n8n
V hlavnom output pridať virtuálny stĺpec / použiť existujúci `scheduled_week`: ak `scheduled_week < dnešný pondelok` → n8n vie zobraziť `🔄 A — spillover (z {týždňa})` namiesto `⚠️ A — žiadny log`.

Cleanší prístup: pridať **nový stĺpec `is_spillover boolean`** do návratu funkcie.

## Technické detaily

- Funkcia `get_daily_report` má return type explicitne deklarovaný → musíme upraviť signatúru aj n8n mapping (pridanie `is_spillover`).
- Alternatíva bez zmeny signatúry: zakódovať info do `bundle_id` prefixom (napr. `SPILL::...`) – jednoduchšie, žiadny breaking change.

**Odporúčam: zakódovať cez `scheduled_week`** – nie je potrebné meniť signatúru. n8n logika: `if (row.scheduled_week < currentMondayISO) → spillover`.

## Súbory na zmenu
- Nová Supabase migrácia: `CREATE OR REPLACE FUNCTION public.get_daily_report(...)` s rozšírenou logikou.

## Po nasadení – overenie
- `Příluky Valovi Dům` sa objaví v reporte s `scheduled_week = 2026-04-20`.
- `Allianz` a ostatné aktuálne projekty zostanú bez zmeny.
- Ak dnes pridajú log na spillover bundle, log sa správne napáruje (existujúca alias logika cez `split_group_id`).
