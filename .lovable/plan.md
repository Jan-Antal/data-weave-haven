

## Diagnóza

V DB pre projekt Z-2617-001 vidím presne tento stav:

- **Historické midflight riadky** (T13–T16): `item_code = 'Z-2617-001'`, `is_midflight = true` (agregované týždenné súčty), `split_part 1..4 / 5`.
- **Aktuálne split riadky** (T17 = 2026-04-27, T18 = 2026-05-04): per-item codes (T.01, T.03, T.04, T.05, T.06), `split_part 1..2 / 2`.

Všetky riadky **zdieľajú rovnaký `split_group_id`** `37f0f762-...`. 

**Prečo nový split spravil 1/2 + 2/2 a nie 5/6 + 6/6:**

V `splitChainHelpers.ts` `fetchChainRows` (riadok 47–48) má filter:

```ts
.filter((r: any) => r.status !== "cancelled" && !r.is_midflight)
```

Midflight riadky (historické T13–T16) sú teda **vyradené z chainu**. `renumberBundleChain` potom vidí len 2 týždne (T17, T18), zoradí ich a vyrenderuje 1/2 + 2/2 — historické 1/5..4/5 sa vôbec neaktualizujú a zostávajú v starom stave.

Užívateľ chce, aby sa **bundle-level chain počítal vrátane midflight historických týždňov** — má byť 4 staré (1/6..4/6) + 2 nové (5/6, 6/6).

## Riešenie

### `src/lib/splitChainHelpers.ts`

**1. `fetchChainRows`** — odstrániť `!r.is_midflight` filter, ponechať len `status !== "cancelled"`. Midflight riadky musia byť súčasťou chainu pre bundle-level renumber. Komentár hore (riadky 14–16) upraviť: midflight sú _súčasťou_ bundle chainu (každý midflight týždeň = jedna bundle časť).

**2. `renumberBundleChain`** — logika ostáva (group by `scheduled_week`), ale teraz správne uvidí všetkých 6 týždňov a vyprodukuje 1/6..6/6 zdieľané všetkými riadkami v danom týždni. Midflight týždne (kde je len jeden agregovaný riadok s `item_code = project_id`) takisto dostanú správny `split_part`.

**3. `renumberChain` (per-item legacy)** — môže ostať ako je (single-item splits naďalej ignorujú midflight, lebo midflight nie je per-code chain). Pre istotu pridať do filtra v `renumberChain` lokálny `!r.is_midflight` aby legacy správanie ostalo nezmenené, alebo nechať midflight položky započítavať aj tu (správa už chcela midflight započítať do per-item totalu — viď komentár v hlavičke). **Default:** ponechať midflight v chaine aj pre per-item, aby sa správanie zjednotilo.

### Cleanup existujúcich dát Z-2617-001

Po nasadení opravy spustiť jednorazové prečíslovanie chainu `37f0f762-9985-4d65-a6aa-d6b2577d508f` (volaním `renumberBundleChain` z migrácie alebo manuálnou SQL aktualizáciou):

- T13 (2026-03-23) → 1/6 pre midflight riadok
- T14 (2026-03-30) → 2/6
- T15 (2026-04-06) → 3/6
- T16 (2026-04-13) → 4/6
- T17 (2026-04-27) → 5/6 pre všetkých 5 položiek
- T18 (2026-05-04) → 6/6 pre všetkých 5 položiek

### Edge cases

- **Cancelled riadky** zostávajú vyradené z chainu.
- **Inbox riadky** stále nie sú súčasťou bundle weekChainu (riadok 192–202 ich resetuje na null).
- **Bundle merge naprieč týždňami** (`mergeBundleAcrossWeeks`) automaticky využije nový `fetchChainRows`, takže merge tiež zohľadní midflight týždne v finálnom prečíslovaní.

## Dotknuté súbory

- `src/lib/splitChainHelpers.ts` — odstrániť `!r.is_midflight` filter v `fetchChainRows`, aktualizovať doc komentár.
- Migrácia: jednorazový SQL update split_part/split_total pre všetky existujúce midflight chainy v projekte (alebo widely — všetky chainy s midflight riadkami).

## Výsledok

- **Z-2617-001**: po cleanupe a opätovnom splite uvidíš správne 1/6..6/6 naprieč všetkými týždňami chainu.
- **Budúce splity** na bundloch s midflight históriou budú pokračovať (5/5 → 6/6, nie reset na 1/2).

