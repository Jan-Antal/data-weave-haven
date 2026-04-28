## Problém

V `useProductionInbox.ts` funkcia `useBlockerAutoReduce` momentálne:

1. **Maže** Rezerva (blocker) riadky zo `production_schedule` keď sa v inboxe objavia nové reálne položky pre ten istý projekt — preto Gradus Kampa **zmizne po refreshi**.
2. Reálne položky pritom ostanú v inboxe (status `pending`) namiesto toho aby sa naplánovali do **toho istého týždňa, kde bola rezerva**.

To je presný opak požadovaného správania. Rezerva má v skutočnosti reprezentovať **rezervovaný slot v konkrétnom týždni**, ktorý sa má pri príchode reálnych položiek **naplniť** (nie zmazať).

## Riešenie

Prepísať `useBlockerAutoReduce` tak, že namiesto mazania rezervy **automaticky presunie nové inbox položky do týždňa rezervy**:

### Nová logika (per projekt s rezervou):

1. Pre každý nový inbox projekt nájdi jeho aktívne blocker riadky v `production_schedule` (zoradené podľa `scheduled_week ASC`).
2. Vezmi inbox položky tohto projektu (status `pending`) zoradené podľa `sent_at ASC`.
3. Postupne ich plánuj do **najskoršieho** blocker týždňa, kým nevyčerpáš jeho hodiny:
   - Pre každú položku INSERT-ni nový riadok do `production_schedule` so `scheduled_week` = blocker.scheduled_week, `is_blocker = false`, `bundle_label` = label rezervy (ak existuje) inak nový label cez `getNextBundleLabel`, ostatné polia z inbox itemu (item_name, item_code, stage_id, scheduled_hours = estimated_hours, atď.).
   - Inbox položku UPDATE-ni na `status = 'scheduled'`.
   - Odpočítaj `estimated_hours` od zostatku rezervy.
4. Keď zostatok rezervy klesne na 0 alebo menej:
   - DELETE-ni vyčerpaný blocker riadok.
   - Pokračuj v plnení ďalšieho blocker riadku (ďalší týždeň).
5. Keď ostávajúce inbox položky presahujú celkovú rezervu:
   - Zvyšok ostane v inboxe ako `pending` (používateľ ich môže manuálne naplánovať).
6. Keď zostatok rezervy v týždni > 0 ale ďalšia položka by ho prekročila:
   - **Zmenšiť** rezervu o zaplánované hodiny (UPDATE `scheduled_hours`) — rezerva ostane viditeľná ako "zostatok hodín na projekt".

### Toast oznámenia

- `{projectName}: 5 položek naplánováno do rezervy (T28)` — pri úspešnom presune.
- `{projectName}: Rezerva naplnena reálnymi položkami` — keď sa všetky blocker riadky vyčerpali.

### Súbor

- `src/hooks/useProductionInbox.ts` — prepísať len telo `useBlockerAutoReduce` (~r. 94–172). Žiadne DB schema zmeny.

### Bez vplyvu

- Forecast generátor rezerv (`useForecastMode.ts`) ostáva nezmenený.
- Vizuál karty Rezerva v `WeeklySilos.tsx` ostáva nezmenený — bude sa len správne updatovať počet hodín alebo zmizne keď sa naplní.
- Manuálne drag-and-drop z inboxu do týždňov funguje nezmenene.

## Tech detaily

```typescript
// pseudo
for (const project of newInboxProjects) {
  const blockers = await fetchActiveBlockersForProject(project_id); // ASC by week
  const inboxItems = await fetchPendingInboxItems(project_id);      // ASC by sent_at
  
  let bIdx = 0;
  let remaining = blockers[0]?.scheduled_hours ?? 0;
  const inserts = [], inboxUpdates = [], blockerUpdates = [], blockerDeletes = [];
  
  for (const item of inboxItems) {
    while (bIdx < blockers.length && remaining <= 0) {
      blockerDeletes.push(blockers[bIdx].id);
      bIdx++;
      remaining = blockers[bIdx]?.scheduled_hours ?? 0;
    }
    if (bIdx >= blockers.length) break; // no more reserve
    
    inserts.push({ ...itemAsScheduleRow, scheduled_week: blockers[bIdx].scheduled_week, bundle_label, is_blocker: false });
    inboxUpdates.push(item.id);
    remaining -= item.estimated_hours;
  }
  
  // Save final remainder on current blocker
  if (bIdx < blockers.length) {
    if (remaining <= 0) blockerDeletes.push(blockers[bIdx].id);
    else blockerUpdates.push({ id: blockers[bIdx].id, hours: remaining });
  }
}
```
