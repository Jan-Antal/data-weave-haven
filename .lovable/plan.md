

## Rozsah

Obnoviť **chain bundles per projekt** ako one-off operáciu (žiadny budúci midflight import, žiadna aktualizácia importeru). Per-item split a bundle split budú rešpektovať existujúci projektový chain (5/5 → 5/6 + 6/6).

## Pravidlo chain

- **Chain = projekt** (jeden `split_group_id` zdieľaný cez midflight history + pending inbox + future silo bundles).
- `split_part / split_total` = poradie unique `scheduled_week` ascending. Všetky položky v rovnakom týždni majú rovnaké čísla.
- Inbox položky (bez `scheduled_week`) → `split_part = NULL`, `split_total = počet týždňov v chain`.
- Per-item split / bundle split **nikdy nezakladá nový `split_group_id`** ak zdroj už chain má — preberá existujúci a prečísluje cez `renumberProjectChain`.

## Zmena 1 — One-off SQL migrácia (chain backfill)

Jednorazová migrácia cez supabase migration tool:

1. Pre každý projekt s aspoň 1 riadkom `production_schedule.is_midflight=true`:
   - vygenerovať `chainGroupId = gen_random_uuid()`
   - update **všetkých** `production_schedule` riadkov projektu (midflight aj non-midflight, status != 'cancelled') → `split_group_id = chainGroupId`
   - update všetkých `production_inbox` riadkov projektu so `status='pending'` → `split_group_id = chainGroupId`
2. Pre každý chain spočítať cez SQL window function (`DENSE_RANK() OVER (PARTITION BY split_group_id ORDER BY scheduled_week)`) → updatnúť `split_part` / `split_total` na schedule riadkoch.
3. Inbox riadky chainu → `split_part = NULL`, `split_total = total weeks`.
4. Projekty bez midflight histórie ostávajú nedotknuté.

**Midflight importer (`midflightImportPlanVyroby.ts`) sa nemení** — je to legacy funkcia, do budúcnosti sa už nespúšťa.

## Zmena 2 — Nový helper `renumberProjectChain`

V `src/lib/splitChainHelpers.ts` pridať:

```ts
export async function renumberProjectChain(
  projectId: string,
  chainGroupId: string
): Promise<void>
```

Logika:
1. Načíta z `production_schedule` riadky projektu so `split_group_id = chainGroupId` a `status != 'cancelled'`.
2. Načíta z `production_inbox` pending riadky so `split_group_id = chainGroupId`.
3. Zoradí unique `scheduled_week` ascending → `weekIndex` mapa.
4. Schedule rows: `split_part = weekIndex(scheduled_week) + 1`, `split_total = total unique weeks`.
5. Inbox rows: `split_part = NULL`, `split_total = total unique weeks`.

Existujúce `renumberChain` (per item_code) a `renumberBundleChain` ostávajú v exporte pre fallback (projekty bez chainu / single-item splity bez histórie).

## Zmena 3 — Inbox → silo preberá projektový chain

V `src/hooks/useProductionDragDrop.ts`:
- `moveInboxItemToWeek` a `moveInboxProjectToWeek`: po inserte do `production_schedule` zistiť či zdrojový inbox row má `split_group_id`.
  - Ak **áno** → `renumberProjectChain(projectId, splitGroupId)`.
  - Ak **nie** (projekt bez chainu) → správanie ostáva ako dnes (žiadne číslovanie).

## Zmena 4 — Per-item split (`SplitItemDialog`) rešpektuje chain

V `src/components/production/SplitItemDialog.tsx` (`handleSplit`):
- Ak zdrojová položka má `split_group_id` → použiť **existujúci** ID pre nový riadok, **nevytvárať** nový group.
- Po inserte zavolať `renumberProjectChain(projectId, existingSplitGroupId)` namiesto `renumberChain`.
- Ak zdroj nemá `split_group_id` → fallback na dnešnú logiku (nový group + `renumberChain`).

Výsledok: chain 5/5 + nová časť → 5/6 + 6/6.

## Zmena 5 — Bundle split (`SplitBundleDialog`) rešpektuje chain

V `src/components/production/SplitBundleDialog.tsx` (`handleSplitBundle`):
- Ak items v bundli majú `split_group_id` (projektový chain) → použiť tento existujúci ID pre nové split rows, **nie** nový `bundleGroupId = randomUUID()`.
- Po inserte zavolať `renumberProjectChain(projectId, existingSplitGroupId)` namiesto `renumberBundleChain`.
- Ak bundle nemá `split_group_id` → fallback na dnešnú logiku (nový group + `renumberBundleChain`).

## Zmena 6 — Read-side vo `Vyroba.tsx`

Žiadna zmena. `findPriorChainLog`, `getChainWindow`, `splitGroupsByBundle` už dnes pracujú nad `split_group_id`. Po Zmenách 1–5 budú midflight + inbox + silo + post-split bundle všetky zdieľať projektový chain → kontinuita % funguje automaticky (read-only fallback, žiadny zápis do `production_daily_logs`).

## Edge cases

- **Projekt bez midflight histórie**: nemá chain, nič sa nemení.
- **Cancelled riadky**: filtrované cez `status != 'cancelled'`, neovplyvnia číslovanie.
- **Per-item split dvakrát za sebou**: každý ďalší split prečísluje celý chain (5/6 → 5/7 + 6/7 + 7/7).
- **Recycle / move späť do inboxu**: scheduled_week sa zmaže, prečíslovanie ho vyhodí z týždenného počtu → inbox row dostane `split_part = NULL`.
- **Nový projekt bez histórie**: bude fungovať bez chainu (legacy správanie). Ak v budúcnosti vznikne potreba projektového chainu pre nové projekty, riešiť samostatne.

## Dotknuté súbory

- **Nová SQL migrácia** — one-off backfill `split_group_id` + prečíslovanie pre projekty s midflight históriou.
- `src/lib/splitChainHelpers.ts` — pridať `renumberProjectChain`.
- `src/hooks/useProductionDragDrop.ts` — inbox→silo volá `renumberProjectChain` ak existuje chain.
- `src/components/production/SplitItemDialog.tsx` — preberá existujúci `split_group_id`, volá `renumberProjectChain`.
- `src/components/production/SplitBundleDialog.tsx` — preberá existujúci `split_group_id`, volá `renumberProjectChain`.
- `src/lib/midflightImportPlanVyroby.ts` — **bez zmeny** (legacy, už sa nespúšťa).

## Overenie po nasadení

1. **Migrácia**: v DB overiť že napr. Z-2607-008 má rovnaký `split_group_id` na všetkých midflight schedule + non-midflight schedule + pending inbox riadkoch.
2. Otvoriť projekt s históriou: T-2 ručne uložiť 60% log.
3. Naplánovať inbox položku do T+1 → silo bundle preberie projektový chain a `renumberProjectChain` priradí správne `split_part/total`.
4. Vo Výrobe v T+1 overiť že `findPriorChainLog` vráti 60% z T-2 (read fallback, žiadny DB write).
5. **Per-item split test**: bundle 5/5 → split TK.05 do T+1 → overiť že chain je teraz 5/6 + 6/6 (nie nový group).
6. **Bundle split test**: 5/5 bundle → split do ďalšieho týždňa → overiť že číslovanie je 5/6 + 6/6 a všetky položky bundle zdieľajú projektový `split_group_id`.
7. End-to-end: midflight história → inbox → silo → split → ručný log → kontinuita % naprieč všetkými týždňami.

