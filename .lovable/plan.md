

## Rozsah

V `src/components/DilnaDashboard.tsx` rozšíriť zobrazené dlaždice o **všetky projekty s reálne odpracovanými hodinami** v zvolenom týždni — nielen tie zo `production_schedule`. Pridať dva varovné stavy:

- **„Mimo Plán výroby"** — projekt existuje v `projects` tabuľke, má hodiny v `production_hours_log`, ale nie je v `production_schedule` pre daný týždeň. Žltá výstraha.
- **„Nespárované"** — `ami_project_id` z `production_hours_log` neexistuje v `projects` (už implementované, len doladiť styling). Sivá/červená výstraha.

## Zmeny v `DilnaDashboard.tsx`

### 1. Rozšíriť typ `ProjectCard`

Nahradiť `isUnmatched: boolean` enumom `cardWarning`:

```ts
type CardWarning = "none" | "off_plan" | "unmatched";

interface ProjectCard {
  ...
  warning: CardWarning;  // namiesto isUnmatched
  ...
}
```

### 2. Doplniť tretiu vetvu v `useDilnaData`

Po existujúcich dvoch slučkách (scheduled + unmatched) pridať:

```ts
// 3) Off-plan: projekt JE v DB (matched), má hodiny tento týždeň, ale nie je v schedule
for (const [pid, loggedHours] of hoursByProject) {
  if (scheduledProjects.has(pid)) continue;
  if (!knownProjectIds.has(pid)) continue;  // unmatched už spracované vyššie
  if (loggedHours < 0.05) continue;
  const proj = projMap.get(pid)!;
  const usekMap = usekByProject.get(pid);
  const usekBreakdown = usekMap
    ? Array.from(usekMap.values()).sort(...)
    : [];
  const prodPct = (proj.cost_production_pct ?? 30) / 100;
  const valueCzk = (proj.prodejni_cena ?? 0) * prodPct;
  cards.push({
    projectId: pid,
    projectName: proj.project_name || pid,
    warning: "off_plan",
    plannedHours: 0,
    loggedHours,
    trackedPct: 0,
    completionPct: null,
    slipStatus: "none",
    valueCzk,
    usekBreakdown,
  });
}
```

Z prvej slučky odstrániť `isUnmatched` priradenie z `proj === null` (scheduled vždy má proj alebo nie — ak nie, je to skôr `unmatched` v scheduli, ostáva ako warning `unmatched`).

### 3. Helpery pre warning UI

```ts
function warningLabel(w: CardWarning): string {
  if (w === "off_plan") return "Mimo Plán výroby";
  if (w === "unmatched") return "Nespárované";
  return "";
}

function warningPillClass(w: CardWarning): string {
  if (w === "off_plan") return "bg-amber-100 text-amber-800 border border-amber-300";
  if (w === "unmatched") return "bg-slate-200 text-slate-700 border border-slate-300";
  return "";
}

function warningBorderColor(w: CardWarning, projectColor: string): string {
  if (w === "off_plan") return "#d97706";   // amber
  if (w === "unmatched") return "#94a3b8";  // slate
  return projectColor;
}
```

### 4. Render dlaždice

V mapovaní `cards.map(...)`:
- Ľavý border: `warningBorderColor(card.warning, projectColor)`.
- Pre `off_plan`: zobrazí plný `projectName` + `projectId` (rovnako ako naplánované) + pod ním ikonku `AlertCircle` s textom „Mimo Plán výroby" v amber pille.
- Pre `unmatched`: ostáva existujúce zobrazenie (mono ID + sivý label).
- Pre `none`: bez varovania, ako dnes.
- Pri `off_plan` aj `unmatched` skryť slip pill (nemá zmysel bez plánu).

### 5. Sumárna karta „Nespárované"

Premenovať na **„Mimo plán / Nespárované"** s rozdelením `offPlanCount / unmatchedCount`:

```tsx
<span className="text-[#b65d05]">{offPlanCount}</span>
<span className="mx-1">/</span>
<span className="text-slate-600">{unmatchedCount}</span>
```

Spočítať `offPlanCount = cards.filter(c => c.warning === "off_plan").length`.

### 6. Triedenie

Upraviť: delays → slips → ok → off_plan → unmatched → none.

## Overenie

1. T15 (`weekOffset = -1`): zobraziť dlaždice projektov z `production_hours_log` ktoré nie sú v `production_schedule` pre 2026-04-13. Tie známe projekty dostanú amber border + pill „Mimo Plán výroby". Neznáme `ami_project_id` ostanú „Nespárované".
2. Aktuálny týždeň: dlaždice projektov v pláne (zelená/žltá/červená) zobrazia sa prvé, off-plan/unmatched za nimi.
3. Sumár: „Mimo plán / Nespárované" počty sedia s počtom dlaždíc.
4. Úsek breakdown rozbalený funguje aj pre off-plan dlaždice.
5. Žiadny projekt z `overhead_projects` (REZ, ENG, PM…) sa nezobrazí ako off-plan (filter `overheadSet` ostáva).

## Dotknuté súbory

- `src/components/DilnaDashboard.tsx`

