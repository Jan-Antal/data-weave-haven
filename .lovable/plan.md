## Cieľ

V Průvodke (PDF tlačenom z TPV) automaticky vyplniť riadok **"termín výroby"** textom `Exp. DD.MM.YY` pomocou dátumu **expedice** zo zákazky. Ak dátum chýba, zobraziť dialóg s možnosťou tlačiť bez termínu alebo doplniť manuálne neskôr.

## Zmeny

### 1. `src/lib/exportPdf.ts` — `buildPruvodkaHtml`
- Pridať voliteľný parameter `expediceDate?: string | null` do `PruvodkaOptions`.
- V info tabulke v riadku "termín výroby" vyplniť do pravej (podpisovej) bunky text `Exp. DD.MM.YY` (formát `dd.MM.yy` cez `date-fns` + `cs` locale, **lokálny čas**, podľa memory pravidla o dátumoch). Ak `expediceDate` je null → bunka ostane prázdna (`&nbsp;`).
- Štýl: rovnaké písmo ako ostatné `sec-val` riadky, zarovnanie doľava v rámci pravej bunky.

### 2. `src/components/TPVList.tsx`
- Načítať `expedice` zo `projects` tabuľky pre aktuálny `projectId`. 
  - Použiť jednoduchý `useQuery` (alebo dorobiť do existujúceho fetch flow) — `select("expedice").eq("project_id", projectId).maybeSingle()`.
  - Ak `projectId` patrí stage-suffixed projektu (napr. `Z-2620-001`), `expedice` na `projects` rade je relevantná (jeden riadok per project_id v projects tabuľke).
- V `openPruvodka(itemsToPrint)` posielať `expediceDate: project?.expedice ?? null` do `buildPruvodkaHtml`.
- V `handlePruvodka()` rozšíriť logiku:
  - Ak `expedice` chýba **a** nie sú žiadne unapproved položky → otvoriť **nový mini-dialóg** `MissingExpediceDialog` s textom:  
    *"Pre túto zákazku nie je nastavený dátum expedice. Termín výroby v průvodke ostane prázdny — môžete ho doplniť ručne pred tlačou."*
    - Tlačidlá: **Tlačiť bez termínu** (pokračuje cez `openPruvodka`) / **Zrušiť**.
  - Ak chýba expedice **a** zároveň sú unapproved položky → existujúci `pruvodkaWarning` dialóg rozšíriť o riadok upozornenia o chýbajúcom termíne (jeden flow, dve hlášky).

### 3. Drobnosti
- Format helper: použiť `format(parseISO(expedice), "dd.MM.yy", { locale: cs })`. Bezpečné parsovanie cez `safeParseLocalDate` ak existuje (memory: nikdy `toISOString` na lokálne dátumy). Skontrolujem `src/lib/dateFormat.ts` a použijem existujúci helper, inak inline `new Date(year, month-1, day)`.
- Žiadne nové migrácie / DB zmeny — `projects.expedice` už existuje.

## Edge cases
- `expedice` ako `string` v DB môže byť ISO `YYYY-MM-DD` → parsovať lokálne, nie cez `new Date(iso)` aby sa vyhlo T-1 shiftu.
- Tlač cez výber konkrétnych položiek — termín výroby je per-projekt, takže rovnaký pre všetky výbery.
- Print preview cez `PdfPreviewModal` — žiadne zmeny, len HTML obsahuje vyplnenú bunku.

## Súbory
- `src/lib/exportPdf.ts` — rozšíriť typ + render bunky
- `src/components/TPVList.tsx` — fetch expedice, dialóg pre chýbajúcu hodnotu, posielať do `buildPruvodkaHtml`
