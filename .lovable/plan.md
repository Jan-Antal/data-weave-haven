

## Oprava chyby dokončení + QC check workflow v Pláne Výroby

### Problémy
1. **Chyba pri dokončení** (`Invalid status: expedice. Must be scheduled, in_progress, paused, cancelled, or completed`) — `CompletionDialog.tsx` nastavuje status `'expedice'` v `production_schedule`, ale DB trigger `validate_production_schedule_status` túto hodnotu nepovoľuje. Mne (vlastník DB session?) to môže prejsť rôzne podľa cache, ale Michalovi trigger spadne.
2. **Chýba QC gate** — pri dokončení položky v Pláne Výroby sa neoveruje, či má daná položka v module Výroba potvrdený QC check (`production_quality_checks`). Má to byť tvrdá závislosť: bez QC nedá sa „Dokončit → Expedice".

### Diagnostika (pred opravou)
- Pozrieť aktuálne povolené statusy v triggeri `validate_production_schedule_status` (`supabase--read_query` na `pg_proc`).
- Overiť `CompletionDialog.tsx` riadky ~80–160 kde sa volá `.update({ status: "expedice", ... })` pre split aj full mode.
- `useQualityDefects.ts` + tabuľka `production_quality_checks` — odkiaľ čítať QC stav.

### Zmeny

**1. `CompletionDialog.tsx`** — oprava statusu
- Nahradiť `status: "expedice"` za `status: "completed"` v oboch vetvách (full + split intermediate row). Záznam v `production_expedice` (ktorý sa už insertuje) je jediný správny zdroj „je v expedici". Schedule riadok zostáva `completed`.
- Pre split „intermediate completed" časť: rovnako `status: "completed"`, `completed_at = now()`, `completed_by = user.id`. Riadok pôjde priamo do expedice cez existujúci `production_expedice` insert.

**2. QC gate pred dokončením** — nový blok v `CompletionDialog.handleComplete`
- Pred update-om sa pre každý zaškrtnutý item spýtam `production_quality_checks` (`select id, passed where item_id in (...) and project_id = ...`).
- Položka prejde, len ak existuje QC záznam s `passed = true`.
- Ak chýba alebo `passed = false`, zobraziť **inline varovanie** v dialógu (nie toast) so zoznamom položiek bez QC: *„Tieto položky nemajú potvrdený QC check vo Výrobe: T04, T21. Dokončenie nie je možné."* Tlačidlo „Dokončit" disabled, kým sa zoznam nezmení.
- Refresh QC stavu pri otvorení dialógu (React Query `["production-quality-checks", projectId]`).

**3. Drobné UX**
- Pri otváraní `CompletionDialog` načítať QC mapu raz; pri každom toggle checkboxu prepočítať „missing QC" zoznam.
- Pri pokuse zaškrtnúť položku bez QC zobraziť pri riadku malý červený badge `⚠ chýba QC` namiesto blokovania zaškrtnutia (užívateľ vidí dôvod). Submit ostane disabled.

**4. Memory**
- Aktualizovať `mem://features/production-tracking/quality-and-defect-tracking` o pravidlo: **dokončenie položky v Pláne Výroby vyžaduje existujúci `production_quality_checks.passed = true` záznam**.

### Súbory
- `src/components/production/CompletionDialog.tsx` — oprava statusu + QC gate
- `mem://features/production-tracking/quality-and-defect-tracking` — doplniť QC gate pravidlo

### Výsledok
- Michal (a každý iný) môže dokončiť položku bez chyby triggera.
- Ak položka nemá QC potvrdený v module Výroba, dialóg jasne ukáže ktorá položka chýba a `Dokončit → Expedice` ostane neaktívne, kým sa QC nedoplní.

