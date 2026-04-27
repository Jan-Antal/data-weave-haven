## Problém

Projekt **Příluky Valovi Dům (Z-2504-019)** sa v Dílni / Projekty týdne zobrazuje **dvakrát**:

1. ✅ Správne: "Přelité z T17" — bundle **A** s 95% / 100% (11h)
2. ❌ Duplikát: "Mimo Plán výroby" — bez bundle labelu (11h, plán 0h)

## Príčina (z dát v DB)

Pre tento projekt existujú v `production_daily_logs` pre dnešný deň (2026-04-27) **dva paralelné zápisy** s rovnakým časom a percentom:

| bundle_id | phase | percent |
|---|---|---|
| `Z-2504-019::2026-04-27::SG:b64b341a-…` | Kompletace | 95 |
| `Z-2504-019::2026-04-27` | Řezání | 95 |

Druhý záznam má **iba 2-časťový bundle_id** (`projectId::weekKey`) — bez stage / bundle_label / split_part. Funkcia `get_daily_report` ho považuje za log, vyparsuje z neho `p_bundle_label = ''` a `bundle_display_label = NULL`, takže ho UI nedokáže priradiť k bundlu A → vykreslí ho ako samostatný projekt "Mimo Plán výroby".

To isté sa deje historicky každý deň (vidno duplikáty pre `2026-04-20`, `2026-04-21`, …) — pre každý zápis vznikajú **dva riadky**: jeden 3-časťový (`…::SG:<group>`) a jeden 2-časťový (`…` bez SG).

Ten istý vzor "MF_" (Midflight) tiež zapísal duplikáty s rôznymi formátmi — to je dôvod, prečo sa SG riadky a "naked" riadky množia.

## Čo treba opraviť

### A) Prečistenie duplicitných logov v DB (jednorazový migration script)
Pre každý projekt zmazať z `production_daily_logs` "naked" 2-časťové bundle_id varianty, **ak existuje paralelný 3+časťový záznam s rovnakým `logged_at` a `percent`**. Konkrétne:
- WHERE `bundle_id` má presne 2 časti (`array_length(string_to_array(bundle_id,'::'),1) = 2`)
- A existuje iný riadok s tým istým `project_id`, `logged_at`, `day_index`, `percent`, ktorý má 3+ časti

Toto okamžite odstráni duplicitné karty.

### B) Oprava zápisu logov v aplikačnom kóde
Nájsť miesto, kde sa píše `production_daily_logs` (pravdepodobne `useDailyLog` / `CompletionDialog` / `DailyLogPanel`) a odstrániť **double-write** — momentálne sa zjavne píšu **dva inserty** pre každý log: jeden s SG suffixom a jeden bez. Má sa zapisovať **iba jeden**, vo formáte 5-časťového bundle_id:
```
{projectId}::{weekKey}::{stageId}::{bundleLabel}::{splitPart|full}
```
(podľa formátu, ktorý očakáva nová `get_daily_report`).

### C) Filter v `get_daily_report` ako bezpečnostná sieť
Do `todays_logs` CTE pridať podmienku: ignorovať logy s 2-časťovým `bundle_id` ak existuje 3+časťový log toho istého projektu s rovnakým `logged_at`. Aby sa duplikát nezobrazoval ani vtedy, ak v DB ešte nejaké zostanú.

## Implementácia

1. **Audit zápisu** — `rg "production_daily_logs.*insert\|from\(.production_daily_logs.\).insert"` v `src/` aby sa našli všetky miesta, ktoré píšu log. Identifikovať double-write a opraviť na 1 insert s plným 5-časťovým `bundle_id`.
2. **Migration cleanup** — DELETE duplikátov podľa pravidla z bodu A.
3. **Migration get_daily_report** — pridať dedup filter v CTE `todays_logs`.
4. **Overenie** — refresh Dílna, projekt sa zobrazí len raz v sekcii "Přelité z T17".

## Riziká

- Cleanup je deštruktívny — najprv urobím SELECT preview a vypíšem počet riadkov na zmazanie pred samotným DELETE.
- Ak ešte niečo iné píše naked formát (napr. starší endpoint, edge function), bude treba opraviť aj to. Audit v kroku 1 to odhalí.
