

## Diagnóza (potvrdené z DB)

| Projekt | Plán | Inbox | Midflight | Odpracované (hours_log) | Mal by byť Inbox |
|---|---|---|---|---|---|
| Z-2607-008 | 586 h | **586 h** | 0 h | 33.88 h | ~552 h |
| Z-2617-001 | 1214 h | 346 h | 0 h | 77.75 h | ~268 h |

Inbox dnes ukazuje **plnú TPV pracnosť položiek**, akoby sa ešte nič neurobilo. Skutočne odpracované hodiny z `production_hours_log` sa od inboxu nikdy neodratávajú.

V `midflightImportPlanVyroby.ts` (riadok 365–387) sa pre každý inbox riadok počíta:
```
estimated_hours = tpv.hodiny_plan / partsCount
```
Žiadny člen typu `− odpracované hodiny`. Historické midflight bundle hodiny existujú ako samostatné riadky v `production_schedule (is_midflight=true)`, ale do výpočtu inbox položiek nevstupujú.

## Cieľ

**Inbox položka = zostatok TPV pracnosti po odpočítaní toho, čo už bolo na danej položke (alebo projekte) odpracované.**

Per item:
```
estimated_hours = max(0, tpv.hodiny_plan − consumed_hours_for_item) / activeChainParts
```

Kde `consumed_hours_for_item` je podiel skutočne odpracovaných hodín pripadajúci na tento `item_code`.

## Problém s alokáciou

`production_hours_log` eviduje hodiny **per projekt**, nie per `item_code`. Nedokážeme presne povedať, koľko z 33.88 h Z-2607-008 šlo na T.01 vs. T.02. Preto:

**Riešenie: pomerné rozdelenie v rámci projektu.**

```
project_consumed_total = SUM(hours_log) + SUM(midflight schedule hours) pre projekt
                       (oba zdroje, lebo midflight = staré odpracované, hours_log = nové)
project_plan_total     = SUM(tpv.hodiny_plan) pre projekt
consumption_ratio      = min(1, project_consumed_total / project_plan_total)
item_consumed          = tpv.hodiny_plan × consumption_ratio
item_remaining         = max(0, tpv.hodiny_plan − item_consumed)
inbox.estimated_hours  = item_remaining / activeChainParts
```

Pre Z-2607-008: ratio = 33.88/586 = 5.78 % → každá položka stratí 5.78 % zo svojej pracnosti → inbox total spadne z 586h na ~552h ✓

## Plán implementácie

### 1. `src/lib/recalculateProductionHours.ts`
Toto je primárne miesto, kde sa pravidelne aktualizujú inbox hodiny (volá sa pri „Prepočítať hodiny", po edite TPV počtu, atď.).

V sekcii **„INBOX: direct mirror of TPV item hours"** (riadky 230–290 podľa pôvodného kontextu) doplniť:

a) Pred slučkou cez projekty raz načítať mapu `consumedByProject`:
   - SUM `production_hours_log.hodiny` (vylúčiť TPV/ENG/PRO) per `ami_project_id` → normalizovať
   - PLUS SUM `production_schedule.scheduled_hours WHERE is_midflight=true` per `project_id`

b) Pre každý projekt vypočítať `consumption_ratio`.

c) V calculation per item:
```ts
const tpvHoursTotal = tpvHoursById.get(tpv.id) ?? 0;
const itemConsumed  = tpvHoursTotal * consumptionRatio;
const itemRemaining = Math.max(0, tpvHoursTotal - itemConsumed);
const newHours      = Math.round((itemRemaining / partsCount) * 10) / 10;
```

### 2. `src/lib/midflightImportPlanVyroby.ts`
V inbox reconciliation (riadky 365–387) aplikovať tú istú logiku — `consumption_ratio` per projekt → odrátať podiel z každej inbox položky.

### 3. UI bez zmeny
- Inbox bude prirodzene zobrazovať „zostatok do dokončenia" a celkový súčet sa bude zhodovať s `plán − odpracované`.
- ProjectProgressBar a header metriky používajú už existujúce `hodiny_plan` (zostáva 586h ako celkový plán) — to nemeníme. Mení sa len **inbox „čo zostáva naplánovať"**.

## Edge cases

- Ak `consumption_ratio ≥ 1` (overrun): inbox = 0 pre všetky položky, ale neodstraňujeme ich (nech zostane viditeľné, že treba dokončiť). Voliteľne pridáme info hlášku „Plán prečerpaný".
- Položky v inbox bez TPV match (ad-hoc) zostávajú netknuté.
- Po dokončení (status=completed v schedule) by sa odpočítané hodiny mali aj tak držať — `consumed` zahŕňa midflight a hours_log, oba sú kumulatívne historické zdroje, takže po novom logovaní hodín ratio prirodzene rastie.

## Dotknuté súbory

- `src/lib/recalculateProductionHours.ts` (hlavná zmena — inbox prepočet)
- `src/lib/midflightImportPlanVyroby.ts` (rovnaká logika v reconciliation)

## Výsledok pre Z-2607-008

Pred: inbox 586 h, história 34 h → spolu 620 h (nezmysel, projekt má len 586 h plán)  
Po: inbox 552 h, história 34 h → spolu 586 h ✓

