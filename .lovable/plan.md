

## Rozsah

One-off SQL oprava aktuálnych hodnôt v inboxe + budúcich silo bundles pre projekty s midflight chainom + trvalá zmena v `recalculateProductionHours.ts` aby budúce kliky na "Přepočítat" už chain-aware odpočet aplikovali automaticky a nerozbili to.

## Pravidlo

Pre každý projekt s `chain_group_id` (existuje vďaka predchádzajúcej migrácii):
- **`hodiny_plan` projektu** = celkový plán z TPV/Project price (nemení sa, ostáva v `project_plan_hours`).
- **`midflightChainHours`** = `SUM(scheduled_hours)` všetkých `production_schedule` riadkov v rámci `split_group_id` kde `is_midflight = true`.
- **`remainingPlanHours`** = `MAX(0, hodiny_plan - midflightChainHours)`.
- **`remainingScale`** = `remainingPlanHours / hodiny_plan` (alebo 1 ak chain neexistuje).

Tento `remainingScale` sa aplikuje **iba** na inbox + non-midflight schedule riadky (hodiny aj CZK). Midflight historické riadky sa nikdy neprepisujú, slúžia ako zdroj pravdy „už spotrebované".

## Zmena 1 — One-off SQL oprava aktuálneho stavu

Migration cez supabase migration tool:

```sql
DO $$
DECLARE
  proj RECORD;
  hodiny_plan_full numeric;
  midflight_hours numeric;
  remaining_hours numeric;
  scale_factor numeric;
  chain_id uuid;
BEGIN
  FOR proj IN
    SELECT DISTINCT project_id
    FROM production_schedule
    WHERE is_midflight = true
  LOOP
    -- chain_group_id projektu (z migrácie sa už nastavilo, je rovnaký pre všetky riadky)
    SELECT split_group_id INTO chain_id
    FROM production_schedule
    WHERE project_id = proj.project_id AND is_midflight = true
    LIMIT 1;

    IF chain_id IS NULL THEN CONTINUE; END IF;

    -- plný hodiny_plan z project_plan_hours
    SELECT hodiny_plan INTO hodiny_plan_full
    FROM project_plan_hours
    WHERE project_id = proj.project_id;

    IF hodiny_plan_full IS NULL OR hodiny_plan_full = 0 THEN CONTINUE; END IF;

    -- midflight chain hodiny
    SELECT COALESCE(SUM(scheduled_hours), 0) INTO midflight_hours
    FROM production_schedule
    WHERE split_group_id = chain_id AND is_midflight = true;

    remaining_hours := GREATEST(0, hodiny_plan_full - midflight_hours);
    scale_factor := remaining_hours / hodiny_plan_full;

    -- škálovať pending inbox
    UPDATE production_inbox
    SET estimated_hours = ROUND(estimated_hours * scale_factor, 1),
        estimated_czk = ROUND(estimated_czk * scale_factor)
    WHERE project_id = proj.project_id
      AND status = 'pending';

    -- škálovať non-midflight active schedule
    UPDATE production_schedule
    SET scheduled_hours = ROUND(scheduled_hours * scale_factor, 1),
        scheduled_czk = ROUND(scheduled_czk * scale_factor)
    WHERE project_id = proj.project_id
      AND is_midflight = false
      AND status IN ('scheduled', 'in_progress');
  END LOOP;
END $$;
```

## Zmena 2 — `recalculateProductionHours.ts` chain-aware odpočet

V `src/lib/recalculateProductionHours.ts`:

**A) Po načítaní `allSched` pridať `midflightHoursByChain`:**

```ts
const midflightHoursByChain = new Map<string, number>();
for (const s of allSched) {
  if (!s.is_midflight || !s.split_group_id) continue;
  midflightHoursByChain.set(
    s.split_group_id,
    (midflightHoursByChain.get(s.split_group_id) || 0) + Number(s.scheduled_hours || 0),
  );
}
```

**B) V hlavnej slučke `for (const proj of projects)` pridať:**

