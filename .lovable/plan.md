

# Midflight: Reconciliation inbox projektů s historickými hodinami

## Problém
Projekty v inbox-u (pending) nemají propojení s reálnými hodinami z Alvena. Midflight vytváří HIST_ záznamy, ale neredukuje inbox o již odpracované hodiny.

## Důležité technické omezení
- `scheduled_week` je typ `date` (pondělí, formát `YYYY-MM-DD`), **ne** string `2026-T14`
- Status trigger povoluje pouze `scheduled | in_progress | paused | cancelled` — nelze použít `"historical"`
- Řešení: použijeme existující `status: "scheduled"` + `is_midflight: true` + item_code prefix `HIST_` (stejně jako stávající HIST_ bundles)

## Řešení
Po existujícím HIST_ insertu přidat **reconciliation krok** pro inbox projekty:

### 1. DB migrace
- Přidat sloupec `is_historical boolean DEFAULT false` na `production_schedule` (pro explicitní rozlišení reconciliation záznamů od běžných HIST_ midflight)

### 2. Logika v `midflightImportPlanVyroby.ts` (nový blok za HIST_ insert)

**Krok A**: Identifikovat inbox projekty — projekty s pending items v `production_inbox`

**Krok B**: Pro každý inbox projekt, z již načtených `allHours` (filtr: `normalizedId` odpovídá `project_id`):
- Seskupit hodiny dle ISO týdne (getMondayOfWeek z `datum_sync`)
- Pro každý týden s hodinami vytvořit `production_schedule` řádek:
  - `item_code: "HIST_RECON_YYYYMMDD"` 
  - `item_name: "Hist. výroba – [project_name]"`
  - `scheduled_week: monday` (date)
  - `scheduled_hours: SUM(hodiny)` zaokrouhleno na 0.1
  - `status: "scheduled"`, `is_midflight: true`, `is_historical: true`

**Krok C**: Spočítat `totalHistHours` pro daný projekt. Iterovat inbox items (ordered by `sent_at` ASC):
- Plně pokryté → `status = "scheduled"` 
- Částečně pokryté → `estimated_hours = zbytek`
- Nedotčené → ponechat

**Krok D**: Reset — na začátku smazat `production_schedule WHERE is_historical = true` (v rámci stávajícího hard resetu)

### 3. Interakce s existujícím kódem
- Stávající HIST_ flow (pro všechny projekty) zůstává beze změny
- Reconciliation HIST_RECON_ se vytváří **navíc** pouze pro inbox projekty
- Pozor na duplicity: reconciliation záznamy mají jiný prefix (`HIST_RECON_`) než běžné (`HIST_`)

## Soubory

| Soubor | Změna |
|--------|-------|
| Migrace | `ALTER TABLE production_schedule ADD COLUMN is_historical boolean DEFAULT false` |
| `src/lib/midflightImportPlanVyroby.ts` | Reset: smazat `is_historical = true`; nový blok: reconciliation inbox projektů |

## Data příklad (Z-2605-001 Insia)
- Inbox: 8 items, 624h
- Hist hodiny: 22.64h
- → Vytvoří HIST_RECON_ záznamy dle týdnů, odečte 22.64h z inbox items (první items budou marked scheduled, poslední zůstane s redukovanými hodinami)

