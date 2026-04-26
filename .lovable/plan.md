# Refactor Výroba: project-centric → bundle-centric

## Problém (z porovnania s Dílňou T18)

Dílňa zobrazuje **každý bundle** samostatne (Allianz A-4 a Allianz B = dve karty, každá s vlastným cieľom a vlastnými prvkami). Výroba zobrazuje **projekt ako celok** — všetky bundles projektu zlejene do jednej karty, do jedného detail panelu. To spôsobuje:

1. **Sidebar:** Allianz sa ukáže ako 1 karta namiesto dvoch (A-4 split + B full).
2. **Detail panel:** po výbere Allianz vidíš všetky prvky projektu naprieč všetkými bundles — nie len prvky daného bundle.
3. **Cieľ (weeklyGoal):** počíta sa per-projekt → split bundle (20%) sa „zmieša" s full bundle (100%) a výsledok je nezmysel.
4. **Spillover dedup + merge:** aktuálne mergujem spilled bundles do projekt-karty (`existing = result.find(r => r.projectId === b.project_id)`) → Allianz A-5 (spilled z T17) sa pridá do Allianz A-6 karty (T18 plán) → karta vyzerá zle a duplikuje sa logika.

## Cieľový stav

Každá karta v sidebare = jeden bundle. Selekcia, detail panel, daylog, cieľ, status — všetko per-bundle. Identita = `bundleKey` = `projectId::stageId::bundleLabel::splitGroupId|full`.

## Konkrétne zmeny v `src/pages/Vyroba.tsx`

### 1. Dátový model (`VyrobaProject` → `VyrobaBundle`)

Premenovať/rozšíriť interface (~r. 291-306):

```ts
interface VyrobaBundle {
  bundleKey: string;            // unique id
  projectId: string;
  projectName: string;
  stageId: string | null;
  bundleLabel: string | null;   // "A-4", "B"...
  bundleType: "full" | "split";
  splitGroupId: string | null;
  splitPart: number | null;
  splitTotal: number | null;
  totalHours: number;
  scheduleItems: ScheduleItem[]; // LEN prvky tohoto bundle
  color: string;                 // farba projektu (zdieľaná v rámci projektu)
  pm?: string | null;
  expedice?: string | null;
  deadline?: Date | null;
  isSpilled?: boolean;
  isPaused?: boolean;
  pauseReason?: string | null;
  pauseExpectedDate?: string | null;
  projectStatus?: string | null;
}
```

`hasSpilledItems` zmizne (zbytočné — každý spilled bundle je teraz vlastná karta).

### 2. Builder funkcie (`buildProjectsForWeek` ~r. 175-277, a duplicitná verzia ~r. 600-700)

- Namiesto `result.push({ projectId: b.project_id, ... scheduleItems: b.items })` vytvoriť **jeden record per bundle** so `bundleKey` z `productionBundles.buildBundleKey` alebo lokálnym helperom.
- Spillover: zrušiť merge do `existing` projekt-karty. Spilled bundle = samostatná karta (presne ako Dílňa). Dedup `destBundleKeys` ostáva — len blokuje pridanie spilled bundle, ak rovnaký `bundleKey` už v T+1 existuje (napr. ten istý split chain part).
- Sort: completed last → paused last → spilled first → ostatné.

### 3. Selekcia (`selectedProjectId` → `selectedBundleKey`) ~r. 753-810

```ts
const [selectedBundleKey, setSelectedBundleKey] = useState<string | null>(null);
const selectedBundle = enrichedBundles.find(b => b.bundleKey === selectedBundleKey) || null;
```

Auto-select na `enrichedBundles[0].bundleKey` keď zoznam zmení (~r. 805).

### 4. Per-bundle helpers (cieľ, status, progress)

- `getWeeklyGoal(projectId)` → `getWeeklyGoal(bundle: VyrobaBundle)`:
  - Full bundle → 100
  - Split bundle → použiť `chainWindowBySplitGroup.get(bundle.splitGroupId).end` (rovnaký výpočet ako Dílňa, treba načítať `production_schedule` chain — pravdepodobne už máme v scope cez `getChainWindow`).
  - Spilled → 100 (alebo zachovať aktuálne správanie, ktoré už spilled = 100).
