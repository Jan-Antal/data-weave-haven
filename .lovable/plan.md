
## Oprava zobrazení hotových split položek ve Výrobě

### Problém
V sekci **✓ Hotové** se splitnutý prvek zobrazuje jako několik samostatných řádků:

```text
Nízká skříň s policí (1/5)
Nízká skříň s policí (2/5)
Nízká skříň s policí (3/5)
Nízká skříň s policí (4/5)
```

To je matoucí, protože obchodně jde pořád o **jeden prvek** a do Expedice má čekat jen jeden finální záznam, ne každý rozdělený plánovací díl zvlášť.

---

## Implementace

### 1. Sloučit split části v sekci „Hotové“
V `src/pages/Vyroba.tsx` upravím výpočet `completedItems`.

Místo přímého renderování každé dokončené schedule položky zvlášť vytvořím agregaci podle:

- `project_id`
- primárně `item_code`
- pokud kód chybí, podle názvu bez suffixu `(1/5)`, `(2/5)` atd.
- ideálně také podle `split_group_id`, pokud je dostupné

Výsledek bude v UI jen jeden řádek:

```text
Z-2617-001  Nízká skříň s policí  77.8h
```

ne čtyři samostatné řádky.

### 2. Správný počet v nadpisu „Hotové“
Nadpis:

```text
✓ Hotové (4)
```

se změní tak, aby počítal sloučené obchodní prvky, tedy např.:

```text
✓ Hotové (1)
```

pokud jde o jeden prvek rozdělený na více částí.

### 3. Zobrazit informaci o částech bez duplicity
U sloučeného řádku doplním malý badge, aby bylo jasné, že prvek je rozdělený:

```text
4/5 částí hotovo
```

nebo pokud je kompletně hotovo:

```text
5/5 částí hotovo
```

Samotný název bude očištěný od suffixu `(N/5)`, aby nevypadal jako více kusů.

### 4. Sečíst hodiny všech hotových částí
U agregovaného řádku se budou hodiny sčítat ze všech dokončených částí stejného prvku.

Příklad:

```text
15.1h + 24.6h + 13.6h + 24.5h = 77.8h
```

V UI se zobrazí jen:

```text
77.8h
```

### 5. Zachovat QC informaci
Pokud mají sloučené části QC kontrolu, zobrazí se jedna společná QC informace.

Technicky:
- pokud má QC aspoň první / reprezentativní část, zobrazí se badge,
- případně se bude preferovat nejnovější QC z dostupných částí.

### 6. Opravit hromadné dokončování split částí
V `UnifiedItemList` jsou místa, kde se při hromadném dokončení zapisuje do `production_expedice`.

Doplním jednotný helper:

```ts
getExpediceTimestampForCompletedItem(item, now)
```

Pravidlo:
- mezilehlé split části (`split_part < split_total`) se zapíšou jako interně dokončené, tedy s vyplněným `expediced_at`,
- poslední část nebo nesplitnutý prvek se zapíše s `expediced_at = null`, aby čekal v Expedici.

Tím se sjednotí chování s existující single-item logikou a zabrání se tomu, aby do aktivní Expedice spadlo více částí stejného prvku.

### 7. Zkontrolovat Expedice panel
V `src/components/production/ExpedicePanel.tsx` ověřím, že aktivní Expedice stále zobrazuje jen položky s `expediced_at = null`.

Pokud už ve starších datech existují duplicitní split části s `expediced_at = null`, upravím zobrazení tak, aby se ve frontendu sloučily podle stejného klíče jako ve Výrobě a nepůsobily jako více kusů.

---

## Soubory

- `src/pages/Vyroba.tsx`
- případně `src/components/production/ExpedicePanel.tsx`

---

## Výsledek

- Ve Výrobě se splitnutý prvek v **Hotové** zobrazí jako jeden řádek.
- Nadpis `✓ Hotové` bude počítat skutečné prvky, ne technické split části.
- Uživatel uvidí stav částí např. `4/5 částí hotovo`, ale nebude to vypadat jako 4 samostatné skříně.
- Do aktivní Expedice bude čekat jen finální prvek, ne každá mezilehlá část.
