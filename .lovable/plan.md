## Problém

V Analytics → Dílna sa pre split bundles (Allianz A-6, D-1) zobrazuje pre všetky bundles rovnaký cieľ namiesto per-bundle. Užívateľ očakáva: A-6 = 68 %, D-1 = 15 %, B (full, prelitý z T-1) = 100 %.

## Príčina

`src/components/DilnaDashboard.tsx`, funkcia `bundleExpectedPctScaled` (L503):

1. **Krehké poradie kódu** — funkcia je definovaná na L503, ale `splitGroupWeeks` (jej zdroj dát) sa napĺňa až na L524–534. Funguje len cez closure timing.
2. **Skoré zaokrúhľovanie** — `chainWindowBySplitGroup` ukladá `Math.round(start)` a `Math.round(end)`, takže ramping pri malých sliceq stráca presnosť.
3. **Full bundles ostanú nedotknuté** — komentár v kóde aj user potvrdzujú: full bundle = balík mal byť dokončený tento týždeň → cieľ celý týždeň 100 % (vrátane prelitých ako Allianz B).

## Plán opravy

**Súbor:** `src/components/DilnaDashboard.tsx` (jediný)

### 1. Reorganizovať poradie definícií (L503–547)
Presunúť výpočet `splitGroupWeeks` a `chainWindowBySplitGroup` **pred** definíciu `bundleExpectedPctScaled`. Lineárne čítanie.

### 2. Floats namiesto skorého `Math.round`
- `chainWindowBySplitGroup` ukladá `start`/`end` ako floats.
- `Math.round` až pri vrátení z `bundleExpectedPctScaled` (poslednýriadok funkcie).

### 3. Zachovať full bundle = 100 %
Bez zmeny správania pre `splitGroupId == null` — vracia stále `100`. Komentár doplniť: *"Full bundle (vrátane prelitých z T-1) = balík mal byť hotový tento týždeň → cieľ 100 % po celý týždeň."*

### 4. Verifikácia po implementácii
Manuálne overiť na živom UI v aktuálnom týždni (27.4.):
- Allianz A-6 = 68 % (pondelok)
- Allianz D-1 = 15 %
- Allianz B (full, prelitý) = 100 %

## Riziká
Žiadne behaviour breaking changes pre full bundles. Split bundles dostanú o 1–2 % presnejšie hodnoty pri malých sliceq.