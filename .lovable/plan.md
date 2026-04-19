

## Diagnóza

Vidím dáta a problém je jasný — **inbox má úplne nesprávne hodiny**, hoci `estimated_czk` je správne:

| Projekt | TPV Schváleno (CZK) | Inbox CZK | Inbox hodín | Očakávané hodín |
|---|---|---|---|---|
| Insia (Z-2605-001) | 860 993 | 860 993 ✅ | **14.4** ❌ | ~672 |
| Multisport (Z-2607-008) | 726 150 | 726 150 ✅ | **552.2** ❌ | ~586 (chýba ~9–34) |
| Allianz 5.patro (Z-2617-001) | 1 196 023 | 922 081 ❌ | **7.8** ❌ | ~1214 |
| Allianz 6.patro (Z-2617-002) | 107 325 | 107 325 ✅ | **54** ✅ | 54 ✅ |

### Skutočná príčina

Po dátovom recovery (revert `recon_reduced` → `pending`) sa **vrátili pôvodné hodiny z času midflight reconciliation**, ktoré boli umelo redukované na ~0 (lebo midflight ich „pokryl" historickou prácou). 

Príklad Insia: 7 položiek za 860 993 CZK má spolu len **14.4 h** — to vzniklo tým, že midflight ich zredukoval na zostatok a my sme síce vrátili `status=pending`, ale **`estimated_hours` sme nevrátili na pôvodnú hodnotu**.

`recalculateProductionHours` ich neopravil, lebo dnešná logika len kontroluje, či sa `correctCzk` líši od uloženého — CZK je správne, takže preskočí.

### Allianz 5.patro: dva problémy
1. **Inbox CZK 922 081 ≠ TPV Schváleno 1 196 023** — niektoré položky chýbajú v inboxe (neboli odoslané do výroby).
2. **`hodiny_plan = 1214`** je z prodejnej ceny (`plan_use_project_price = true`), ale TPV Schváleno = 1 302 → správne by malo byť max(TPV, project) alebo prinajmenšom konzistentné.

## Návrh opravy

### Krok 1 — Doplniť do `recalculateProductionHours` opravu hodín v inboxe na základe CZK

Súčasný kód v `src/lib/recalculateProductionHours.ts` aktualizuje schedule/inbox iba keď zistí zmenu cez výpočet z `cena × pocet`. Ale pre inbox položky **už nepoznáme `cena × pocet`** — ich `estimated_czk` je uložené a estimated_hours by sa malo dopočítať priamo z neho:

```text
estimated_hours = floor(estimated_czk × (1 − marže) × production_pct / hourly_rate)
```

Toto pridáme ako **fallback krok** v recalculate: pre každú pending inbox položku porovnaj uložené `estimated_hours` s prepočítanými z `estimated_czk` — ak sa líši, oprav.

### Krok 2 — Jednorazová oprava existujúcich dát (SQL migrácia)

Pre všetky `production_inbox` rows so statusom `pending`:
- prepočítať `estimated_hours = FLOOR(estimated_czk × (1 − marže) × cost_production_pct / hourly_rate)` z dát projektu (+ fallback marže 15 %, + EUR konverzia ak `currency='EUR'`)
- update iba ak sa hodnota líši o > 0.5 h (aby sme zbytočne nešahali do hotových)

### Krok 3 — Allianz 5.patro: chýbajúce položky v inboxe

To **nie je bug v recalculate** — niektoré TPV položky jednoducho neboli odoslané do produkcie (alebo boli vrátené). User to musí poslať z TPV listu manuálne. **Mimo scope tejto opravy.**

### Krok 4 — Multisport: chýba ~9 hodín

Po oprave Krokom 1+2 sa to môže samo dorovnať. Ak nie, je to typická zaokrúhľovacia odchýlka (33 položiek × FLOOR per item) — akceptovateľné.

## Súbory na úpravu

- **`src/lib/recalculateProductionHours.ts`** — pridať fallback prepočet `estimated_hours` z uloženého `estimated_czk` pre inbox položky kde nie je k dispozícii pôvodný TPV item (alebo kde sa hodiny výrazne líšia od očakávaných z CZK).
- **Nová migrácia SQL** — jednorazová oprava inbox `estimated_hours` z `estimated_czk` pre všetky aktuálne pending položky, používajúc settings (hourly_rate, default_margin) a per-project marže/preset.

## Edge cases

- **EUR projekty**: `estimated_czk` je už v CZK (stored), takže žiadna konverzia potrebná pri spätnom dopočte.
- **Položky bez `estimated_czk` (NULL/0)**: preskočiť, ostávajú 0 hodín.
- **Položky s `adhoc_reason='midflight%'`**: to sú expedice markery, nie sú `pending`, neovplyvní ich to.
- **Splittnuté položky (`split_part`/`split_total`)**: pre tie sa používa estimated_czk konkrétneho splitu, takže funguje rovnako.

## Mimo scope

- Allianz 5.patro chýbajúcich 274K CZK v inboxe — to je dátový stav (užívateľ neposlal všetko), nie bug.
- Zaokrúhľovacie rozdiely <1 h per projekt — akceptovateľné.

