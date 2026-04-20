

## Diagnóza Z-2617-001 (potvrdená z DB + kódu)

**TPV položky T.01–T.06 (Schváleno → v Inboxe):**
| Kód | Pocet | Cena | TPV.hodiny_plan | Inbox.estimated_hours |
|-----|-------|------|-----------------|----------------------|
| T.01 | 25 | 6,559 | **62 h** | **7 h** |
| T.02 | 13 | 10,017 | **49 h** | **5.6 h** |
| T.03 | 12 | 8,095 | **36 h** | **4.1 h** |
| T.04 | 22 | 14,967 | **124 h** | **14 h** |
| T.05 | 14 | 12,772 | **67 h** | **7.6 h** |
| T.06 | 1 | 22,663 | **8 h** | **1 h** |
| **Σ** | | | **346 h** | **39.3 h** ❌ |

**Príčina (v `recalculateProductionHours.ts` riadky 309–337 a v Midflight `lines 371–382`):**

Inbox dostane iba „pomerný podiel" zo zvyšku `hodiny_plan`:
```
inboxShare = planRemainder × (inboxCzk / (inboxCzk + pendingTpvCzk))
           = 1136 × (92k / (92k + ~2,7M)) ≈ 37 h
```

`pendingTpvCzk` zahŕňa aj všetky TPV položky T.07+, TK.*, TO.*, T.30+ ktoré ešte ani nie sú schválené (status `Zpracovává se`, `Připomínky k zapracování`, `Připraveno ke zpracování`). Tým si „nárokujú" obrovský podiel hodín z `hodiny_plan = 1214` a Inbox je „podseknutý" na zlomok.

**Pritom správna pracnosť T.01–T.06 je už spočítaná v `tpv_items.hodiny_plan` (346 h)** — `computePlanHours` ju počíta korektne z `cena × pocet` cez maržový vzorec, ale Inboxu sa neprenáša.

## Cieľ opravy

Inbox `estimated_hours` má reflektovať **skutočnú pracnosť danej TPV položky** (`tpv.hodiny_plan` resp. odvodené z `cena × pocet`), nie pomerný podiel zo zvyšku plánu.

## Plán

### 1. `src/lib/recalculateProductionHours.ts` (kľúčová zmena)
Pre **inbox položky s `item_code` napárovaným na TPV** (a bez `split_group_id`):
- `estimated_hours` = `tpv.hodiny_plan` (priamo z `tpv_items` — už obsahuje `pocet`)
- `estimated_czk` = `tpv.cena × tpv.pocet` (cez `scheduled_czk_tpv` formulu) 

Pre chained inbox položky (`split_group_id` existuje → split bundle): rozdeliť `tpv.hodiny_plan` proporcionálne podľa počtu častí v chaine pre daný `item_code` (napr. 2/2 → polovica). Helper `splitChainHelpers` už vie spočítať počet aktívnych častí per item_code.

Pre inbox položky bez TPV párovania (ad-hoc): ponechať existujúce `estimated_hours`/`estimated_czk` (ručne nastavené pri vytvorení).

**Odstrániť** logiku „proportional remainder distribution" (riadky 309–365) — nahradiť priamym použitím `tpv.hodiny_plan`. Suma cez všetky inboxy + schedule sa môže líšiť od `hodiny_plan`, čo je správne — `hodiny_plan` projektu je strop, nie striktné rozdelenie cez aktuálne schválené položky.

### 2. `src/lib/midflightImportPlanVyroby.ts` (riadky 279–438)
Rovnaká logika v reconciliation:
- Pre každú novú/existujúcu inbox položku: `estimated_hours` = `tpv.hodiny_plan`, `estimated_czk` = `cena × pocet`.
- Odstrániť výpočet `inboxShare`/`inboxRemainder` cez `pendingTpvCzk`.
- Midflight historické bundles ostávajú nedotknuté (`is_midflight=true`, hodiny zo `production_hours_log`).
- Renumber chain ostáva (per-item logika z minulého kroku).

### 3. Validácia po nasadení
Užívateľ klikne **„Prepočítať hodiny"** → over Z-2617-001:
- T.01 → 62 h ✓
- T.02 → 49 h ✓
- T.03 → 36 h ✓
- T.04 → 124 h ✓
- T.05 → 67 h ✓
- T.06 → 8 h ✓
- **Σ Inbox = 346 h** (namiesto 39.3 h)
- Historické midflight 4 týždne (77.8 h) ostávajú samostatne v silos.
- 346 + 77.8 = 423.8 h vs `hodiny_plan` 1214 h → zvyšok (~790 h) ostáva „rezervovaný" v zvyšných TPV položkách, ktoré ešte nie sú schválené. Toto je **správne** správanie.

## Dotknuté súbory
- `src/lib/recalculateProductionHours.ts`
- `src/lib/midflightImportPlanVyroby.ts`

## Princíp do budúcna
**Inbox položka = priame zrkadlo TPV položky** (hodiny aj CZK). Žiadne pomerné prerozdeľovanie zo zvyšku plánu. `hodiny_plan` projektu zostáva ako horný strop pre celkový plán, ale nie ako striktný delič medzi aktuálne schválené položky.

