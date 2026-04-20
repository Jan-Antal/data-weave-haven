

## Diagnóza

**Problém 1: Historické midflight dáta číslujú per-bundle namiesto per-item**

V `midflightImportPlanVyroby.ts` (riadky cca 350–410) sa pre každý historický týždenný bundle vytvorí JEDEN riadok v `production_schedule` s `item_name = "Bundle T15 (4 položky)"` a `item_code = NULL`. Takto v `splitChainHelpers.renumberChain` padne celý bundle pod jeden „chain key" (`name::Bundle T15 (...)`) — a keď sú 3 historické bundle + 1 aktívny inbox riadok TK.01, dostávajú čísla `1/4, 2/4, 3/4, 4/4` naprieč rôznymi item_code.

To presne produkuje to, čo vidíš: TK.01=1/3, TK.02=2/3, TK.03=3/3 — pretože per-item logika funguje, ale historické bundle riadky nemajú `item_code`, takže sa miešajú do nesprávneho chainu.

**Problém 2: Inbox a week silo nezobrazujú split badge u nových splitov**

Po `renumberChain` sa `split_part`/`split_total` zapisujú do DB, ale:
- `useProductionInbox` ich číta (`split_part`, `split_total` v selecte ✓)
- `useProductionSchedule` ich číta tiež ✓
- Lenže `renumberChain` **vyžaduje, aby riadok mal `split_group_id`** v DB pre fetch (riadok 35–40: `.or(split_group_id.eq.X, id.eq.X)`). Inbox riadky napárované cez TPV po midflight reconciliation často nemajú `split_group_id` nastavené, takže ich `renumberChain` nenájde a čísla sa neaktualizujú.

**Problém 3: SplitBundleDialog renumeruje per-item-code, ale historické bundle riadky stále miešajú**

Keď splitnem bundle TK.05+TK.07+TK.08 na 2 časti, `renumberChain` zavolaný pre každý `split_group_id` dá každému item_code správne `1/2, 2/2`. Ale ak je v tom istom `split_group_id` aj historický bundle riadok bez item_code, zaradí sa do svojho vlastného „name-based" chainu a dostane vlastné číslovanie.

## Cieľ

1. Historické midflight bundle riadky **nemajú dostať split badge** (sú to agregované záznamy, nie časti chainu).
2. Per-item split chain (1/2, 2/2 ...) musí fungovať pre **aktívne** položky bez ohľadu na to, koľko historických bundle riadkov existuje pre projekt.
3. Inbox aj week silo musia zobrazovať badge pre každú splitnutú položku.

## Plán

### 1. `src/lib/splitChainHelpers.ts` — vyhodiť historické bundle z chainu

V `fetchChainRows`:
- Filter `production_schedule` rozšíriť o `is_midflight = false` (historické bundle riadky sa do chainu nezapočítajú vôbec).
- Tieto riadky sú agregované týždenné súčty, nie splity konkrétnej položky.

V `renumberChain` zachovať per-item-code groupovanie (už je správne).

### 2. `src/lib/midflightImportPlanVyroby.ts` — historické bundle nepripájať do chain

V reconciliation (riadky cca 360–430):
- **Neprenášať `split_group_id` na historické bundle riadky.** Historický bundle = samostatný záznam, nie súčasť chainu aktívnej položky.
- Zachovať vizuálny indikátor histórie (`is_midflight = true`) cez existujúci UI tag „Historický záznam", nie cez split badge.
- V Inboxe a v plánovaných silos pre aktívne položky nastaviť `split_group_id` len medzi sebou (ak položka pochádza z chainu/splitu).
- Po reconciliation zavolať `renumberAllChainsForProject(projectId)` — tým sa per-item logika postará o správne čísla.

### 3. `src/components/production/InboxPanel.tsx` — zobrazenie badge

Skontrolovať, že `DraggableInboxItem` renderuje `split_part/split_total` z `item.split_part/split_total`. Ak chýba, pridať malý badge `{split_part}/{split_total}` vedľa item_code (rovnaký štýl ako vo WeeklySilos).

### 4. `src/components/production/WeeklySilos.tsx` — badge u plánovaných

V `DraggableSiloItem` / `CollapsibleBundleCard` skontrolovať render badge pre `split_part/split_total`. Pravdepodobne tam už je pre completed/midflight, len chýba pre `scheduled/in_progress`. Zjednotiť na všetky stavy okrem `cancelled`.

### 5. Migration / one-shot cleanup (voliteľne)

SQL update: pre existujúce historické bundle riadky vyčistiť `split_group_id`, `split_part`, `split_total` na NULL, aby sa po nasadení správanie ihneď opravilo bez nutnosti midflight re-importu.

```sql
UPDATE production_schedule
SET split_group_id = NULL, split_part = NULL, split_total = NULL
WHERE is_midflight = true;
```

Potom zavolať `renumberAllChainsForProject` pre dotknuté projekty (alebo užívateľ klikne „Prepočítať hodiny" / Midflight import).

## Dotknuté súbory

- `src/lib/splitChainHelpers.ts` (filter midflight z chainu)
- `src/lib/midflightImportPlanVyroby.ts` (neasociovať historické bundle do chainu)
- `src/components/production/InboxPanel.tsx` (badge render)
- `src/components/production/WeeklySilos.tsx` (badge render pre scheduled/in_progress)
- 1 migration SQL (cleanup existujúcich dát)

## Výsledok po nasadení

- Historický bundle „T15 (4 položky)" zostane samostatný, **bez split badge** (keďže reprezentuje agregované hodiny, nie splitnutú položku).
- TK.05, TK.07, TK.08 v inboxe → po splite bundle na 2 časti každá ukáže `1/2` a `2/2` nezávisle.
- Inbox aj week silo zobrazia badge všade, kde existuje aktívny chain.
- TK.01 už nebude miešané s TK.02/TK.03 cez nesprávny bundle-name chain.

