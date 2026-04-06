

# Analýza rozdílu hodin + Module filter ve Formula Builderu

## 1. Root cause: Rozdíl hodin (Analytics vs Project Detail)

Dva úplně odlišné vzorce pro výpočet hodin z marže:

```text
Analytics (computePlanHours):
  náklady = prodejní_cena × (1 - marže)
  = 2 338 572 × (1 - 0.25) × 0.35 / 320 = 1 918h

Project Detail (RozpadCeny):
  náklady = prodejní_cena / (1 + marže/100)
  = 2 338 572 / (1 + 0.25/100) × 0.35 / 320 = 2 551h
```

Navíc RozpadCeny interpretuje marži `0.25` jako `0.25%` místo `25%`, protože ji nedělí — bere `marzeNum` přímo (řádek 79: `marzeNum = marze ?? 15`) a pak dělá `prodejniCena / (1 + marzeNum/100)`.

Takže problém je dvojí:
- **Jiný vzorec**: markup vs margin (`/(1+m)` vs `*(1-m)`)
- **Jiná interpretace marže**: RozpadCeny čeká celé číslo (15, 25), ale z DB dostává desetinné (0.25, 0.15)

### Oprava

Sjednotit RozpadCeny aby používal stejný vzorec jako `computePlanHours`:
- `náklady = prodejníCena * (1 - maržeDecimal)` kde `maržeDecimal` = marže > 1 ? marže/100 : marže
- Hodinová sadzba z `production_settings.hourly_rate` (to už dělá správně)

**Soubor**: `src/components/RozpadCeny.tsx` — řádky 79-89, opravit:
1. Normalizovat marži: `const marzeDecimal = marzeNum > 1 ? marzeNum / 100 : marzeNum`
2. Změnit vzorec: `naklady = prodejniCena * (1 - marzeDecimal)`

---

## 2. Module filter ve Formula Builderu

Přidat ke každému vzorci metadata o tom, ve kterých modulech se používá — uživatel pak může filtrovat podle modulů.

### Data model

Přidat do `PRESETS` konstanty nové pole `modules: string[]`:

```text
scheduled_czk_hist  → ["Plán Výroby"]
scheduled_czk_tpv   → ["Plán Výroby"]
scheduled_hours     → ["Plán Výroby", "Analytics"]
hodiny_plan_projekt → ["Analytics", "Plán Výroby"]
hodiny_plan_tpv     → ["Analytics", "Plán Výroby"]
production_pct      → ["Analytics", "Plán Výroby", "Detail Projektu"]
weekly_goal_pct     → ["Výroba", "Slack Report"]
is_on_track         → ["Výroba", "Slack Report"]
```

### UI

Pod stávající select vzorce přidat řadu filtrovacích chipů (multi-select):
- Chipy: "Všechny", "Plán Výroby", "Analytics", "Výroba", "Detail Projektu", "Slack Report"
- Výchozí: "Všechny" (zobrazí se všechny vzorce)
- Klik na chip toggleuje filtr; klik na "Všechny" resetuje
- Select dropdown zobrazí pouze vzorce odpovídající aktivním modulům
- U každého vzorce v dropdownu zobrazit malé tagy s názvy modulů

**Soubor**: `src/components/settings/FormulaBuilder.tsx`
- Rozšířit `PresetDef` o `modules: string[]`
- Přidat `PRESETS` module data
- Přidat state `activeModules: Set<string>`
- Filtrovat vzorce v select dropdownu
- Renderovat chip řadu nad selectem

