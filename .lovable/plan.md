# Plán: Redesign Dílna kariet — bundle-level progress + správna Hodnota výroby

## Cieľ
1. Opraviť Hodnotu výroby — počítať z reálnych odpracovaných hodín stejnou logikou ako Plán Výroby (`(hours / max(planHours, realLifetimeHours)) * prodejniCenaCZK` s EUR→CZK konverziou).
2. Zobraziť dve čísla: **veľké** = realita (z `loggedHours`), **malé vedľa** = cíl (z `plannedHours` zo `production_schedule` — sedí na T17 v Pláne Výroby).
3. Redesign project kariet — namiesto 2 progress barov pre celý projekt → tabuľka **bundle riadkov** s per-bundle completion.

## Súbor
`src/components/DilnaDashboard.tsx` (jediný súbor)

---

## Časť A — Hodnota výroby (logged + cíl)

### A1. Rozšíriť `useDilnaData`
Načítať dodatočné dáta:
- `projects` → pridať `currency`, `created_at`, `marze`, `prodejni_cena`, `cost_production_pct`
- `project_plan_hours` → `hodiny_plan` per project (mapa `planHoursMap`)
- RPC `get_hours_by_project` (bez date filtra) → `realHoursLifetimeMap` (celkové odpracované hodiny per project)
- `exchange_rates` → pre EUR→CZK konverziu podľa roka projektu

### A2. Helper `calcDilnaValue(hours, projectId, lookups)`
Replikuje `calcProdejValue` z `WeeklySilos.tsx`:
```ts
function calcDilnaValue(
  weekHours: number,
  projectId: string,
  projects: ProjectLookup,
  planHoursMap: Map<string, number>,
  realHoursLifetimeMap: Map<string, number>,
  exchangeRates: ExchangeRate[],
): number {
  if (weekHours <= 0) return 0;
  const proj = projects[projectId];
  if (!proj?.prodejni_cena) return 0;
  
  // EUR → CZK konverzia
  const year = proj.created_at ? new Date(proj.created_at).getFullYear() : new Date().getFullYear();
  const rate = getExchangeRate(exchangeRates, year);
  const prodejniCenaCZK = proj.currency === "EUR" ? proj.prodejni_cena * rate : proj.prodejni_cena;
  
  // Plánované hodiny vs reálne (lifetime)
  const planHours = planHoursMap.get(projectId) || 0;
  const realLifetime = realHoursLifetimeMap.get(projectId) || 0;
  const denom = Math.max(planHours, realLifetime);
  if (denom <= 0) return 0;
  
  return (weekHours / denom) * prodejniCenaCZK;
}
```

### A3. Per-card hodnoty
V `cards.map` pre každý projekt:
```ts
const valueCzk = calcDilnaValue(loggedHours, pid, ...);          // realita
const valueTargetCzk = calcDilnaValue(plannedHours, pid, ...);   // cíl
```
kde `plannedHours` = súčet `scheduled_hours` zo `production_schedule` pre daný projekt + `weekKey`.

### A4. Summary karta „Hodnota výroby"
```tsx
<Card className="p-4 shadow-sm">
  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Hodnota výroby</div>
  <div className="flex items-baseline gap-2 mt-1">
    <div className="text-2xl font-bold tabular-nums text-[#2f6f2c]">
      {fmtMCzk(totalValueCzk)}
    </div>
    <div className="text-sm text-muted-foreground tabular-nums">
      / cíl {fmtMCzk(totalValueTargetCzk)}
    </div>
  </div>
  <div className="text-[11px] text-muted-foreground mt-2">Reálne odpracované / plán týždňa</div>
</Card>
```

### A5. Per-card display (pravý dolný roh)
Nahradiť súčasný jediný `valueCzk` dvojicou:
```tsx
<div className="text-right">
  <div className="text-base font-semibold tabular-nums text-[#2f6f2c]">{fmtMCzk(valueCzk)}</div>
  <div className="text-[10px] text-muted-foreground tabular-nums">cíl {fmtMCzk(valueTargetCzk)}</div>
</div>
```

---

## Časť B — Bundle-level project karty

### B1. Načítať bundles per projekt
V `useDilnaData` pre aktuálny `weekKey` zo `production_schedule`:
- Filter: `scheduled_week === weekKey`, `status IN ("scheduled","in_progress","paused")`
- Pre každý projekt zoskupiť riadky cez `buildBundleKey({ weekKey, project_id, stage_id, bundle_label, split_part })`
- Pre každý bundle vypočítať `bundle_id` rovnakým algoritmom aký používa `production_daily_logs.bundle_id` (treba overiť — pozri nižšie)
- Použiť `deriveBundleSplitMeta` na zistenie `splitPart`/`splitTotal`
- Display label: `formatBundleDisplayLabel({ bundle_label, split_part, bundle_type })` → napr. `"A"` alebo `"A-2"`. Pre split pridať `/splitTotal` → `"A 2/4"`.

### B2. Per-bundle completion z `production_daily_logs`
- Už máme `dailyLogs` načítané (`useProductionDailyLogs(weekKey)` — Map<bundle_id, DailyLog[]>).
- Pre každý bundle: `completionPct = max(percent)` zo všetkých logov daného `bundle_id`.
- Ak žiadny log → `null` (zobraziť ako prázdny šedý bar).