```ts
function resolveChainGroupId(projectId: string): string | null {
  const inbox = inboxByProject.get(projectId) || [];
  const sched = schedByProject.get(projectId) || [];
  const midflightSched = allSched.filter(
    s => s.project_id === projectId && s.is_midflight && s.split_group_id
  );
  for (const r of midflightSched) if (r.split_group_id) return r.split_group_id;
  for (const r of inbox) if (r.split_group_id) return r.split_group_id;
  for (const r of sched) if (r.split_group_id) return r.split_group_id;
  return null;
}

const chainGroupId = resolveChainGroupId(proj.project_id);
const consumedChainHours = chainGroupId
  ? (midflightHoursByChain.get(chainGroupId) || 0)
  : 0;
const remainingPlanHours = Math.max(0, result.hodiny_plan - consumedChainHours);
const remainingScale = result.hodiny_plan > 0
  ? remainingPlanHours / result.hodiny_plan
  : 1;
```

**C) Pri update inbox a non-midflight schedule:**
- `tpvFullHours = (tpvHoursById.get(tpv.id) ?? 0) * remainingScale`
- CZK počítať analogicky × `remainingScale`.

**D) HIST_ branch + midflight rows ostávajú nezmenené** (žiadny scale, sú zdroj pravdy).

**E) Orphan distribúcia používa `remainingPlanHours`:**

```ts
const remainingProjectHours = Math.max(0, remainingPlanHours - assignedHours);
```

**F) `project_plan_hours.hodiny_plan` ostáva plný (490h)** — detail projektu naďalej zobrazí celkový plán.

## Zmena 3 — Rozdeliť scale medzi viac inbox/silo riadkov

`remainingScale` sa aplikuje na per-item TPV hodiny **pred** delením cez `partsCount` (`activePartsByCode`). Existujúce delenie split chainu (5/6 + 6/6) ostáva korektné, len pracuje s menším základom.

## Edge cases

- **Projekt bez chainu**: `chainGroupId = null`, `remainingScale = 1`, správanie nezmenené.
- **Midflight > hodiny_plan**: `remainingPlanHours = 0`, inbox + future silo dostane 0h. Detail projektu stále ukazuje plný plán + indikuje "vyčerpané".
- **Po pridaní midflight riadku** (cez `production_schedule` insert s `is_midflight=true` a rovnaký `split_group_id`): ďalší klik na "Přepočítat" automaticky odpočíta novú sumu.
- **Per-item / bundle split**: prečíslovanie chainu cez `renumberProjectChain` ostáva, hodiny per riadok recalculate dopočíta proporčne.
- **`hours_log` z Alveno** (`consumedByProject`): ostáva nezmenené v existujúcom kóde, používa sa inde (Analytics). Recalculate distribúciu chain odpočtu robí cez **plánovanú** midflight spotrebu, nie reálne odpracované.

## Dotknuté súbory

- **Nová one-off SQL migrácia** — okamžitá oprava aktuálnych inbox + non-midflight schedule hodnôt pre projekty s midflight chainom.
- `src/lib/recalculateProductionHours.ts` — chain-aware odpočet pre budúce "Přepočítat" kliky.

## Overenie po nasadení

1. **SQL migrácia**: v DB overiť pre Z-2607-008:
   - `SUM(scheduled_hours) FROM production_schedule WHERE project_id='Z-2607-008' AND is_midflight=true` = midflight hodiny (napr. 220h).
   - `SUM(estimated_hours) FROM production_inbox WHERE project_id='Z-2607-008' AND status='pending'` + `SUM(scheduled_hours) FROM production_schedule WHERE project_id='Z-2607-008' AND is_midflight=false AND status IN ('scheduled','in_progress')` ≈ **270h** (490 - 220).
   - `project_plan_hours.hodiny_plan` = **490h** (nezmenené).
2. UI Inbox: Z-2607-008 zobrazí súčet **270h** (zostatok), nie 490h.
3. Detail projektu zobrazí **490h** plán.
4. **Klik "Přepočítat hodiny" (vše vrátane histórie)** → overiť že sumy sa **nezmenia** (recalculate správne aplikuje `remainingScale`).
5. **Klik "Přepočítat hodiny" druhýkrát** → opäť bez zmeny (idempotent).
6. Projekt bez midflight histórie → recalculate ho nezmení.
7. Pridať per-item split v silo bundle pre projekt s chainom → kontinuita čísel (5/6 + 6/6) + súčet hodín ostáva = remaining.

