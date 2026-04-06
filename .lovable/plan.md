

# Vylepšení project-summary: lepší tempo + enriched data

Přepočet hodin se řeší systémově mimo asistenta — tady jen vylepšíme data a prompt.

## Změny

### 1. Lepší tempo — z reálné práce, ne z plánu

Aktuálně: `tempo = actual_hours / weeks_from_earliest_scheduled_week` — nepřesné.

Oprava: Použít `min_datum` z `get_hours_by_project()` RPC (která už vrací `min_datum`) jako začátek reálné práce. Pokud `min_datum` neexistuje (0h odpracováno), tempo se nepočítá.

### 2. Enriched data pro AI

Do project data bloku přidat:
- `first_work_date` — z RPC `min_datum`
- `schedule_total_hours` — součet `scheduled_hours` ze schedule
- `schedule_completed_hours` — součet hodin dokončených položek
- Poznámku pokud schedule pokrývá jen část TPV

### 3. Prompt vylepšení

- Tempo počítej od `first_work_date`, ne od plánování
- Pokud velká část TPV ještě není naplánovaná, zmiň to
- Pokud `schedule_total_hours` je výrazně menší než `plan_hours`, upozorni že výroba pokrývá jen část
- Přidat pravidlo: "Nepoužívej lineární projekci pokud projekt běží méně než 4 týdny"

## Soubor

**`supabase/functions/project-summary/index.ts`** — úprava `buildProjectData` + SYSTEM_PROMPT

