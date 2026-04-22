

## "Vrátit do TPV" z Week Sila + badge "Vráceno z výroby"

### Cieľ
Aktuálne "Vrátit do TPV" existuje len v Inboxe a v tabuľkovom view — vykonáva **hard delete** bez stopy. Rozšírime ho aj na pravý klik vo **Week Silo** (kanban) a zmeníme správanie na **soft delete**: položka ostane v DB so statusom `returned` a v TPV Liste sa zobrazí oranžový badge `↩ Vráceno z Výroby` s tooltipom (kto, kedy). Pri opätovnom odoslaní do výroby z TPV Listu sa returned záznamy vyčistia (rovnako ako cancelled).

### Zmeny

**1. DB migrácia (schéma + trigger)**
- `production_schedule`: pridať `returned_at timestamptz`, `returned_by uuid`.
- `production_inbox`: pridať `returned_at timestamptz`, `returned_by uuid`.
- Aktualizovať `validate_production_schedule_status` aj `validate_production_inbox_status` — povoliť nový status `'returned'`.

**2. `WeeklySilos.tsx` — `handleItemContextMenu`** (riadky ~709-755, vetva normal active item)
- Pridať akciu `↩ Vrátit do TPV` (za `Vrátit do Inboxu`).
- Skryť pre paused, completed/expedice, cancelled — len pre normálne aktívne položky a tiež pre paused (user musí vrátiť aj pozastavené).
- Akcia: `update production_schedule set status='returned', returned_at=now(), returned_by=auth.uid()` namiesto delete.
- Invalidate: `["production-schedule"]`, `["production-progress"]`, `["production-statuses", projectId]`, `["tpv-items", projectId]`. Toast `↩ Vráceno do TPV`.
- Tiež pridať bundle-level akciu `↩ Vrátit celý projekt do TPV` (analogicky k existujúcej `Vrátit do Inboxu` v `handleBundleContextMenu`).

**3. Existujúce "Vrátit do TPV" v `InboxPanel.tsx` a `PlanVyrobyTableView.tsx`** — zmeniť z `.delete()` na `.update({ status: 'returned', returned_at, returned_by })`. Toast a invalidácia ostávajú.

**4. `useProductionStatuses.ts`** — nový badge type
- Rozšíriť SELECT o `returned_at, returned_by` (inbox aj schedule).
- Pridať `userIds` zo `returned_by` do batched lookup.
- Pridať `RawEntry.type = "returned"` so spracovaním z oboch tabuliek (status `'returned'`).
- Aggregácia: badge `↩ Vráceno z výroby`, farba **oranžová `#ea580c`** (odlíšenie od šedej "pending" a červenej "cancelled"), tooltip `Vráceno z výroby {datum} — {meno}`.
- Umiestnenie v poradí: za pending, pred cancelled.

**5. `TPVList.tsx` — `executeSendToProduction`** (riadky ~395-418)
- Rozšíriť `inboxCheck`/`schedCheck` filter `.in("status", [...])` aby **nezahŕňal `'returned'`** (returned položky musia ísť cez wipe + nový insert, nie skip).
- V "wipe prior cancelled rows" bloku rozšíriť na `["cancelled", "returned"]` — vyčistí oba "soft-deleted" stopy pred novým insertom.

**6. Tooltip v TPV Liste**
- Existujúce wrapping cancelled badge v `Tooltip` automaticky pokryje aj returned (rovnaký rendering cez `s.tooltip`).

**7. Mobile `MobileTPVCardList.tsx`**
- Žiadna zmena potrebná — používa rovnaký `statusMap` a `s.label/s.color/s.tooltip` cez `title` attribute.

**8. Memory**
- Aktualizovať `mem://features/production-planning/cancellation-workflow` → premenovať alebo pridať poznámku o paralele "Vrátit do TPV" = soft delete s oranžovým badgem; re-send wipe pokrýva `cancelled` aj `returned`.

### Súbory
- nová migrácia (DB schéma + 2 triggers)
- `src/components/production/WeeklySilos.tsx` (item + bundle context menu)
- `src/components/production/InboxPanel.tsx` (zmena delete → update)
- `src/components/production/PlanVyrobyTableView.tsx` (zmena delete → update)
- `src/hooks/useProductionStatuses.ts` (returned badge)
- `src/components/TPVList.tsx` (wipe + executeSendToProduction)
- memory update

### Výsledok
1. Pravý klik na položku v Week Sile → `↩ Vrátit do TPV` zmizne zo sila.
2. V TPV Liste sa v stĺpci **Výroba** objaví oranžový badge `↩ Vráceno z výroby` s tooltipom `Vráceno z výroby 22. 4. 2026 — Marek Novák`.
3. Užívateľ môže položku po prepracovaní znova poslať z TPV Listu → returned záznam sa vyčistí, vznikne nový pending v Inboxe → badge sa zmení na `Čeká na plánování`. Zachovaná zásada: jedna TPV položka = jeden aktuálny stav výroby.

