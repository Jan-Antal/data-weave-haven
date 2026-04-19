

## Reálna diagnóza Z-2515-001

Z dát:
- `tpv_items` sumár (Schváleno): 30 položiek, raw CZK = 1 889 968
- `prodejni_cena` = 2 233 699, marža = 0.25, prod_pct = 0.30, hourly = 550
- TPV raw hodiny (Σ floor per item) ≈ **773 h**
- Project hodiny = floor(2 233 699 × 0.75 × 0.30 / 550) = **1 092 h**
- Source = "Project" (project > tpv) → `hodiny_plan = 1092`, `scale_ratio = 1092/773 ≈ 1.413`

**Detail projektu (project_plan_hours)** používa `computePlanHours` ktorý aplikuje scale + remainder na poslednej položke → Σ tpv_items.hodiny_plan = **1092 ✅**

**Inbox položky** ale boli vytvorené pri `sendToProduction` per-item ako raw `floor(cena × pocet × (1−marže) × prod_pct / hourly_rate)` BEZ scale. Súčet = ~773, ale dáta v DB ukazujú **1215** → znamená to, že `recalculateProductionHours` ich už raz zoškáloval per-item cez `rawTotalHours × scaleRatio`, kde každá položka dostane vlastný floor (× 1.413), ale **bez agregovaného remainderu** → zaokrúhľovanie hore akumuluje rozdiel.

Per item: `floor(rawHours × 1.413)` → Σ ≈ 773 × 1.413 = 1092, ale floor(47×1.413)+floor(20×1.413)+... = 1215 (nadhodnocuje).

Counter check: `1215/773 ≈ 1.572` → znamená, že scale ratio v DB sa aplikoval dvakrát alebo z inej raw bázy. V každom prípade súčet **nesedí na 1092**.

## Návrh opravy (správny tento raz)

### Princíp
Pre **každý projekt** (a v budúcnosti per stage, ak má etapy) musí platiť:
```
Σ inbox.estimated_hours (pending) + Σ schedule.scheduled_hours (active) == hodiny_plan
```

To dosiahnem **proporcionálnym rozdelením** s **agregovaným remainderom**, nie per-item floor + scale.

### Algoritmus per projekt v `recalculateProductionHours.ts`

1. Zistiť `hodiny_plan` z `result.hodiny_plan` (computed)
2. Zistiť koľko hodín je už **uzamknutých v schedule** (status `completed` a `in_progress` s vyčerpanou prácou — alebo jednoduchšie: všetky `scheduled/in_progress/completed` rows zachovať s ich hodinami)
3. **Remainder pre inbox** = `hodiny_plan − Σ schedule_hours_active`
4. Inbox položky dostanú podiel z remainderu **proporcionálne k ich `estimated_czk`**:
   ```
   item.estimated_hours = floor(remainder × item.estimated_czk / Σ inbox.estimated_czk)
   ```
5. **Posledná inbox položka** (poradie podľa `sent_at`) dostane zvyšný diel: `remainder − Σ ostatných` (môže byť aj o pár hodín viac/menej kvôli zaokrúhleniu, ale Σ presne sedí)

### Per-stage (ak projekt má etapy ≥2)

V `project_stages` má každá etapa svoju `prodejni_cena` a `marze`. `hodiny_plan` projektu by mal byť Σ etáp. Pre teraz: **stage_id na inbox položkách je v Z-2515-001 `nil`** (nie sú etapy), takže projekt-level rozdelenie stačí. Logiku per-stage pridám len ak `stage_id` je nastavené — vtedy zoskupím inbox položky podľa stage_id a aplikujem rovnaký proporcionálny algoritmus per skupinu so stage-specific `hodiny_plan`.

### Schedule (active) sa nemení
Existujúce `scheduled/in_progress/completed` riadky ostávajú s ich hodinami (môžu reflektovať skutočne odpracovaný stav). Inbox je „zostatok do plánu".

### Edge cases
- Ak `Σ schedule_active >= hodiny_plan` → inbox všetky dostanú 0 (alebo zachovajú estimated_czk pre prípadné rebalansy, ale hours = 0)
- Ak `hodiny_plan = 0` → inbox sa nemenia
- Ak inbox je prázdny → nič
- Ak `Σ inbox.estimated_czk = 0` → rozdeliť rovnomerne

### Multistage handling
Skontrolujem `inbox.stage_id`. Ak všetky položky v projekte majú `stage_id = NULL` → projekt-level rozdelenie. Ak majú `stage_id` → per-stage skupiny so stage-specific hodiny_plan (z `project_stages.prodejni_cena` × analogicky cez `computePlanHours` alebo pomerom prodejní ceny etapy / projekt).

## Súbory na úpravu

- **`src/lib/recalculateProductionHours.ts`** — nahradiť aktuálnu inbox-update logiku (per-item floor × scale_ratio) novým post-processing krokom: po výpočte `result` per projekt agregovať existujúce schedule hodiny a redistribuovať remainder do inbox položiek proporcionálne k ich `estimated_czk`, s remainderom na poslednú položku v poradí podľa `sent_at`.

- **`computePlanHours` zachovať** — používa sa pre `project_plan_hours.hodiny_plan` a tpv_items per-item hours (pre detail projektu / TPV list). Tam je scale + remainder ok lebo TPV položky sú referenčné.

## Postup

1. Implementovať novú post-processing fázu v `recalculateProductionHours`
2. Spustiť „Přepočítat hodiny → Všechny týdny" v UI
3. Overiť: detail Z-2515-001 = 1092, Σ inbox = 1092 − Σ active schedule

## Mimo scope

- Vyčistenie midflight dát + nový midflight beh (riešime potom v ďalšom kroku ako si pôvodne navrhol)

