
Plán: Nahradiť pole "Měsíční kapacita" za "Výchozí marže" v Rozpad ceny nastaveniach

### Kontext
V sekcii Rozpad ceny (CostBreakdownPresetsSection) sú aktuálne dve polia: **Hodinová sazba** a **Měsíční kapacita**. Pole "Měsíční kapacita" sa nikde reálne nepoužíva pre výpočty plánu hodín — namiesto toho chceme tam mať **Výchozí marže (%)**, ktorú bude `computePlanHours` používať ako fallback keď projekt nemá vlastnú maržu (namiesto hardcoded 15%).

### Stav z prerušeného behu
Posledná migrácia + zmeny boli čiastočne spravené (prerušené užívateľom). Diff ukazuje že migrácia `default_margin_pct numeric NOT NULL DEFAULT 15` na `production_settings` bola nahratá, a `useProductionSettings.ts`, `CostBreakdownPresetsSection.tsx`, `computePlanHours.ts` boli upravené. Treba overiť že všetko sedí a doplniť čo chýba.

### Zmeny

**1. DB migrácia** (už hotové podľa diffu):
- `production_settings.default_margin_pct numeric NOT NULL DEFAULT 15` ✅

**2. `src/hooks/useProductionSettings.ts`**:
- Pridať `default_margin_pct: number` do interface
- Povoliť update tohto poľa v mutation

**3. `src/components/CostBreakdownPresetsSection.tsx`**:
- Nahradiť pole "Měsíční kapacita" (h) za "Výchozí marže" (%)
- Label: "Výchozí marže"
- Suffix: "%", step="0.1"
- Bind na `settings.default_margin_pct`, save cez `handleSaveSettings("default_margin_pct", value)`

**4. `src/lib/computePlanHours.ts`**:
- Pridať `defaultMarginPct?: number` do `PlanHoursInput`
- Použiť ho ako fallback namiesto hardcoded `0.15` keď `project.marze` je prázdne/0
- Konverzia: hodnota >1 → /100 (napr. 15 → 0.15)

**5. `src/lib/recalculateProductionHours.ts`**:
- Načítať `default_margin_pct` zo settings a posielať do `computePlanHours` ako `defaultMarginPct`

**6. Volacie miesta `computePlanHours`** (nájsť všetky):
- Skontrolovať či sa volá aj inde mimo recalculate (napr. `useAnalytics`, `RozpadCeny`) a doplniť `defaultMarginPct` zo settings

### Súbory na overenie / úpravu
- `src/hooks/useProductionSettings.ts`
- `src/components/CostBreakdownPresetsSection.tsx`
- `src/lib/computePlanHours.ts`
- `src/lib/recalculateProductionHours.ts`
- ďalšie volacie miesta `computePlanHours` (search)

### Bez zmien
- `monthly_capacity_hours` zostáva v DB (nemažeme — nepoužívané, ale nech zostane pre prípadné budúce použitie)
- Žiadne zmeny v RLS, ani v iných UI sekciách
