

## Záznam zrušených položiek + zobrazenie v TPV Liste

### Cieľ
Pri zrušení položky v Pláne Výroby sa **nezmaže**, ale označí ako `cancelled` s uloženým dôvodom, dátumom a autorom. V TPV Liste v stĺpci **Výroba** sa zobrazí **červený** badge `✕ Zrušeno · {dôvod}` s tooltipom (dôvod + dátum + kto). Pri opätovnom poslaní do výroby cez TPV List sa zrušený záznam **prepíše/odstráni** a vznikne nový inbox záznam → bez duplicít, jedna TPV položka = jeden aktuálny stav výroby.

### Zmeny

**1. DB migrácia (schéma)**
- `production_schedule`: pridať `cancelled_at timestamptz`, `cancelled_by uuid` (`cancel_reason` už existuje).
- `production_inbox`: pridať `cancel_reason text`, `cancelled_at timestamptz`, `cancelled_by uuid`.
- Aktualizovať trigger `validate_production_inbox_status` aby povolil status `'cancelled'` (schedule trigger už `cancelled` povoľuje).

**2. `CancelItemDialog.tsx`** (`src/components/production/CancelItemDialog.tsx`)
- Namiesto `.delete()` použiť `.update({ status: 'cancelled', cancel_reason, cancelled_at, cancelled_by })` pre obe tabuľky (`production_schedule` aj `production_inbox`).
- Pri `cancelAll` aktualizovať všetky riadky split-group rovnakým spôsobom.
- Po zrušení **netreba renumberovať siblings** (riadky zostávajú, len `cancelled`).
- Toast a `data_log` zápis ostávajú.

**3. „Pošli do výroby" workflow v `TPVList.tsx`** (`executeSendToProduction`, riadky ~440)
- Pred `INSERT` do `production_inbox` najprv **delete-nutie** všetkých `cancelled` riadkov pre dané `(project_id, item_code)` z `production_inbox` aj `production_schedule` — tým sa stará zrušená stopa vyčistí a vznikne čistý nový záznam.
- Tým je zaručené pravidlo: jedna TPV položka = jeden aktuálny stav výroby.

**4. `useProductionStatuses.ts`** (`src/hooks/useProductionStatuses.ts`)
- Rozšíriť SELECT o `cancel_reason, cancelled_at, cancelled_by` (schedule aj inbox).
- Načítať `cancelled` aj z **inbox** vetvy (teraz inbox číta len `pending`).
- Pridať do `ProductionStatus` voliteľné pole `tooltip?: string` so znením `Zrušeno {datum} — {meno} · {dôvod}` (meno z `profiles` cez batched lookup, alebo email z `data_log`).
- Zmeniť farbu pre `cancelled` zo súčasnej šedej `#6b7280` na **červenú `#dc2626`**.

**5. `TPVList.tsx` — stĺpec „vyroba_status"** (riadky ~961–1005)
- Zachovať existujúce prečiarknutie + nové červené pozadie/border.
- Obaliť badge do `Tooltip` (`@/components/ui/tooltip`) zobrazujúceho `s.tooltip`.
- Excel export (`getCellValue` ~670) ostáva nezmenený — `s.label` už dôvod obsahuje.

**6. `MobileTPVCardList.tsx`**
- Rovnaká červená farba; tooltip nahradiť `title` atribútom (mobile fallback).

**7. Memory**
- Pridať `mem://features/production-planning/cancellation-workflow` s pravidlom: cancel = soft, červený badge v TPV, re-send → wipe cancelled rows.

### Výsledok pre používateľa
1. **Zruším položku** v Pláne Výroby (pravý klik → Zrušit, vyberiem dôvod) → zmizne zo sila/inboxu, ostane v DB ako `cancelled`.
2. **V TPV Liste** sa v stĺpci Výroba objaví červený prečiarknutý badge `✕ Zrušeno · Zrušeno klientem`. Hover ukáže `Zrušeno 22. 4. 2026 — Marek Novák · Zrušeno klientem`.
3. **Opätovné poslanie do výroby** z TPV Listu → cancelled riadky sa vyčistia, vznikne nový inbox záznam → badge sa zmení na `Čeká na plánování`. Žiadne duplicity.

