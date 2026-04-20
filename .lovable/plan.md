

## Rozsah

Implementujem len **bod A** z predošlého plánu — fallback Inbox hodín z ceny projektu pre "siroty" (inbox položky bez TPV matchu a bez `adhoc_reason`). Manuálnu editáciu (bod B) odkladáme.

## Zmeny

### `src/lib/recalculateProductionHours.ts`

V sekcii inbox prepočtu (~r. 290–340), kde aktuálne `if (!tpv) continue;` preskočí siroty:

1. Najprv identifikovať siroty pre projekt: `inboxItems.filter(i => !tpvItems.find(t => t.item_code === i.item_code) && !i.adhoc_reason)`.
2. Vypočítať `assignedHours` = súčet hodín všetkých TPV-mapovaných inbox + schedule položiek (z `result.itemBreakdown`).
3. `consumedTotal` = už počítané (log + midflight).
4. `remainingProjectHours = max(0, result.hodiny_plan − assignedHours − consumedTotal)`.
5. Distribuovať rovnomerne: každá sirota dostane `remainingProjectHours / orphanCount` hodín a `× hourlyRate` CZK.
6. Pridať update do batch poľa `inboxUpdates` (rovnakým mechanizmom ako TPV-mapované položky).

Ad-hoc položky s `adhoc_reason` (oprava/dodatecna/jine) ostávajú **nedotknuté**.

### Cleanup pre Z-2604-004 a Z-2601-004

Po nasadení spustiť `recalculateProductionHours` len pre tieto dva projekty (cez SQL migráciu volajúcu RPC, alebo priamo SQL UPDATE):

```sql
UPDATE production_inbox
SET estimated_hours = 4, estimated_czk = 2200
WHERE project_id IN ('Z-2604-004', 'Z-2601-004')
  AND status = 'pending'
  AND adhoc_reason IS NULL;
```

(4h vychádza z `project_plan_hours.hodiny_plan = 4` pre oba projekty — žiadne TPV položky, žiadny consumed log → celý plán pripadne sirote T01.)

## Dotknuté súbory

- `src/lib/recalculateProductionHours.ts` — fallback logika v inbox sekcii.
- Migrácia: jednorazový SQL UPDATE pre Z-2604-004 a Z-2601-004.

## Výsledok

- **Z-2604-004 / Z-2601-004**: po cleanupe inbox T01 zobrazí 4h / 2200 Kč.
- **Budúce siroty**: pri každom recalcu automaticky dostanú hodiny z `project_plan_hours.hodiny_plan` proporcionálne k počtu sirôt.
- **Manuálna editácia hodín** sa rieši v samostatnej iterácii.