- `getProjectStatus`, `getBundleProgress`, `getLatestPercent`, `getLatestPhase`, `getLogsForProject`: prepojiť na `bundleKey` resp. zdroj `production_daily_logs.bundle_id`. Aktuálne sa používa `bundleId(projectId)` — treba prejsť na `bundleId(bundle)` ktorý zohľadní `stageId + bundleLabel + splitGroupId` (resp. už ho máme v `production_daily_logs.bundle_id`).
- Pozor: `production_daily_logs` ukladá `bundle_id`. Treba overiť, či je to projekt-level alebo bundle-level. Ak projekt-level → daylog ostáva projekt-level, len cieľ a items sa filtrujú per-bundle (consistent s Dílňou).

### 5. Render sidebar + sloty (~r. 2010-2090, `slideSpilled`, `slideNormal`)

- `enrichedBundles.filter(b => b.isSpilled)` a `... !b.isSpilled` namiesto `enrichedProjects`.
- `key={b.bundleKey}`, `isSelected={selectedBundleKey === b.bundleKey}`, `onClick={() => setSelectedBundleKey(b.bundleKey)}`.
- Zobraziť bundle label v karte (napr. „Allianz A-4" / „Allianz B"), nie len projektové meno — rovnako ako Dílňa.

### 6. Detail panel + log akcie (~r. 1167-1540, 1780-1830)

- `selectedProject` → `selectedBundle`.
- `selectedProject.scheduleItems` už obsahuje len prvky bundle → automaticky zúži zoznam v detail paneli.
- `bundleId(selectedProject.projectId)` → použiť priamo `selectedBundle.bundleKey` alebo zachovať `bundleId(...)` ak je to DB-level identifikátor pre `production_daily_logs.bundle_id`.
- Akcie (`handleSendToExpedice`, `handleSpillToNextWeek`, atď.) operujú nad `selectedBundle.scheduleItems` — žiadna zmena logiky, len sa zúži scope.

### 7. Header count + sumáre (~r. 1156-1163)

- „Plán T18 (4)" → spočítať `slideNormal.length` (počet bundles, nie projektov). Pre Insia A-4 + Insia B = 2 karty, čo zodpovedá Dílni.

### 8. Context menu (~r. 766, 1724-1730)

- `ctxMenu.projectId` ostáva projektovou akciou (otvoriť projekt, zmeniť status), nie bundle-level. Bez zmeny.

## Mimo `Vyroba.tsx`

Žiadne zmeny v `WeeklySilos.tsx`, `DilnaDashboard.tsx`, `useProductionSchedule.ts` — tie už sú bundle-aware.

## Validácia (vizuálna, po zmene)

V T18 Výroba MUSÍ ukazovať presne:
- **Přelité (4):** Insia A-4, Insia B, Příluky Valovi A-5, Allianz B
- **Plán (4):** RD Cigánkovi A-13, Multisport A-3, Reklamace Bar terasa A, Allianz A-6
- Header „Plán T18 (4)" sedí so 4 kartami
- Klik na Allianz A-6 v detail paneli ukáže LEN prvky A-6, klik na Allianz B v Prelitých LEN prvky B
- T17 a T19 bez sekcie Prelité

## Riziká

- `production_daily_logs.bundle_id`: ak je projekt-level, daylog pre Allianz pôjde naprieč A-4 aj B → zobrazí to isté % v oboch kartách. Treba overiť počas implementácie (`SELECT DISTINCT bundle_id FROM production_daily_logs WHERE project_id = 'Z-2617-001'`). Ak je projekt-level, akceptujeme to ako súčasný stav (rovnako ako Dílňa) a per-bundle ide len o **filtrovanie items + cieľ**, nie o samostatný daylog.
- Veľkosť patchu: ~6176 riadkov v `Vyroba.tsx`, dotkne sa cca 30-40 miest s `projectId`/`selectedProject`. Pôjdem postupne cez `code--line_replace` po sekciách: typy → builder → selekcia → helpers → render → detail panel.
