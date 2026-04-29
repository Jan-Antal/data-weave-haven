
## Diagnóza – Multisport (Z-2607-008)

### Hodiny vôbec nesedia na TPV

**TPV (kanonická dotácia):**
- Schválené položky: **579 h / 670 629 Kč** (celkom 586 h vrátane Zrušených)
- Nemáš tam 561 h ale **579 h cost-side** (resp. ~492 h pri 15% marži z 579, alebo 498 h v cene)

**Aktuálny `production_schedule` (per týždeň):**

| Týždeň | Hod | Kč | Pozn. |
|---|---|---|---|
| T16 (04-13) | 33.9 | 0 | midflight history (1 riadok `Z-2607-008`) |
| T17 (04-20) | 59.9 | 73 149 | 29 položiek |
| T18 (04-27) | 60.8 | 76 214 | 33 položiek |
| T19 (05-04) | 61.2 | 76 218 | 33 položiek |
| **SPOLU** | **215.8** | **225 581** | |

Schválené TPV položky majú napr.:
- AT.01 = 104 h, v pláne na T17/T18/T19 dostáva len 10.8 h každý (= ~32 h spolu)
- AT.07 = 56 h, v pláne 5.8 h × 3 = 17.4 h
- AT.26 = 29 h, **vôbec nie je v pláne**

**Záver:** rozdiel ~250 h chýba, niektoré položky sú v pláne v silne podhodnotených hodnotách, iné chýbajú úplne. Vyzerá to ako pozostatok zlomeného splitu — pri minulej "repair" migrácii sa kanonické totály zle vypočítali (vzal sa MAX miesto SUM, alebo sa poslala do inboxu len časť TPV).

### ⚙ "Upravit rozdělení po týdnech"

Akcia v `WeeklySilos.tsx` riadok 757–774 stále existuje, ale podmienka `weeks.size >= 2` ju zobrazí len ak chain má 2+ týždne. **Pre Multisport (4 týždne) by mala fungovať.**

Reálny problém je inde — v `EditBundleSplitDialog.handleSave()` (riadok 282–297). Po poslednej oprave detekcie duplikátov sa pre túto reťaz `hasDuplicates = false` (rôzne hodnoty po týždňoch), takže použije **SUM** = 215.8 h ako "kanonický total" → pri uložení rozsplitne tých 215.8 h proporčne, čím sa rozdiel voči TPV ešte viac zacementuje.

---

## Plán opravy (3 časti)

### 1. Audit & re-sync Multisport z TPV

Migrácia (data update) ktorá:
1. Zmaže všetky `production_schedule` riadky pre `Z-2607-008` okrem `is_midflight = true` (history T16 ostane).
2. Zmaže všetky `production_inbox` riadky pre `Z-2607-008` so statusom `pending` alebo `scheduled`.
3. Znovu vloží do `production_inbox` všetky **schválené** TPV položky s `hodiny_plan > 0` v **plnej** TPV hodnote (`hodiny_plan` h, `cena` Kč). Ďalej budú normálne preplánované cez UI.

Užívateľ následne v UI vyberie ako rozdeliť do týždňov (môže použiť opravený split dialóg).

### 2. Oprava ⚙ split dialógu — kanonický total = TPV, nie schedule

V `EditBundleSplitDialog.tsx` (handleSave, ~r. 253) zmeniť logiku tak, aby **kanonický total per `item_code` brala z `tpv_items` (`hodiny_plan`, `cena`)**, nie zo súčtu/maxima existujúcich schedule riadkov. Schedule môže byť rozhádzaný — TPV je zdroj pravdy.

Fallback (ak TPV položka neexistuje, napr. ad-hoc): použiť MAX/SUM logiku ako dnes.

UI pridať info riadok: "Kanonický základ z TPV: AT.01 = 104 h / 125 694 Kč" pri každej položke, aby user videl koľko sa rozdeľuje.

### 3. Globálny audit ostatných projektov

Read-only SQL ktorý prejde všetky projekty s `split_group_id` a porovná `SUM(scheduled_hours per item_code) vs tpv_items.hodiny_plan` a vyhodí report do `/mnt/documents/multi_split_audit.csv`. Ty rozhodneš, ktoré projekty (okrem Multisport) chceš rovnako re-syncovať.

---

## Technické detaily

**Súbory na zmenu:**
- `supabase/migrations/...sql` — DELETE staré schedule/inbox pre Z-2607-008 + INSERT z tpv_items do production_inbox
- `src/components/production/EditBundleSplitDialog.tsx` — refactor `handleSave` aby kanonický total bral z TPV (fetch `tpv_items` v dialógu cez supabase pri otvorení)
- `src/components/production/EditBundleSplitDialog.tsx` — UI: zobraziť TPV základ pri každej položke

**SQL audit (krok 3):**
```sql
SELECT ps.project_id, ps.item_code,
       SUM(ps.scheduled_hours) FILTER (WHERE NOT ps.is_midflight) AS sched_hrs,
       ti.hodiny_plan AS tpv_hrs,
       SUM(ps.scheduled_hours) FILTER (WHERE NOT ps.is_midflight) - ti.hodiny_plan AS diff
FROM production_schedule ps
LEFT JOIN tpv_items ti USING (project_id, item_code)
WHERE ps.split_group_id IS NOT NULL AND ti.deleted_at IS NULL
GROUP BY ps.project_id, ps.item_code, ti.hodiny_plan
HAVING ABS(SUM(ps.scheduled_hours) FILTER (WHERE NOT ps.is_midflight) - ti.hodiny_plan) > 1;
```

---

## Otázka pred schválením

Pre Multisport pri re-syncu inboxu z TPV — **chceš** :
- **A)** Plné TPV hodnoty (579 h, "selling" cena 670k Kč) → výroba uvidí brutto čísla
- **B)** TPV s aplikovanou maržou 15% → 492 h / 569k Kč (cost-side, štandard pre výrobu)

Predpokladám **B)** podľa Core memory ("Default margin 15%, cost = price × (1−margin)"). Potvrď, alebo zvoľ A.
