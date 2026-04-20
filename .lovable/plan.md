

## Problém

Projekt Z-2607-008 po obnove zo zálohy stratil chain väzbu (`split_group_id = NULL` na všetkých riadkoch) a má duplicitné dáta v T18 schedule + Inboxe. Recalculate preto napočíta 2× plán namiesto remaining.

## Aktuálny stav v DB

| Zdroj | Počet | Súčet h | split_group_id |
|---|---|---|---|
| `production_schedule` T16 midflight | 1 | 33.9 | NULL |
| `production_schedule` T18 (obnovené zo zálohy) | 0 (zmazané) | 0 | — |
| `production_inbox` pending | 33 | 586.0 | NULL |
| `project_plan_hours.hodiny_plan` | — | 586 | — |

T18 schedule riadky sú **duplicitné** s Inboxom (po obnove zo zálohy zostali aj v inboxe aj v schedule). Aktuálne sú T18 v schedule už zmazané (predchádzajúca cleanup), v DB ostal len T16 midflight.

## Cieľ

1. T16 midflight (33.9h) zostáva.
2. Inbox 33 položiek (552.1h zostatok = 586 − 33.9) plus T16 = 586h plán ✓.
3. Všetky tri (T16 schedule + Inbox) zdieľajú jeden `split_group_id` → chain obnovený → recalculate bude správne škálovať.

## Zmena 1 — One-off SQL data fix (cez insert tool)

```sql
-- 1. Nastaviť spoločný chain group_id na T16 midflight + všetky pending inbox riadky
WITH new_chain AS (
  SELECT gen_random_uuid() AS chain_id
)
UPDATE production_schedule
SET split_group_id = (SELECT chain_id FROM new_chain)
WHERE project_id = 'Z-2607-008' AND is_midflight = true;

-- 2. Použiť rovnaký chain_id na inbox (cez priame priradenie z midflight riadku)
UPDATE production_inbox
SET split_group_id = (
  SELECT split_group_id FROM production_schedule
  WHERE project_id = 'Z-2607-008' AND is_midflight = true LIMIT 1
)
WHERE project_id = 'Z-2607-008' AND status = 'pending';

-- 3. Škálovať inbox hodiny: remaining = 586 - 33.9 = 552.1; scale = 552.1/586
UPDATE production_inbox
SET estimated_hours = ROUND((estimated_hours * 552.1 / 586.0)::numeric, 1),
    estimated_czk = ROUND(estimated_czk * 552.1 / 586.0)
WHERE project_id = 'Z-2607-008' AND status = 'pending';

-- 4. Prečíslovať chain (T16 = 1/2, inbox = NULL/2)
UPDATE production_schedule
SET split_part = 1, split_total = 2
WHERE project_id = 'Z-2607-008' AND is_midflight = true;

UPDATE production_inbox
SET split_part = NULL, split_total = 2
WHERE project_id = 'Z-2607-008' AND status = 'pending';
```

## Overenie

1. `SUM(scheduled_hours)` midflight T16 + `SUM(estimated_hours)` inbox ≈ **586h** (= plán).
2. Všetky riadky (T16 + Inbox) zdieľajú rovnaký `split_group_id`.
3. UI Inbox: Z-2607-008 zobrazí ~552h (zostatok), nie 586h.
4. T16 zobrazí badge `1/2`.
5. **Klik "Přepočítat hodiny"** → idempotentný (recalculate detekuje chain, `consumedChainHours = 33.9`, `remainingScale = 552.1/586 ≈ 0.942`, súčet inbox zostane 552h).
6. Naplánovať inbox položku do silo → silo bundle preberie chain, prečíslovanie cez `renumberProjectChain` → 1/3 + 2/3 (NULL inbox).

## Dotknuté súbory

Iba data fix cez insert tool, žiadne zmeny v kóde.

