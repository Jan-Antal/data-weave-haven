# Výroba: zobrazovať len položky patriace zvolenému bundlu

## Problém
V module **Výroba** detailný panel vpravo zobrazuje všetky položky **projektu** naprieč všetkými týždňami (`getAllItemsForProject(projectId)`). Ak má projekt viacero bundlov v rovnakom týždni (napr. Allianz **A**, **B**, **C**, **D**), kliknutím na ktorýkoľvek bundle sa v sekciách *Aktuální / Budoucí / Hotové* zobrazia položky **všetkých bundlov projektu**, nie iba tie, ktoré naozaj patria do vybraného bundlu — tak ako je to v *Pláne Výroby* (kde každá karta = jeden bundle a obsahuje len `bundle.items`).

## Príčina
- `selectedProject` (typ `VyrobaProject`) je v skutočnosti **jeden bundle** (mapovaný 1:1 z `silo.bundles`). Jeho `scheduleItems` obsahujú správne len položky daného bundlu pre aktuálny týždeň.
- Ale do `DetailPanel` sa cez prop `allItems` posielajú výsledky `getAllItemsForProject(pid)`, ktoré filtrujú **iba podľa `bundle.project_id === pid`** a ignorujú identitu bundlu (`stage_id`, `bundle_label`, `split_group_id`).
- `DetailPanel` z `allItems` skladá `currentItems`/`futureItems`/`completedItems` → preto vidno položky cudzích bundlov.
- Rovnaký problém má `getBundleProgress(pid)` (totálne/hotové hodiny počíta z celého projektu), `areAllPartsCompleted`/`getIncompletePartsInfo` a spill dialog (riadok 2883: `allItemsForProject` pre výber "incomplete items na expedíciu").

## Riešenie
Zaviesť **scope-by-bundle** všade tam, kde sa dnes počíta cez celý projekt:

### 1) Identita bundlu odvodená zo `selectedProject`
Vytvoriť pomocný objekt `bundleIdentity`:
- ak `selectedProject.scheduleItems` obsahuje ≥1 položku so `split_group_id` → identita = množina `split_group_id`s (chain naprieč týždňami)
- inak (full bundle) → identita = `(stage_id, bundle_label)` zobrané z prvej položky

### 2) Nová funkcia `getAllItemsForBundle(selectedProject)`
Nahradí volania `getAllItemsForProject(selectedProject.projectId)` na všetkých 3 miestach, kde sa používa **pre detail vybraného bundlu**:
- `DetailPanel` prop `allItems` (riadky 2409, 2517)
- výpočet `incompleteItems` v Expedíciu dialógu (riadok 2883–2884)

Logika:
```ts
function getAllItemsForBundle(p: VyrobaProject) {
  const splitGroups = new Set(
    p.scheduleItems.map(i => i.split_group_id).filter(Boolean)
  );
  // collect across all weeks of this project, then filter by bundle identity
  const all = getAllItemsForProject(p.projectId);
  if (splitGroups.size > 0) {
    return all.filter(e => e.item.split_group_id && splitGroups.has(e.item.split_group_id));
  }
  // full bundle: match same (stage_id, bundle_label)
  const sample = p.scheduleItems[0];
  return all.filter(e =>
    (e.item.stage_id ?? null) === (sample?.stage_id ?? null) &&
    (e.item.bundle_label ?? null) === (sample?.bundle_label ?? null) &&
    !e.item.split_group_id   // exclude split rows (would belong to chain bundles)
  );
}
```

### 3) `getBundleProgress(pid)` → `getBundleProgress(p: VyrobaProject)`
Aby `totalHours` a `completedHours` boli per-bundle, nie per-project. Volania (riadky 2416, 2524 + interné na 1163, 1133, 1304 atď.) upraviť podľa toho, či pracujeme s konkrétnym bundlom (vždy keď máme `selectedProject`/karta v zozname) alebo s projektovým agregátom (sumár `Týždenné %` v zozname projektov — tam sa správa ako dnes, môžeme buď ponechať alebo zaviesť bundle-aware variant; v prvom kole zmeníme len volania pre **vybraný bundle**, ostatné necháme nezmenené).

Konkrétne:
- volania na riadkoch **2416, 2524** (`bundleProgress={getBundleProgress(selectedProject.projectId)}`) → odovzdávať `selectedProject` a počítať per-bundle
- ostatné call-sites (`getWeeklyGoal`, mosty pre status badge atď.) ostávajú per-project (rovnaké správanie ako dnes)

### 4) `areAllPartsCompleted` / `getIncompletePartsInfo`
Tie rozhodujú o tooltipoch *„X/Y dokončeno v T..."* pre položky v rámci bundlu. Upraviť, aby filtrovali iba v rámci aktuálneho bundlu (cez novú `getAllItemsForBundle`), takže rátanie častí splitu nebude zahŕňať iné bundly projektu.

## Súbory
- `src/pages/Vyroba.tsx` (jediná zmena)

## Čo sa NEmení
- Plán Výroby — ostáva ako referencia (už dnes per-bundle).
- Mobilný a desktopový variant `DetailPanel` zdieľajú rovnaký prop (úprava platí pre oba).
- Logika carry-forward `findPriorChainLog`/`findPriorAnyLog` — nezasahujeme.
- Logika výberu `selectedProject` (stále je 1 karta = 1 bundle).

## Akceptačné kritériá
1. Allianz s bundlami **A, B, C, D** v rovnakom týždni → klik na bundle **D** ukáže v sekcii *Aktuální* iba položky bundla **D** (nie A/B/C).
2. Split chain (napr. Allianz A-5 → A-6) → klik na **A-6** ukáže *Aktuální* položky A-6 a *Hotové*/predch. týždne s rovnakým `split_group_id` (zachovaná dnešná funkcionalita pre splity).
3. Tlačidlo **Expedice** ponúka len nedokončené položky **vybraného bundlu**.
4. Bar `bundleProgress` (totalHours/completedHours v hlavičke) sa počíta len z položiek vybraného bundlu — žiadny presak z iných bundlov projektu.
