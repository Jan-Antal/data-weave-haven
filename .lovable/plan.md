# Posun hranice týždňa: pracovný týždeň končí piatkom

## Problém

Naprieč modulmi **Dilna (Analytics)**, **Výroba** a **Plán Výroby** sa „aktuálny týždeň" počíta podľa kalendárneho ISO pravidla pondelok–nedeľa. Cez víkend (sobota a nedeľa) tak systém stále zobrazuje predošlý týždeň ako aktuálny:

- **Dilna**: `getISOWeekForOffset(0)` v `DilnaDashboard.tsx` používa `day === 0 ? -6 : 1 - day` → v sobotu = T18, prelité z T17.
- **Výroba**: `getMonday()` (riadok 94) a `realMondayForHelper` (riadok 221) — rovnaká logika, spillover do T+1 sa zobrazí až v pondelok.
- **Plán Výroby**: `currentWeekKey` (riadok 1226) a inicializácia `monday` (riadok 353) — to isté.

Dôsledok: v sobotu po skončení pracovného týždňa user nevidí svoje nedokončené (prelité) projekty v novom týždni — uvidí ich až v pondelok.

## Cieľ

Pracovný týždeň končí v **piatok večer**. Od **soboty 00:00** sa už za aktuálny týždeň považuje nasledujúci kalendárny týždeň (od najbližšieho pondelka), takže:

- Sobota T18 (kalendárne) → systém zobrazí T19 ako aktuálny.
- V T19 sú nedokončené bundly z T18 zobrazené ako „prelité z T18".
- Stav pretrváva celý víkend (so + ne) až do piatku ďalšieho týždňa.

## Riešenie

Vytvorím jeden zdieľaný helper a nahradím ním všetky lokálne kópie výpočtu „pondelok aktuálneho týždňa".

### 1. Nový helper `src/lib/workWeek.ts`

```ts
/**
 * Vráti pondelok "aktuálneho pracovného týždňa".
 * Pravidlo: po-pia → aktuálny kalendárny týždeň. so/ne → nasledujúci týždeň.
 * Toto odráža, že pracovný týždeň končí piatkom; cez víkend už vidíme nový týždeň
 * a nedokončené bundly z minulého týždňa sa zobrazujú ako "prelité".
 */
export function getWorkWeekMonday(reference: Date = new Date()): Date {
  const d = new Date(reference);
  const day = d.getDay(); // 0=Ne, 1=Po, ..., 6=So
  let diff: number;
  if (day === 0) diff = 1;        // nedeľa → +1 deň na pondelok (ďalší týždeň)
  else if (day === 6) diff = 2;   // sobota → +2 dni na pondelok (ďalší týždeň)
  else diff = 1 - day;            // po–pia → pondelok aktuálneho týždňa
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
```

### 2. Náhrady v existujúcich súboroch

**`src/components/DilnaDashboard.tsx`** (riadky 27–41)
- Funkciu `getISOWeekForOffset` prepísať tak, aby používala `getWorkWeekMonday()` namiesto manuálneho výpočtu cez `day === 0 ? -6 : 1 - day`. Offsetovanie po 7 dňoch a výpočet ISO čísla týždňa zostáva nezmenené.

**`src/pages/Vyroba.tsx`**
- Riadky 94–101 (`getMonday`): nechať helper, ale vytvoriť/použiť `getWorkWeekMonday()` všade, kde sa volá `getMonday(new Date())` pre účely „aktuálny týždeň". Ostatné volania `getMonday(d)` so zadaným dátumom (napr. drag/drop kalkulácie) zostávajú bez zmeny, pretože konvertujú konkrétny dátum na pondelok jeho ISO týždňa.
- Riadok 221 `realMondayForHelper` v spill-helperi: nahradiť výpočtom `getWorkWeekMonday()`. Tým sa od soboty stane `spilloverDest` aktuálny týždeň namiesto T+1, a prelité bundly sa korektne zobrazia.

**`src/pages/PlanVyroby.tsx`**
- Riadky 353–356 (inicializácia `monday` pri prvom rendri): použiť `getWorkWeekMonday()`.
- Riadky 1226–1228 (`currentWeekKey`): použiť `getWorkWeekMonday()`. Ovplyvní `isPastWeek` rozhodovanie na riadku 1315 a všetky následné výpočty kapacity / prelití v týždennom prehľade.
- Riadok 1217 a riadok 1242 (`firstWeekMonday.getDay()`): tieto manipulujú s konkrétnymi dátumami (nie „dnes"), takže zostávajú bez zmeny.

### 3. Audit ostatných miest

Skontrolujem (a podľa potreby aktualizujem) ďalšie miesta, kde sa cez `new Date()` + `getDay()` počíta „dnešný" pondelok pre účely zobrazovania aktuálneho týždňa:

- `src/hooks/useProductionInbox.ts`, `useProductionExpedice.ts`, `useProductionSchedule.ts` — ak používajú „aktuálny týždeň" na kategorizáciu (Aktívne / Naplánované, Expedice atď.), zjednotia sa.
- `src/components/production/InboxPanel.tsx`, `WeeklySilos.tsx`, `ExpedicePanel.tsx` — overiť, či vykreslujú „aktuálny týždeň" na základe lokálneho `new Date()`.
- `src/lib/midflightImportPlanVyroby.ts` `getCurrentMonday()` — tento sa **nemení**, pretože ide o referenčnú deliacu čiaru pre historické dáta (nemá UX kontext „víkend = ďalší týždeň").
- `supabase/functions/forecast-schedule/index.ts` `getWeekKey` — server-side forecast, ktorý plánuje od „teraz" do budúcnosti. Tu sa pravidlo cez víkend tiež posúva na ďalší týždeň, aby forecast nezačínal v už uzavretom týždni. Doplním aj tu rovnaký weekend-shift.

### 4. Memory update

- Aktualizovať `mem://features/production-tracking/spill-logic` (ak existuje) alebo doplniť nový záznam, že **„aktuálny týždeň" sa určuje pracovne (po–pia); od soboty je aktuálny ďalší týždeň**, a všetky moduly to musia rešpektovať cez `getWorkWeekMonday()`.

## Súbory na úpravu

- `src/lib/workWeek.ts` (nový)
- `src/components/DilnaDashboard.tsx`
- `src/pages/Vyroba.tsx`
- `src/pages/PlanVyroby.tsx`
- `supabase/functions/forecast-schedule/index.ts`
- prípadne `src/hooks/useProductionInbox.ts`, `useProductionExpedice.ts`, `src/components/production/WeeklySilos.tsx`, `InboxPanel.tsx`, `ExpedicePanel.tsx` — podľa nálezov pri audite
- `.lovable/memory/index.md` + nový/aktualizovaný memory súbor o pravidle pracovného týždňa

## Očakávaný výsledok

- V piatok večer / sobotu ráno sa Dilna, Výroba aj Plán Výroby preklopia na **nový týždeň**.
- Nedokončené bundly z minulého (právě skončeného) týždňa sa okamžite zobrazia v sekcii „⚠ Prelité z T{n−1}" a zostanú tam celý nový týždeň.
- Pondelok ráno už nedôjde k žiadnemu „skoku" — užívateľ vidí kontinuitne to isté ako cez víkend.
