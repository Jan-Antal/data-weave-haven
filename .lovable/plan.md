# Oprava progress barov v Dílne (Analytics → Dílna)

## Diagnóza (potvrdená cez DB)

**RD Skalice (Z-2604-002, A-3 v T19) → zobrazuje `100 % / 12 %`**
- DB `production_daily_logs` obsahuje pre Z-2604-002 záznam `bundle_id = "Z-2604-002::MF_2026-04-13"`, `percent = 100`. Toto je technický **midflight-import marker** (prefix `MF_`), nie reálny log.
- `resolveBundlePct()` (riadok ~420) skenuje všetky kľúče `${pid}::*` v `pctByProjectWeek` a vracia najnovší. Marker `MF_…` je do mapy nasypaný v rovnakej slučke (riadok 324–331), pretože `log.bundle_id.split("::")[0]` z neho urobí čistý `pid`. → carry-forward vráti **100 %**.
- Target `12 %` je `chain-window start` slice A-3 (správna hodnota pre **začiatok** T19, lebo predchádzajúce slices A-1 (8.8 h) + A-2 (6 h) = 12 % zo 121.3 h).
- Pre **future weeks** (`weekOffset > 0`) je `dayFraction = 0` → `bundleExpectedPctScaled` vracia *začiatok* chain-window slice. Používateľ ale chce: **stav = carry z minulosti, cieľ = koniec aktuálneho slice na konci T19**.

**Allianz D (Z-2617-001, full bundle v T19) → zobrazuje `40 % / 100 %`**
- DB má `Z-2617-001::2026-05-04 = 40 %` (log z 23. 4., week_key T19).
- Logy sú **per-projekt-per-týždeň**, nie per-bundle. Carry pre A-6 split chain dáva zmysel (40 % postupu projektu na splite). Pre **úplne nový full bundle D** (žiadne predošlé hodiny v split chain, samostatná entita) je 40 % nezmyselné — D má začať od 0 %.

---

## Oprava

### 1. Vylúčiť `MF_*` markery z `pctByProjectWeek` a `latestPctByProject`

V `DilnaDashboard.tsx` cca riadok 324:

```ts
for (const log of dailyLogs) {
  const pid = log.bundle_id.split("::")[0];
  if (!pid) continue;
  if (log.percent == null) continue;
  // NEW: skip midflight-import markers (week_key like "MF_…" or bundle_id contains "::MF_")
  if (log.week_key?.startsWith("MF_") || log.bundle_id.includes("::MF_")) continue;
  // …
}
```
Rovnako pre `prevDailyLogs` cyklus (riadok 335).

**Effect:** Z-2604-002 v T19 už nezdedí 100 %. Resolve vráti najnovší skutočný log = `Z-2604-002::2026-04-13 = 12 %`. ✅

### 2. Target pre future weeks = koniec chain-window slice (nie scaled)

V `bundleExpectedPctScaled` (riadok ~433):

```ts
function bundleExpectedPctScaled(splitGroupId: string | null): number {
  if (!splitGroupId) return 100; // full bundle target stays 100
  const weeks = [...(splitGroupWeeks.get(splitGroupId) ?? [])].sort(...);
  const total = weeks.reduce((s, w) => s + w.hours, 0);
  if (total <= 0) return 100;
  let cum = 0, start = 0, end = 100, found = false;
  for (const w of weeks) {
    const share = (w.hours / total) * 100;
    if (w.week === weekInfo.weekKey) { start = cum; end = cum + share; found = true; break; }
    cum += share;
  }
  if (!found) return 100;
  // NEW: future weeks → show END of slice (week's full goal); current → ramp by dayFraction;
  // past → already at end (dayFraction=1).
  if (!isCurrentWeek && !isPastWeek) return Math.round(end);
  return Math.round(start + (end - start) * dayFraction);
}
```
Premenné `isCurrentWeek`/`isPastWeek` sú už definované na riadku 487-488.

