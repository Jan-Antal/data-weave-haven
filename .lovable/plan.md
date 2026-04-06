

# AMI Asistent — upgrade na datový asistent

## Současný stav

- `AmiAssistant.tsx` existuje ale **není nikde renderovaný** (odstraněn z App/Index)
- Edge funkce `ami-assistant` funguje — pouze navigační nápověda (system prompt popisuje UI)
- AI nemá přístup k žádným projektovým datům

## Cíl

Asistent, který umí odpovědět na otázky typu:
- "Jak jsme na tom s projektem Generali?"
- "Které projekty jsou po termínu?"
- "Kolik hodin zbývá na Z-2605?"
- "Kdo je PM na projektu XY?"

## Architektura

```text
Frontend (AmiAssistant.tsx)
  ↓ sends user message
Edge function (ami-assistant)
  ↓ 1. Query DB for context (projects, TPV, schedule, progress)
  ↓ 2. Build rich system prompt with real data
  ↓ 3. Stream AI response back
```

## Změny

### 1. Edge funkce `supabase/functions/ami-assistant/index.ts`

**Nová logika před voláním AI:**

Když přijde chat zpráva (ne feedback), edge funkce:
1. Vytvoří Supabase client (service role)
2. Načte **kontext z DB** — vždy, pro každý dotaz:
   - `projects` (non-deleted): `project_id, project_name, status, pm, konstrukter, datum_smluvni, prodejni_cena, klient, hodiny_tpv, percent_tpv`
   - `production_schedule` agregace: per-project counts by status (scheduled/in_progress/completed/paused)
   - `production_inbox` counts per project
   - `tpv_items` counts per project (non-deleted)
   - `project_plan_hours`: planned hours per project
   - `production_hours_log` via `get_hours_by_project()` RPC: actual hours per project
3. Sestaví **data context block** jako structured text:
   ```
   === PROJEKTOVÁ DATA ===
   Projekt Z-2605-001 "Generali":
   - Status: Výroba, PM: Novák, Konstruktér: Dvořák
   - Smluvní termín: 2026-05-15
   - TPV: 42 položek, 85% pokrytí
   - Výroba: 12 hotovo, 8 naplánováno, 3 pozastaveno
   - Hodiny: plán 320h, skutečnost 210h (66%)
   ...
   ```
4. Přidá tento blok do system promptu

**Aktualizovaný system prompt** — rozšířit o:
- Instrukce k odpovídání na projektové dotazy
- Pokud se ptá na konkrétní projekt, AI najde ho v datech a odpoví
- Pokud se ptá obecně ("co hoří?"), AI vyhodnotí projekty po termínu, pozastavené, s nízkým progress

**Limit dat**: Max 50 aktivních projektů v kontextu (oříznutí na relevantní). Pokud je projektů víc, zahrnout jen aktivní/rozpracované.

### 2. Frontend `src/components/AmiAssistant.tsx`

- Beze změn v logice (streaming funguje)
- Aktualizovat **QUICK_CHIPS** na datové dotazy:
  ```
  "📊 Jak jsme na tom s projekty?"
  "🔥 Které projekty hoří?"  
  "💬 Napsat zprávu adminovi"
  ```

### 3. Rendering — vrátit komponentu do app

- V `src/App.tsx` (nebo `src/pages/Index.tsx`): importovat a renderovat `<AmiAssistant />` globálně (v rámci autentizovaného layoutu)

## Detaily DB dotazů v edge funkci

```typescript
// 1. Projekty
const { data: projects } = await supabase
  .from("projects")
  .select("project_id, project_name, status, pm, konstrukter, datum_smluvni, prodejni_cena, klient, hodiny_tpv, percent_tpv, currency")
  .is("deleted_at", null)
  .eq("is_test", false)
  .limit(50);

// 2. TPV counts
const { data: tpvCounts } = await supabase
  .from("tpv_items")
  .select("project_id")
  .is("deleted_at", null);

// 3. Schedule status counts
const { data: schedule } = await supabase
  .from("production_schedule")
  .select("project_id, status");

// 4. Plan hours
const { data: planHours } = await supabase
  .from("project_plan_hours")
  .select("project_id, hodiny_plan");

// 5. Actual hours
const { data: actualHours } = await supabase
  .rpc("get_hours_by_project");
```

Toto se agreguje do textového kontextu pro AI.

## Soubory k úpravě

1. **`supabase/functions/ami-assistant/index.ts`** — DB dotazy + rozšířený system prompt
2. **`src/components/AmiAssistant.tsx`** — nové quick chips
3. **`src/App.tsx`** — renderovat `<AmiAssistant />` v autentizovaném layoutu

