## Diagnóza — 4 bundles s rozdvojenými plánovanými hodnotami

| # | Projekt | split_group_id | Plánované týždne | Item codes | Bloated → Canonical |
|---|---|---|---|---|---|
| 1 | **Allianz 5.p** (Z-2617-001) | c722ec3f… | T17 + T18 | T.01–T.06 (6 ks) | 323.6h / 862 984 → **161.8h / 431 492** |
| 2 | **RD Skalice** (Z-2604-002) | 6e4c7c2e… | T18 + T19 | T.02, T.03 | 106.6h / 304 840 → **53.3h / 152 420** |
| 3 | **Allianz 5.p** | d4beee3c… | T18 + T19 | T.07, T.08 | 72.0h / 194 726 → **36.0h / 97 363** |
| 4 | **Multisport** (Z-2607-008) | a5804482… | T17 + T18 + T19 (33 item_codes) | AT.01–AT.32, OB.01–03 | 7.2h / 12 248 → **3.6h / 6 124** + nerovnomerné T17 |

História (midflight, is_midflight=true) je vo všetkých prípadoch **agregovaná per týždeň** s **hodnotou Kč už nastavenou** (alebo 0, podľa pôvodu). **Necháva sa nedotknutá.**

Multisport (#4) má T17 s len 29 item_codes, T18+T19 s 33 → T17 je **už neúplný plán**, nie čistý duplikát. Potrebuje špeciálne ošetrenie.

## Plán riešenia

### KROK A — Repair migrácia pre všetky 4 bundles (jednorazová)

**Algoritmus per bundle:**

1. `canonical_per_item` = MAX(scheduled_hours, scheduled_czk) per item_code naprieč všetkými plánovanými (non-midflight) týždňami.
2. `planned_weeks` = zoznam týždňov, kde sa item_code vyskytuje (zachová sa pôvodný počet týždňov).
3. Pre každý item_code: rozdeliť canonical **rovnomerne** medzi jeho `planned_weeks` (½, ⅓, …).
4. Drobné rounding rezíduá (±1 Kč) padnú na prvý týždeň.
5. **Midflight riadky sa NEDOTÝKAJÚ.**

**Špecialita Multisport (#4):** T17 obsahuje len 29/33 item_codes — pre item_codes existujúce v T17+T18+T19 → split na 3, pre item_codes len v T18+T19 → split na 2. (Algoritmus to zvládne automaticky cez `planned_weeks` per item_code.)

**Output:** SQL migrácia, ktorá ti pred aplikáciou v komentári vygeneruje BEFORE/AFTER preview pre každý postihnutý riadok. Spustí sa cez tool `migration` (Supabase) — ja kontrolujem výpočty, ty potvrdíš v Lovable Cloud confirm UI.

### KROK B — Trvalá oprava `EditBundleSplitDialog.tsx`

Aktuálne počíta `totalHours = SUM(scheduled_hours)` a `totalCzk = SUM(scheduled_czk)` per item_code → pri duplikátoch dostane 2× viac.

**Zmena:**
- Detekcia duplikátu: ak v 2+ týždňoch existujú identické (`scheduled_hours`, `scheduled_czk`) páry pre rovnaký item_code, použiť **MAX** namiesto **SUM** ako canonical total.
- Locked rows (midflight/completed/expedice/cancelled/paused) → odpočítať z canonical.
- Slider rozdelí zvyšok podľa zvolených % medzi editovateľné týždne.
- UI: badge `⚠ Detegovaný duplikát — používam MAX (X h / Y Kč)` na item_codes, ktorých sa to týka.

### KROK C — Prevencia v `AutoSplitPopover.tsx`

Pri drag-drop nového týždňa do bundlu, ktorý už pre rovnaký item_code v inom týždni existuje:
- Nová možnosť **„Rozdělit s existujícím týdnem"** vedľa „Vložit celé".
- Default 50/50 split (slider).
- **Nevytvorí duplikát** — UPDATE existujúceho riadku na pomernú časť + INSERT nového na zvyšok.

### KROK D — Build error fix `useTpvPipelineProjects.ts`

`tpv_material` linkuje cez tabuľku `tpv_material_item_link` (nie cez `tpv_item_id` priamo). Načítam linky a postavím `matsByItem` cez ne, fix typov.

## Súbory

- `supabase/migrations/<ts>_repair_bloated_bundles.sql` — repair pre 4 bundles
- `src/components/production/EditBundleSplitDialog.tsx` — MAX detekcia + UI badge
- `src/components/production/AutoSplitPopover.tsx` — pridať „Rozdělit s existujícím týdnem"
- `src/hooks/useTpvPipelineProjects.ts` — fix link table fetch

## Príklad výpočtu — Allianz T17/T18 (po repair)

```
Item   Canonical    →  T17 (50%)        T18 (50%)
T.01   29.0h/76 733 →  14.5h/38 367 Kč  14.5h/38 366 Kč
T.02   22.9h/60 937 →  11.45h/30 469    11.45h/30 468
T.03   16.8h/45 457 →  8.4h/22 729      8.4h/22 728
T.04   58.0h/154 086→  29.0h/77 043     29.0h/77 043
T.05   31.4h/83 674 →  15.7h/41 837     15.7h/41 837
T.06    3.7h/10 605 →  1.85h/5 303      1.85h/5 302
       ────────────    ────────────     ────────────
       161.8h/431 492  80.9h/215 748    80.9h/215 744
```

História T12–T15 (24.5+24.6+15.1+13.6 = 77.8h, 0 Kč) **ostane nedotknutá**.

## Akcia

Po schválení spustím migráciu (s BEFORE/AFTER výpisom v komentári), upravím 3 súbory s logikou a pošlem ti finálny stav na overenie v UI.
