

## Plán: Midflight split — opravit aplikaci na celý balík položek inboxu

### Problém
Při midflight importu se split (rozdělení historických hodin do více týdnů) aplikuje pouze na **první položku** v inbox balíku daného projektu místo na **všechny položky** projektu.

### Analýza
Potřebuji ověřit logiku v `src/lib/midflightImportPlanVyroby.ts`, kde se splity tvoří. Pravděpodobně je tam smyčka, která se ukončí po první položce, nebo se split_group_id přiřadí jen jedné položce.

### Plán implementace
1. **Přečíst `src/lib/midflightImportPlanVyroby.ts`** — najít část, která tvoří split bundles a přiřazuje je k inbox položkám
2. **Opravit iteraci** — zajistit, že se split aplikuje na **všechny inbox položky daného projektu**, nikoliv jen na první. Každá položka projektu by měla dostat odpovídající split_group_id, split_part, split_total a proporcionálně rozdělené hodiny napříč týdny.
3. **Ověřit aktualizaci `production_inbox`** — všechny položky projektu musí mít aktualizované `estimated_hours` (snížené o historicky odpracované hodiny), ne jen první.
4. **Otestovat** s reálným midflight importem.

### Soubor k úpravě
- `src/lib/midflightImportPlanVyroby.ts` — oprava smyčky / aplikace splitu na celý balík inbox položek projektu

### Co se NEMĚNÍ
- DB schéma
- Vizuální zobrazení splitů (už funguje správně)
- Logika výpočtu hodin per projekt/týden

