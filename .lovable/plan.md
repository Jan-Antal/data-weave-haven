

## Návrh: Proporcionálne škálovanie TPV hodín na project_hours

### Princíp

Namiesto opravovania `production_pct` (Varianta A z minulého kola) urobíme **post-scaling**:

1. Vypočítaj `tpv_hours_raw` = súčet hodín z TPV položiek (per-item floor, ako dnes)
2. Vypočítaj `project_hours` = z `prodejni_cena × (1−marže) × production_pct / hourly_rate`
3. **Vždy** (keď existujú TPV položky aj prodejní cena) škáluj per-item hodiny pomerom `project_hours / tpv_hours_raw`
4. Posledná položka dostane "remainder" (zvyšok do `project_hours`), aby sa eliminovala zaokrúhľovacia odchýlka → súčet sedí presne

### Príklad: Z-2615-002

- `tpv_hours_raw` = 125h (57+25+12+6+5+20)
- `project_hours` = 187h
- ratio = 187/125 = **1.496**
- Per-item: 57→85, 25→37, 12→18, 6→9, 5→7, 20→**31** (remainder, aby súčet = 187)
- **Výsledok**: Inbox súčet = 187h = Project Detail ✅

### Logika výberu plánu (`hodiny_plan`)

| Stav | `hodiny_plan` | Per-item škálovanie |
|---|---|---|
| TPV existuje, project_hours > tpv_hours_raw | `project_hours` | škáluj nahor |
| TPV existuje, project_hours ≤ tpv_hours_raw | `tpv_hours_raw` | bez škálovania |
| Len project price (žiadne TPV) | `project_hours` | — |
| Žiadne | 0 | — |
| `plan_use_project_price = true` | `project_hours` | škáluj nahor |

→ **`hodiny_plan = max(tpv_hours_raw, project_hours)`** v praxi (s výnimkou explicit override).

### Zmeny v súboroch

**1. `src/lib/computePlanHours.ts`**
- Po výpočte `tpv_hours_raw` a `project_hours` pridať blok: ak `project_hours > tpv_hours_raw && tpv_hours_raw > 0`, prejsť cez `item_hours[]` a vynásobiť každú položku `ratio = project_hours / tpv_hours_raw` (Math.floor), posledná položka = `project_hours − súčet predošlých` (remainder)
- `hodiny_plan = source === "TPV" ? max(tpv_hours, project_hours) : ...`
- Pridať nové pole do `PlanHoursResult`: `scale_ratio: number` (na audit)

**2. `src/lib/recalculateProductionHours.ts`**
- V cykle ktorý prepočítava `production_inbox.estimated_hours` a `production_schedule.scheduled_hours` per `item_code`: použiť **rovnaký škálovací pomer** ako v `computePlanHours` (vrátiť `scale_ratio` z `result` a aplikovať `correctHours = floor(rawItemHours × scale_ratio)`)
- Pre split rows zachovať proporciu v rámci split groupy (už funguje)
- Posledná položka v projekte = remainder, aby súčet = `project_hours`

**3. `src/lib/formulaEngine.ts` + `FORMULA_DEFAULTS`**
- Pridať voliteľný vzorec `tpv_scale_ratio` s defaultom `project_hours / tpv_hours_raw` (pre transparentnosť v Formula Builderi, nemusí byť okamžite editovateľný)

**4. `src/components/RozpadCeny.tsx` / `ProjectDetailDialog.tsx`** (drobné UI)
- Pri zobrazení "Hodiny plán" pridať tooltip: "Z prodejní ceny: 187h • TPV súčet (raw): 125h • Škálovanie: ×1.50"

### Edge cases

- **`tpv_hours_raw = 0`** ale TPV položky existujú (cena=0) → ratio nedefinované → použiť `project_hours` ako celok bez škálovania (per-item ostáva 0; alebo distribuovať rovnomerne — preferujem ostáva 0, project_hours sa berie ako "blocker"-style)
- **`project_hours = 0`** (chýba prodejní cena) → použiť `tpv_hours_raw` bez škálovania
- **`plan_use_project_price = true`** + TPV existuje → škáluj rovnako (nahor)
- **`warning_low_tpv`** prah 60 % zostáva pre badge varovania v UI, ale **už neovplyvňuje výpočet** (logiku nahrádza max())
- **Zaokrúhľovanie**: Math.floor v cykle + posledná položka = remainder zaručí presný súčet

### Migrácia

Po nasadení spustiť `recalculateProductionHours("all", undefined, true)` → prepočíta všetky existujúce inbox + schedule riadky podľa novej logiky.

### Vplyv

- Inbox súčet = `hodiny_plan` v Project Detail (vždy)
- Žiadne "stratené" hodiny medzi TPV cenou a prodejní cenou
- Položky s nižšou cenou v TPV dostanú proporcionálne viac hodín → zodpovedajú reálnemu nákladu vrátane Montáže/Dopravy

