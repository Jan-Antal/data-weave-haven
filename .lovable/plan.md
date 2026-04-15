

# Midflight: "Manuálny split" prístup namiesto HIST_ bundles

## Aktuálny problém
Terajší midflight vytvára separátne `HIST_` záznamy v schedule + redukuje inbox. To vyzerá neprehľadne — v jednom týždni vidíš aj HIST_ bundle aj inbox items pre ten istý projekt.

## Nový prístup — "ako keby si to naplánoval ručne"
Namiesto vytvárania umelých HIST_ záznamov, midflight **vezme existujúce inbox items** a rozdelí ich na split bundles podľa skutočných hodín z Alvena:

### Logika pre každý inbox projekt s historickými hodinami:

1. **Zoskupiť hist hodiny podľa týždňov** (z `production_hours_log`, rovnako ako teraz)

2. **Pre každý týždeň s hodinami**: vytvoriť riadok v `production_schedule` s:
   - `project_id`, `item_code` = pôvodný inbox item_code (prvý pending item)
   - `item_name` = pôvodný názov z inbox itemu
   - `scheduled_week` = pondelok daného týždňa
   - `scheduled_hours` = SUM hodín z Alvena pre ten týždeň
   - `status: "scheduled"`, `is_midflight: true`
   - `completed_at` = nastavený (bundle je "hotový")
   - `split_group_id` = spoločné UUID pre celý split

3. **Zvyšok hodín zostane v inbox-e** — inbox items sa zredukujú rovnako ako teraz (adhoc_reason markery pre rollback)

4. **Daily log s 100%** — pre každý vytvorený bundle vložiť `production_daily_logs` záznam s `percent: 100`, `phase: "Expedice"`, `day_index: 4` (piatok)
   - `bundle_id` formát: `"projectId::weekMonday"`

### Čo sa zmení oproti teraz:

| Pred | Po |
|------|-----|
| HIST_ bundles (umelé, Legacy badge) | Split bundles z inbox items (reálne, dokončené) |
| Inbox items redukované/scheduled | Rovnako — zvyšok zostáva v inbox-e |
| Žiadne daily logy | 100% daily log pre každý hist bundle |
| `is_historical` flag | Netreba — bundles sú normálne midflight splits |

### Reset fáza
- Stávajúci reset už maže `is_midflight = true` a revertuje adhoc_reason markery
- Pridať: mazanie daily logov kde `bundle_id LIKE '%::HIST'` alebo pre midflight schedule IDs
- HIST_ cleanup zostáva (fallback)

## Súbory

| Súbor | Zmena |
|-------|-------|
| `src/lib/midflightImportPlanVyroby.ts` | Nahradiť HIST_ insert blok novým split-bundle prístupom; pridať daily log inserty; reset: mazať daily logy |

Žiadna DB migrácia nie je potrebná — používame existujúce stĺpce (`completed_at`, `split_group_id`, `is_midflight`, `production_daily_logs`).

