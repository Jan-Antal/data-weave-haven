
## Plán: Zvýraznenie víkendov a sviatkov v grafe "Hodiny v čase"

### Cieľ
V `BarChart` v `VykazReport.tsx` vizuálne odlíšiť dni/týždne, kedy sa neočakávajú hodiny (víkendy, české štátne sviatky, firemné sviatky), pomocou svetlosivého pozadia. Tracknuté hodiny v týchto dňoch zostanú viditeľné v popredí.

### Implementácia

**1. Detekcia non-working dní**
- Pre denný režim (`effectiveBucket === "day"`):
  - Víkend = `date.getDay() === 0 || 6`
  - Český štátny sviatok = využiť existujúci hook `useCzechHolidays(year)` z `src/hooks/useWeeklyCapacity.ts` (24h cache, fallback)
  - Firemný sviatok = `useCompanyHolidays()` z toho istého súboru (range start_date..end_date)
- Pre týždňový režim (`effectiveBucket === "week"`):
  - Spočítať počet pracovných dní v týždni; ak je 0 → plný šedý highlight, ak <5 → čiastočný (pomer = neWorking/5, použijeme alpha alebo skipneme)
  - Pre jednoduchosť: označiť týždeň iba ak má **0 pracovných dní** (extrémne zriedkavé) — inak nezvýrazňovať. Hlavná hodnota featúry je v dennom režime.

**2. Pridať flag do `chartData`**
- Každý bucket dostane `isNonWorking: boolean` a `nonWorkingLabel?: string` (napr. "Víkend", "Velikonoční pondělí", "Firemní dovolená")

**3. Vykreslenie šedého pozadia**
- Použiť `<Bar>` s druhým `dataKey="bgFull"` pred hlavným barom hodín:
  - `bgFull` = max hodnota Y pre non-working buckets, inak 0
  - Farba `hsl(var(--muted))` s opacity ~0.4
  - `isAnimationActive={false}`, `stackId` NEpoužívať (chceme overlay, nie stack)
- Lepšia varianta: použiť `<ReferenceArea>` z recharts pre každý non-working bucket s `fill="hsl(var(--muted))"` a `fillOpacity={0.35}`. Toto kreslí pásik na celú výšku bez ovplyvnenia osi Y a hlavný `<Bar>` hodín ostane vykreslený **v popredí**.
- Zvolíme `ReferenceArea` — čistejšie, nepotrebuje pomocné dáta v bare.

**4. Tooltip rozšírenie**
- Ak hover na non-working bucket → v custom tooltip pridať podtitulok napr. `"Víkend"` / `"Velikonoční pondělí"` / `"Firemní dovolená"` šedou kurzívou pod dátumom.
- Vyžaduje custom `content` prop na `<RTooltip>` namiesto default rendereru (alebo `formatter`/`labelFormatter` pre jednoduchšiu cestu).

**5. Legenda (mini)**
- Pod nadpisom karty `"Hodiny v čase"` malý chip: `▭ Víkend / svátek` v `text-[11px] text-muted-foreground` so šedým swatchom — aby user pochopil, čo šedé pozadie znamená.

### Súbor
- `src/components/analytics/VykazReport.tsx` — jediný súbor
- Importy navyše:
  - `ReferenceArea` z `recharts`
  - `useCzechHolidays`, `useCompanyHolidays` z `@/hooks/useWeeklyCapacity`

### Edge cases
- Roky pokrývajúce viacero kalendárnych rokov (3 mesiace cez Nový rok) → volať `useCzechHolidays` pre všetky relevantné roky (1–2 max), zlúčiť do `Set<string>` YYYY-MM-DD.
- Týždňový režim: zatiaľ bez highlightu (väčšina týždňov má aspoň 1 pracovný deň). Doplníme len ak týždeň má 0 pracovných dní.
- Lokálne dátumy (`getFullYear`/`getMonth`/`getDate`) — žiadne `toISOString` (UTC posun).

### Bez zmien
- Žiadne zmeny v dátach, agregácii hodín, fetchingu, sekciách tabuľky, exporte, RLS ani v iných súboroch.
- Žiadne nové závislosti (`recharts`, hooky už existujú).