**⚠️ Otvorená otázka:** musím overiť, ako sa mapuje `production_schedule` riadok → `production_daily_logs.bundle_id`. V kóde sa `bundle_id` v daily logs javí ako `string` (text), nie UUID schedule riadku. V default móde najprv preskúmam `useDilnaData` (existujúcu logiku per-card completion) a `WeeklySilos`/`Vyroba` aby som potvrdil mapping. Ak je to `production_schedule.id` (jeden zo splitnutých riadkov), použijem prvý riadok bundle. Ak je to `bundle_key`, použijem `buildBundleKey`.

### B3. Per-bundle expectedPct (chain window logika)
Pre každý bundle vypočítať `expectedPct` rovnakou logikou akú dnes `useDilnaData` používa pre celý projekt (chain window: počet dní od začiatku chainu do dnes / celkový počet dní chainu × 100). Aplikované per bundle pomocou `chainWindowMap` keyed cez `split_group_id` alebo `bundle_id`.

### B4. Per-bundle slip status
```ts
const slip = computeSlip(completionPct, expectedPct, /* loggedHours irrelevant per bundle */ 0, false);
```
Status: `ok` (zelený), `slip` (jantárový), `delay` (červený), `none` (šedý — žiadny log).

### B5. Project-level slip badge
```ts
const projectSlip = bundles.reduce((worst, b) => 
  rank(b.slip) > rank(worst) ? b.slip : worst, "ok");
// rank: none=0, ok=1, slip=2, delay=3
```

### B6. Render kariet
**Odstrániť:**
- Per-projekt hours bar (Hodiny: `loggedHours / weeklyTarget`)
- Per-projekt completion bar
- Sekcia s Úseky breakdown (alebo nechať pod expand?)

**Pridať:** Tabuľka bundlov:
```tsx
<div className="space-y-1">
  {bundles.map(b => (
    <div key={b.bundle_id} className="flex items-center gap-2 text-xs">
      <div className="w-16 font-medium tabular-nums">{b.displayLabel}</div>
      <div className="flex-1 relative h-2 bg-gray-100 rounded">
        {b.completionPct != null && (
          <div 
            className={`absolute inset-y-0 left-0 rounded ${slipBarStyles(b.slip).bar}`}
            style={{ width: `${Math.min(100, b.completionPct)}%` }}
          />
        )}
        {b.expectedPct != null && (
          <div 
            className="absolute inset-y-0 w-px bg-teal-600"
            style={{ left: `${Math.min(100, b.expectedPct)}%` }}
          />
        )}
      </div>
      <div className="w-10 text-right tabular-nums text-muted-foreground">
        {b.completionPct != null ? `${Math.round(b.completionPct)}%` : "—"}
      </div>
    </div>
  ))}
</div>
```

### B7. Project slip badge top-right
```tsx
<span className={`text-[10px] px-2 py-0.5 rounded-full ${slipPillClass(projectSlip)}`}>
  {slipLabel(projectSlip)}
</span>
```

---

## Časť C — Summary karty (top)
**Bez zmeny** — 4 pôvodné (Hodiny týždňa, Denný cíl, Slip, Off-plan) **+** nová 5. „Hodnota výroby" (z časti A4). Grid `md:grid-cols-5`.

---

## Akceptačné kritériá
1. ✅ Karta „Hodnota výroby" hore zobrazuje veľké realne (`X,XX M Kč`) + malé `cíl Y,YY M Kč`. Cíl sumár sedí na hodnotu z Plánu Výroby T17 (~1,9 M Kč).
2. ✅ Per-card hodnota dole vpravo zobrazuje rovnakú dvojicu (realne / cíl).
3. ✅ Hodiny zostávajú **iba v top summary** (Hodiny týždňa, Denný cíl) — žiadny per-projekt hours bar.
4. ✅ Každá project karta zobrazuje tabuľku bundlov s labelom (vrátane split formátu `A 2/4`), thin progress barom (completion %), tyrkysovou ryskou (expectedPct), a číslom %.
5. ✅ Bar farba: zelená (ok), jantárová (slip), červená (delay), prázdna šedá (none / no daylog).
6. ✅ Project slip badge = najhorší stav medzi bundlami.
7. ✅ Bundle group respektuje `bundle_label`, `stage_id`, `split_part`/`split_total` z `production_schedule`.

## Mimo rozsah
- Žiadne DB migrácie.
- Žiadne zmeny v `WeeklySilos`, `PlanVyroby`, `production_daily_logs` schéme.
- Žiadne zmeny mobile UI.

## Otvorené otázky pred implementáciou
1. **Bundle ID mapping:** v default móde najprv overím (`code--exec rg "bundle_id"` v src/) ako sa `production_daily_logs.bundle_id` priraďuje k schedule riadkom. Podľa toho zvolím správny join key (buď `production_schedule.id` prvého riadku v bundli, alebo `buildBundleKey(...)`, alebo `bundle_label`).
2. Ak existuje viacero schedule riadkov pre 1 bundle (split na rovnakom týždni), ich completion je **rovnaký** (jeden daily log per bundle), takže netreba spriemerovať.
