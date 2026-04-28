## Cieľ

Karta "Rezerva kapacit" v Pláne výroby (`WeeklySilos.tsx`, ~r. 1820–1860) je teraz tmavá a agresívna (`#1e2025`, `2px dashed #4b5563`). Treba ju zjemniť do svetlej zelenej palety, **rozloženie zladiť s bežnými bundle kartami** (názov + kód projektu hore, hodiny vpravo, deadline pod nimi) a badge **"⏳ Rezerva"** umiestniť **vľavo dole pod hodiny**.

## Layout (zladený s bežným bundle)

```text
┌──────────────────────────────────────────┐
│ ● Gradus Kampa            Z-2617-001     │   ← názov (zelený) + kód projektu vpravo
│                                  ~83h    │   ← hodiny / cena vpravo
│ ⏳ Rezerva               Exp 15.07.26    │   ← badge vľavo, deadline vpravo
│ TPV: T28                                 │   ← iba ak existuje
└──────────────────────────────────────────┘
```

Štruktúra zodpovedá normálnym bundle (názov projektu + meta vpravo, deadline dole), len badge "⏳ Rezerva" zaberá pozíciu vľavo dole pod hodinami namiesto vedľa nich.

## Vizuálne zmeny — jemná zelená

Light mode:
- background `#f1f7f3` (jemná zelená)
- border `1px dashed #b9d4c2` (namiesto `2px dashed #4b5563`)
- názov projektu: `#223937` (brand Primary Green)
- kód projektu: `#6b8a72` (malý chip vpravo, font-sans)
- hodiny: `#5a7a64` font-bold
- badge "⏳ Rezerva": pozadie `#dcebe1`, text `#3a6b4a`
- deadline: `#6b8a72` (`Exp 15.07.26`)
- TPV: `#8aa893`

Dark mode (`forecastDarkMode`):
- background `rgba(58,107,74,0.10)`
- border `1px dashed rgba(149,193,164,0.35)`
- názov `#b8d4c0`, ostatné texty `#7fa089`

Opacity ~0.95 (jemne zhasnuté oproti aktívnym, ale dobre čitateľné).

## Dáta (už dostupné v scope nad `if (isBlockerBundle)`)

- `bundle.project_id` → kód projektu
- `bundle.project_name` → názov
- `deadlineInfo.label` + `deadlineInfo.dateStr` → deadline (fallback expedice → montáž → předání → smluvní). Ak `null`, riadok sa preskočí.
- `tpvWeekLabel` → ostáva
- `color` → ľavá farebná bodka

## Súbor

- `src/components/production/WeeklySilos.tsx` — upraviť iba blok `if (isBlockerBundle) { return (...) }` (~r. 1820–1861).

## Bez vplyvu

- Žiadna DB zmena, žiadna zmena výpočtu rezervy ani triedenia.
- Context menu handler ostáva nezmenený.
- Rešpektuje brand farby z `mem://style/color-palette`.
