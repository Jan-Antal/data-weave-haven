

# Midflight: Inbox zostatok ako súčasť split skupiny

## Problém
Aktuálne sa vytvárajú split bundles v schedule (T13 1/3, T14 2/3, T15 3/3), ale inbox zostatok nie je súčasťou split skupiny. Správne by to malo byť: T13 = 1/4, T14 = 2/4, T15 = 3/4, a inbox zostatok = 4/4.

## Riešenie
V `src/lib/midflightImportPlanVyroby.ts`, zmeniť logiku tak, že:

1. **`totalParts` = počet hist týždňov + 1** (ak existuje inbox zostatok)
2. **Schedule inserty**: `split_part: i + 1`, `split_total: totalParts` (vrátane inbox časti)
3. **Inbox zostatok**: namiesto len redukcie hodín, aktualizovať aj `split_group_id`, `split_part`, `split_total` na poslednom inbox iteme — aby sa zobrazoval ako `4/4`

### Konkrétne zmeny (riadky 240-300):

```typescript
// Spočítaj či bude inbox zostatok
const totalInboxHours = inboxItems 
  ? inboxItems.reduce((s, i) => s + i.estimated_hours, 0) 
  : 0;
const remainderHours = Math.max(0, totalInboxHours - totalHistHours);
const hasRemainder = remainderHours > 0.05 && inboxItems && inboxItems.length > 0;

// totalParts = hist weeks + 1 (inbox remainder)
const totalParts = sortedWeeks.length + (hasRemainder ? 1 : 0);

const firstBundleId = crypto.randomUUID();

// Schedule inserts for hist weeks (1/4, 2/4, 3/4...)
for (let i = 0; i < sortedWeeks.length; i++) {
  // ... same as now but with updated totalParts
}

// Inbox reduction + mark last remaining item as split N/N
if (inboxItems && inboxItems.length > 0) {
  let remaining = totalHistHours;
  for (const item of inboxItems) {
    if (remaining <= 0) break;
    if (item.estimated_hours <= remaining) {
      remaining -= item.estimated_hours;
      inboxUpdates.push({ id: item.id, status: "scheduled", adhoc_reason: "recon_scheduled" });
    } else {
      // This item becomes the remainder — mark as last split part
      inboxUpdates.push({
        id: item.id,
        estimated_hours: Math.round((item.estimated_hours - remaining) * 10) / 10,
        adhoc_reason: "recon_reduced",
        // NEW: split group fields
        split_group_id: firstBundleId,
        split_part: totalParts,    // e.g. 4/4
        split_total: totalParts,
      });
      remaining = 0;
    }
  }
}
```

4. **Inbox update logic** (riadky ~330-345): rozšíriť update query pre `recon_reduced` items o `split_group_id`, `split_part`, `split_total`

5. **Reset fáza**: pridať revert split fields na inbox items — `split_group_id: null, split_part: null, split_total: null` pre `recon_reduced` items

## Výsledok
- Byt Osadní v Inbox: **4/4** so zvyškovými hodinami
- T13: **1/4** s 19h
- T14: **2/4** s 60h  
- T15: **3/4** s 44h
- Vizuálne všetky bundles patria do jednej split skupiny

## Súbor
| Súbor | Zmena |
|-------|-------|
| `src/lib/midflightImportPlanVyroby.ts` | totalParts +1, inbox remainder split fields, reset revert |

Žiadna DB migrácia — `production_inbox` už má `split_group_id`, `split_part`, `split_total` stĺpce.