**Effect:** RD Skalice A-3 v T19 → target = chain-window end = 100 % (lebo A-3 je posledná slice). Stav 12 % / target 100 %. ✅

### 3. Nové full bundles nededia per-projekt log z carry-forward

Carry-forward `resolveBundlePct` aktuálne nerozlišuje, či bundle existoval v predošlom týždni. Riešenie — využiť už existujúcu `identitiesByProjectWeek` mapu (riadok 395):

```ts
function resolveBundlePct(pid: string, identity: string): number | null {
  // 1) Same-week log → use it (covers most cases including split chains).
  const displayedKey = `${pid}::${weekInfo.weekKey}`;
  const sameWeekIdentities = identitiesByProjectWeek.get(displayedKey) ?? new Set();

  if (pctByProjectWeek.has(displayedKey)) {
    // Project-level log applies to bundles that share the active chain (split or
    // continuation). For a NEW full bundle that has no prior history in this
    // project's split chain, return null instead — D should start at 0%.
    if (sameWeekIdentities.has(identity)) {
      // Decide: is this identity a continuation (existed previously) or net-new?
      const priorWeeks = Array.from(identitiesByProjectWeek.keys())
        .filter(k => k.startsWith(`${pid}::`) && k.split("::")[1] < weekInfo.weekKey)
        .sort((a, b) => b.localeCompare(a));
      const existedBefore = priorWeeks.some(k => identitiesByProjectWeek.get(k)!.has(identity));
      if (existedBefore) return pctByProjectWeek.get(displayedKey)!;
      // Net-new bundle this week → don't inherit project-level percent.
      return null;
    }
    return pctByProjectWeek.get(displayedKey)!;
  }

  // 2) Carry from prior weeks ONLY for identities that existed previously
  //    (preserves split-chain continuity, blocks leakage to net-new bundles).
  const priorWeeks = Array.from(pctByProjectWeek.keys())
    .filter(k => k.startsWith(`${pid}::`) && k.split("::")[1] < weekInfo.weekKey)
    .map(k => k.split("::")[1])
    .sort((a, b) => b.localeCompare(a));

  for (const wk of priorWeeks) {
    const idsInWk = identitiesByProjectWeek.get(`${pid}::${wk}`);
    if (idsInWk?.has(identity)) return pctByProjectWeek.get(`${pid}::${wk}`) ?? null;
  }
  // Fallback for legacy bundles without identity history — keep current behaviour.
  return priorWeeks.length > 0 ? pctByProjectWeek.get(`${pid}::${priorWeeks[0]}`) ?? null : null;
}
```

Volanie už posiela `bIdentityWithStage` ako 2. argument (riadok 616, 699), takže netreba meniť call-sites.

**Effect:**
- Allianz **A-6** (split, identity existovala v T17 a T18) → carry 40 %, stav `40 % / 100 %` ✅
- Allianz **D** (full, brand-new identity v T19, nie v T17/T18) → vráti `null` → bar 0 %, stav `— / 100 %` ✅

---

## Zmeny

**Súbor:** `src/components/DilnaDashboard.tsx`
- Pridať MF_ filter v dvoch slučkách logov (~riadky 324, 335).
- Upraviť `bundleExpectedPctScaled` o vetvu pre future weeks (~riadok 433).
- Prepísať `resolveBundlePct` na identity-aware (~riadok 410).

Žiadne DB migrácie. Žiadne ďalšie súbory.

## Očakávaný výsledok pre T19 (po opravách)

| Karta | Pred | Po |
|---|---|---|
| RD Skalice A-3 | `100 % / 12 %` (zelený full bar) | `12 % / 100 %` |
| Allianz D | `40 % / 100 %` | `— / 100 %` (bar prázdny) |
| Allianz A-6 (split) | `40 % / xx %` | `40 % / 100 %` (správne, beze zmeny logiky pre split) |
