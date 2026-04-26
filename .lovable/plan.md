# Cieľ

Opraviť `src/components/DilnaDashboard.tsx` tak, aby progress bary v T19 zodpovedali realite. Moje predošlé úpravy v súbore **nie sú prítomné** (overené `rg` — žiadne MF_, žiadne `existedBefore`, `resolveBundlePct` ignoruje identitu cez `_identity`). Zostávajú dva konkrétne bugy zo screenshotu:

- **RD Skalice A-3** ukazuje `100 % / 12 %` — má byť `12 % / 100 %`.
- **Allianz – 5.patro D** ukazuje `40 % / 100 %` — má byť `0 % / 100 %`.

# Diagnóza (potvrdená v kóde)

1. **`resolveBundlePct(pid, _identity)`** (r. 410–428) — parameter identity ignorovaný. Carry-forward na úrovni projektu → Allianz D dostáva 40 % z logov A/B/C.
2. **`bundleExpectedPctScaled`** (r. 433–446) škáluje cez `dayFraction`. V `dayFraction` (r. 491) je pre budúce/víkendové stavy hodnota **0**, čiže pre split bundle, ktorého slice je práve tento týždeň, vracia `start` (≈ 12 %) namiesto `end` (100 %). Hodnoty v UI sú preto prehodené.
3. **MF_/HIST_ markery** — daily-log loop (r. 324–331) nemá filter, takže umelé `100 %` markery z midflight importu môžu falošne nasolíť `pctByProjectWeek` aj `latestPctByProject`.

# Zmeny v `src/components/DilnaDashboard.tsx`

## 1) Filter MF_/HIST_ markerov v daily-log loope

V loope `for (const log of dailyLogs)` (r. 324–331) a v paralelnom `for (const log of prevDailyLogs)` (r. 335–339) preskočiť syntetické markery:

```ts
if (log.week_key?.startsWith("MF_") || log.week_key?.startsWith("HIST_")) continue;
if (log.bundle_id.includes("::MF_") || log.bundle_id.includes("::HIST_")) continue;
```

## 2) `bundleExpectedPctScaled` — pre budúce týždne `end` slice

Posledná vetva funkcie:

```ts
if (!found) return 100;
if (isPastWeek) return Math.round(end);
if (!isCurrentWeek) return Math.round(end);   // future week → cieľ konca slice
return Math.round(start + (end - start) * dayFraction);
```

Tým **RD Skalice A-3** v T19 (víkend, `dayFraction = 0`) ukáže target `100 %`.

## 3) `resolveBundlePct` — identity-aware carry-forward

Prepísať telo:

```ts
function resolveBundlePct(pid: string, identity: string): number | null {
  const displayedKey = `${pid}::${weekInfo.weekKey}`;
  if (pctByProjectWeek.has(displayedKey)) {
    const idsHere = identitiesByProjectWeek.get(displayedKey);
    if (!idsHere || idsHere.has(identity)) {
      return pctByProjectWeek.get(displayedKey)!;
    }
  }
  const priorWeeks = Array.from(pctByProjectWeek.keys())
    .filter(k => k.startsWith(`${pid}::`) && k.split("::")[1] < weekInfo.weekKey)
    .map(k => k.split("::")[1])
    .sort((a, b) => b.localeCompare(a));
  for (const w of priorWeeks) {
    const ids = identitiesByProjectWeek.get(`${pid}::${w}`);
    if (ids && ids.has(identity)) {
      return pctByProjectWeek.get(`${pid}::${w}`) ?? null;
    }
  }
  return null;   // identita historicky neexistovala → brand-new bundle stays 0 %
}
```

Tým **Allianz D** (úplne nová identita) → `null` → bar 0 %.

## 4) Split-chain start fallback v call-sites

Pre split bundle, ktorému `resolveBundlePct` vrátil `null`, treba ukázať **start slice** (= `cum` pred displayed week), aby chain niesol pozíciu reťaze. Pridať helper:

```ts
function sliceStartPct(splitGroupId: string): number {
  const weeks = [...(splitGroupWeeks.get(splitGroupId) ?? [])].sort((a, b) => a.week.localeCompare(b.week));
  const total = weeks.reduce((s, w) => s + w.hours, 0);
  if (total <= 0) return 0;
  let cum = 0;
  for (const w of weeks) {
    if (w.week === weekInfo.weekKey) return Math.round(cum);
    cum += (w.hours / total) * 100;
  }
  return 0;
}
```

A v oboch call-sites (r. 611–617 a r. 695–699) po výpočte `resolvedPct`:

```ts
let resolvedPct = isUnmatched ? null : resolveBundlePct(pid, bIdentityWithStage);
if (resolvedPct == null && b.split_group_id && !isUnmatched) {
  resolvedPct = sliceStartPct(b.split_group_id);
}
const bCompletion = resolvedPct;
```

Tým **RD Skalice A-3** (split chain, žiadny vlastný log v T19) → bar = `12 %` (start slice).

# Akceptačné kritériá (T19)

- **RD Skalice A-3**: bar **12 %**, target **100 %**.
- **Allianz – 5.patro D**: bar **0 %** (resp. "—"), target **100 %**.
- **Multisport A-4**: zachované správanie.
- MF_/HIST_ markery už neovplyvňujú žiadny bar.

# Dotknuté súbory

- `src/components/DilnaDashboard.tsx` (5 blokov: 2× daily-log loop, `bundleExpectedPctScaled`, `resolveBundlePct`, 2× call-sites + nový `sliceStartPct`).

Žiadne DB ani iné komponentové zmeny.