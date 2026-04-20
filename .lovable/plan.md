

## Rozsah

Úplne odstrániť všetky automatické zápisy do `production_daily_logs`. Logy budú výhradne ručné z modulu Výroba. Aj midflight import prestane vytvárať syntetické log riadky.

## Zmena 1 — Odstrániť `autoUpdateProjectPercent` z flow

**`src/lib/autoProjectPercent.ts`** — celý súbor zmazať (alebo ponechať prázdny no-op s deprecation komentárom pre prípadné staré importy).

**`src/components/production/CompletionDialog.tsx`** — odstrániť volanie `autoUpdateProjectPercent(projectId)` v `handleComplete`. Completion bude meniť len `production_schedule.status` a `production_expedice` riadky, **nie** percent v daily logs.

**`src/hooks/useProductionDragDrop.ts`** — odstrániť volania `autoUpdateProjectPercents(...)` v `completeItems` (a kdekoľvek inde — undo/redo handlery tiež).

## Zmena 2 — Midflight import prestane zapisovať daily logs

**`src/lib/midflightImportPlanVyroby.ts`** — odstrániť celý blok ktorý vytvára `production_daily_logs` riadky s `bundle_id = ::MF_${monday}`. Midflight import bude generovať len:
- `production_schedule` (is_midflight=true) — historické bundle
- `production_expedice` (is_midflight=true) — markery
- update `production_inbox.estimated_hours` — ratio konzumácie

Žiadne syntetické % logy. Ak používateľ chce historický progress vidieť, doplní ho ručne vo Výrobe.

## Zmena 3 — UI fallback vo Vyroba.tsx (read-only)

**`src/pages/Vyroba.tsx`** — `getLatestPercent`, `getBundleProgress`, `findPriorChainLog`, `getChainWindow` ostávajú nezmenené v read logike, ale:
- `production_daily_logs` je **jediný** zdroj pravdy pre uložené %.
- Ak v aktuálnom týždni nie je log a v chain (`split_group_id`) existuje predchádzajúci log → zobraziť ho ako fallback (kontinuita pri split bundle).
- Ak nikde v chain nie je log → zobraziť 0% (alebo computed `completedHours/totalHours` len ako sivý hint, **bez** zápisu do DB).

Žiadny kód v aplikácii nesmie volať `saveDailyLog()` mimo explicitného user kliku vo Výrobe.

## Zmena 4 — Audit volaní `saveDailyLog`

Prejsť cez `code--search_files` všetky volania `saveDailyLog`. Povolené ostávajú len:
- `Vyroba.tsx` → `handleSaveLog` (ručný zápis %)
- `Vyroba.tsx` → "Bez výroby" toggle (ručný zápis 0%)

Všetko ostatné odstrániť.

## Dotknuté súbory

- `src/lib/autoProjectPercent.ts` — zmazať / no-op
- `src/components/production/CompletionDialog.tsx` — odstrániť auto write
- `src/hooks/useProductionDragDrop.ts` — odstrániť auto write z `completeItems` + undo/redo
- `src/lib/midflightImportPlanVyroby.ts` — odstrániť `production_daily_logs` insert blok
- `src/pages/Vyroba.tsx` — verifikovať že fallback nezapisuje do DB

## Overenie po nasadení

1. Označiť položku ako Hotovo / Expedice → overiť že v `production_daily_logs` **nepribudol** žiadny riadok.
2. Spustiť midflight import → overiť že tabuľka `production_daily_logs` zostala nezmenená (bez `::MF_` riadkov).
3. Vo Výrobe ručne uložiť denný log → overiť že riadok **vznikol**.
4. Otestovať split bundle scenár: projekt v T-2 má ručný log 60% → split do T-1 → overiť že T-1 zobrazí 60% z chainu (read fallback) bez zápisu do DB.
5. Po ručnom uložení 75% v T-1 overiť že T-1 zobrazí 75% a T-2 zostáva na 60%.

