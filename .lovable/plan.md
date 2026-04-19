

## Potvrdenie logiky splitu Inboxu po Midflight

Áno, presne tak. Po midflight importe sa pre **každý projekt** v Inboxe spraví **jeden bundle split** naprieč **všetkými** jeho pending položkami:

### Ako to bude vyzerať na Z-2515-001
- `hodiny_plan` = 1092 h
- Midflight schedule = 12 týždňov × čiastočné hodiny = 728.8 h (12 splitov, každý označený `1/42` … `12/42`)
- Inbox remainder = 1092 − 728.8 = **363.2 h** rozdelených **proporcionálne k `estimated_czk`** medzi všetkých 30 inbox položiek
- Každá inbox položka označená `13/42`, `14/42`, … `42/42` (poradie podľa `sent_at`)
- Posledná položka (`42/42`) absorbuje zaokrúhľovací zvyšok, aby `Σ inbox + Σ midflight = 1092` presne

### Kľúčové pravidlá
1. **Bundle = celý projekt** (všetkých N midflight týždňov + všetkých M inbox položiek = `split_total = N+M`)
2. **Spoločné `split_group_id`** pre midflight rows aj inbox rows daného projektu (= `firstBundleId` prvej midflight schedule row)
3. **Proporcionálne podľa `estimated_czk`**: `item.hours = floor(remainder × item_czk / total_inbox_czk)`
4. **Posledná položka v poradí `sent_at`** dostane balancing remainder
5. Ak `H_midflight ≥ hodiny_plan` → inbox položky ostanú s 0 h, ale **nezmažú sa** (ostávajú s split markerom)
6. Projekty bez midflight hodín → bez zmeny (žiadne splity v Inboxe)

### Súbor
`src/lib/midflightImportPlanVyroby.ts` — pridať:
- v reset bloku: vyčistiť `split_group_id/split_part/split_total` na pending Inbox položkách
- po inserte midflight bundles per projekt: načítať `hodiny_plan`, dorovnať Inbox proporcionálne, updatnúť `split_total = N+M` aj na midflight rows

### Postup
1. Spustiť **📥 Midflight import** (reset + import + nový dorovnávací krok automaticky)
2. Overiť Z-2515-001: 12 midflight + 30 inbox = 42 splitov, Σ = 1092 h

