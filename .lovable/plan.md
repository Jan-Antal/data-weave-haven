

## Problem
- DB constraint `production_schedule_item_week_unique (project_id, item_code, scheduled_week)` exists ✅
- BUT `production_inbox` má **žiadnu unikátnu väzbu** → tam vznikli duplicity
- Projekt Z-2615-002 má 6 položiek 2× v inboxe (sent 2026-03-21 a znova 2026-04-13)
- Pri drag celého bundlu sa pokúsi vložiť obe položky s rovnakým `item_code` do toho istého týždňa → unique violation v `production_schedule`
- Súčasná TPVList "Odoslať do výroby" už dedupe kontrolu má, ale duplicity sú staršieho dáta (alebo z `ExpedicePanel` `returnFromExpedice` ktorý insertuje bez kontroly)

## Riešenie

### 1. DB migrácia — partial unique index na `production_inbox`
```sql
CREATE UNIQUE INDEX production_inbox_pending_unique
  ON production_inbox (project_id, item_code)
  WHERE status = 'pending' AND item_code IS NOT NULL;
```
Zaručí na úrovni DB že tá istá položka nemôže byť 2× v "pending" inboxe.

### 2. Vyčistenie existujúcich duplicít
Pre 6 položiek v Z-2615-002 nechať novšiu (2026-04-13, lebo to je čerstvá verzia po midflight) a staršiu zmazať. Robí sa raz cez migráciu.

### 3. Defenzívne dedupe v `ExpedicePanel.returnFromExpedice`
Pred insert do `production_inbox` pridať `.maybeSingle()` check na existujúci pending row (rovnaký vzorec ako v TPVList) — ak existuje, len update na pending namiesto insert.

### 4. Lepšia error handling pri bundle drag (`moveInboxProjectToWeek`)
Keď insert do `production_schedule` zlyhá kvôli `production_schedule_item_week_unique`, namiesto generického "duplicate key" toast ukázať jasnú správu:
> "Položka {item_code} už existuje v T{X}. Zmaž duplicitu v Inboxe alebo TPV."

A vypísať konkrétne kódy ktoré kolidovali.

## Súbory
- `supabase/migrations/<new>.sql` — partial unique index + DELETE existujúcich duplicít
- `src/components/production/ExpedicePanel.tsx` — dedupe check pred inbox insert
- `src/hooks/useProductionDragDrop.ts` — friendlier error v `moveInboxProjectToWeek`

## Mimo scope
- Midflight import už dedupe rieši (mažeme legacy a vkladáme čerstvo)
- `AddItemPopover` — to je manuálne pridanie ad-hoc, môže potrebovať vlastný kód, dedupe by ale obmedzilo legitímne ad-hoc; necháme tak (ad-hoc nemá `item_code`)

