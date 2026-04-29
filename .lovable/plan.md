## Čo som zistil

Multisport je momentálne v databáze takto:

```text
T16 history: 33.9 h
T17:        157.6 h
T18:        179.6 h
T19:        179.6 h
Spolu:      550.7 h
TPV aktívny plán: 569 h
Rozdiel:   -18.3 h
```

Po tvojej úprave percent splitu sa data nerozhodili na súčet 80/294/177 h, lebo v session je vidieť, že akcia bola potom vrátená cez Undo. Ale funkcia je stále riziková a zle navrhnutá:

1. Dialóg `Upravit rozdělení po týdnech` dnes berie ako základ `grandTotal` zo schedule riadkov, nie z kanonického TPV plánu.
2. Pri uložení počíta každú položku len z existujúcich riadkov v schedule. Keď niektorý item v niektorom týždni chýba, percentá sa aplikujú na neúplnú maticu a celok sa môže rozpadnúť.
3. Aktuálny Multisport má v T17 len 24 z 28 aktívnych TPV itemov. Chýbajú tam AT.28–AT.31, preto samotné prepercentovanie nemá stabilný základ.
4. `Přepočítat` síce volá globálnu funkciu, ale tá pre splitované položky aktuálne delí hodiny podľa počtu častí, nie podľa existujúcich percent splitu a nie podľa histórie + budúcich týždňov. Tým vie prepísať ručne nastavené percentá alebo ich obnoviť na nesprávny rovnomerný split.
5. Navyše `renumberAllChainsForProject` používa per-item číslovanie (`renumberChain`), čo je v rozpore s projektovým/bundle splitom podľa týždňov. To súvisí aj s console warningom o rozpadnutom split parte.

## Navrhovaný fix

### 1. Opraviť logiku split dialógu

V `EditBundleSplitDialog.tsx` doplním kanonický zdroj pravdy:

- načítať TPV položky pre projekt/split group podľa `item_code`,
- základ pre každú položku = `tpv_items.hodiny_plan`,
- historické/midflight alebo completed/expedice riadky ostanú zamknuté,
- editovateľné týždne dostanú len zvyšok:

```text
remaining_item_hours = TPV item hodiny_plan - locked/history hours for that item
new_week_hours = remaining_item_hours * week_percentage / editable_percentage_sum
```

Tým pádom slider nebude nikdy vychádzať z už pokazenej schedule sumy.

### 2. Doplniť chýbajúce riadky pri uložení splitu

Ak split percentá obsahujú týždne T17/T18/T19 a pre niektorý TPV item v týždni riadok chýba, ukladanie splitu ho doplní ako `production_schedule` riadok s 0 alebo vypočítanými hodinami podľa percenta.

Pre Multisport to vyrieši hlavne chýbajúce položky v T17:

```text
AT.28
AT.29
AT.30
AT.31
```

### 3. Opraviť `Přepočítat`

V `src/lib/recalculateProductionHours.ts` upravím prepočet tak, aby:

- chránil `is_midflight`, `completed`, `expedice`, `paused`, `cancelled`,
- pri split_group_id nepoužil rovnomerné delenie podľa počtu častí,
- zachoval aktuálny pomer týždňov pre daný split chain,
- históriu odpočítal z TPV základu a zvyšok rozdelil len do budúcich/editovateľných týždňov,
- ak chýbajú riadky pre aktívny TPV item v existujúcom split týždni, doplnil ich.

### 4. Opraviť renumbering split chainov

V `splitChainHelpers.ts` upravím `renumberAllChainsForProject`, aby pre projektové/bundle chainy používal týždňové číslovanie (`renumberProjectChain` / bundle-week logic), nie per-item číslovanie. Cieľ:

```text
T16 = 1/4
T17 = 2/4
T18 = 3/4
T19 = 4/4
```

všetky itemy v rovnakom týždni budú mať rovnaký `split_part`.

### 5. Data fix pre Multisport

Spravím migračný fix len pre `Z-2607-008`:

- ponechať T16 history 33.9 h zamknutú,
- dorovnať aktívny plán zo schedule na TPV základ 569 h,
- teda budúce T17–T19 spolu majú byť približne `569 - 33.9 = 535.1 h`,
- zachovať aktuálne percentá budúcich týždňov podľa dnešného rozdelenia, ak neurčíš iné:

```text
T17: 157.6 / 516.8 = 30.5 % z budúcnosti
T18: 179.6 / 516.8 = 34.75 % z budúcnosti
T19: 179.6 / 516.8 = 34.75 % z budúcnosti
```

Po dorovnaní by to vyšlo približne:

```text
T16: 33.9 h
T17: 163.2 h
T18: 186.0 h
T19: 185.9 h
Spolu: 569.0 h
```

### 6. UI spätná väzba

V split dialógu doplním informačný riadok:

```text
Kanonický základ z TPV: 569 h
Zamknuto/history: 33.9 h
Rozděluji zbytek: 535.1 h
```

A pri tlačidle `Přepočítat` zlepším chybové hlásenie tak, aby pri zlyhaní neukázalo len všeobecné „Chyba při přepočtu“, ale aj konkrétny dôvod.

## Súbory, ktoré upravím

- `src/components/production/EditBundleSplitDialog.tsx`
- `src/lib/recalculateProductionHours.ts`
- `src/lib/splitChainHelpers.ts`
- prípadne `src/pages/PlanVyroby.tsx` len pre lepšiu chybu/progress pri `Přepočítat`
- nová databázová migrácia pre dorovnanie Multisport a prípadné helpery/indexy, ak budú potrebné

## Očakávaný výsledok

Po fixe:

- percentuálna úprava splitu už nebude meniť celkový TPV plán,
- history T16 ostane chránená,
- T17/T18/T19 budú len redistribúcia zvyšných hodín,
- `Přepočítat` nebude rozbíjať ručne nastavený split,
- Multisport bude sedieť na 569 h podľa aktuálneho `project_plan_hours`, resp. 561 h len ak sa rozhodneme ako zdroj vynútiť projektovú dotáciu namiesto TPV.