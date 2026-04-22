
## Plán opravy „Vyrobeno“ položek + správného Inbox progresu

### Cíl
Opravím data i výpočet Inboxu v Plánu výroby tak, aby:

1. Vybrané TPV položky byly označené jako **Vyrobeno**.
2. Projekt `Z-2519-001` byl kompletně označený jako vyrobený/vyexpedovaný.
3. Legacy / historické řádky se už nepočítaly jako reálně naplánované položky v Inbox progresu.
4. Sekce **Naplánované** v dolní části Inboxu znovu ukazovala projekty, které mají aktivně naplánované položky a nejsou ještě celé vyrobené.

---

## Důležitý nález z kontroly dat

U projektů `Z-2512-001`, `Z-2519-001`, `Z-2603-001` jsou v `production_schedule` aktuálně hlavně legacy / midflight řádky typu:

```text
item_code = project_id
item_name = Projekt — Txx
is_midflight = true
```

To nejsou skutečné TPV položky typu `AT.02`, `T.05-a`, `TK.01`.

Proto nebudu označovat tyto legacy řádky jako skutečné položky. Místo toho doplním správné záznamy do výrobní/expediční evidence podle reálných TPV `item_code`.

---

## Datová oprava

### 1. Projekt `Z-2512-001`
Označím jako **Vyrobeno** tyto TPV položky:

```text
AT.02
AT.03
AT.07
C.01
```

Pro každou vytvořím chybějící záznam v `production_expedice`:

```text
manufactured_at = now()
expediced_at = null
is_midflight = false
source_schedule_id = null
```

Tím budou položky považované za vyrobené a čekající na expedici.

---

### 2. Projekt `Z-2519-001`
Projekt je podle zadání už vyexpedovaný, takže označím jako vyrobené i expedované **všechny aktivní TPV položky projektu**.

Aktuálně jde o položky:

```text
AN03
AN04a
AN04b
AN04c
AN07
AN07a
AN12
PR1
W1
W3
```

Pro každou vytvořím / doplním záznam v `production_expedice`:

```text
manufactured_at = now()
expediced_at = now()
is_midflight = false
source_schedule_id = null
```

Tím projekt vypadne z Inboxu a bude patřit jen do Expedice / Archivu.

---

### 3. Projekt `Z-2603-001`
Označím jako **Vyrobeno** tyto TPV položky:

```text
T.05-a
T.05-b
T.06-a
T.06-b
T.08
TK.01
```

Pro každou vytvořím chybějící záznam v `production_expedice`:

```text
manufactured_at = now()
expediced_at = null
is_midflight = false
source_schedule_id = null
```

---

### 4. Ochrana proti duplicitám
Před vložením záznamu vždy zkontroluji, jestli už pro kombinaci:

```text
project_id + item_code
```

neexistuje ne-legacy záznam v `production_expedice`.

Pokud existuje, nebudu ho duplikovat.

---

## Oprava výpočtu Inbox progresu

### Soubor
`src/hooks/useProductionProgress.ts`

### Změny

#### 1. Nepočítat legacy / midflight řádky jako naplánované položky
Do dotazu na `production_schedule` doplním:

```text
is_midflight
is_historical
completed_at
expediced_at
```

A při výpočtu progresu budu ignorovat řádky, kde:

```text
is_midflight = true
nebo
is_historical = true
```

Tyto řádky nebudou navyšovat:

```text
scheduled
paused
completed
scheduled_items
```

Tím se legacy řádky typu `Projekt — T13` přestanou tvářit jako reálné naplánované TPV položky.

---

#### 2. Počítat `production_expedice` jako vyrobené položky
Do progresu přidám dotaz na `production_expedice`.

Každý ne-legacy záznam:

```text
is_midflight = false
```

se bude počítat jako `completed`, podle `item_code`.

To vyřeší i případy, kdy položka byla označena jako vyrobená bez vazby na konkrétní `production_schedule` řádek.

---

#### 3. Virtuální dokončení schedule řádků
Pokud existuje záznam v `production_expedice` se `source_schedule_id`, tak daný schedule řádek už nebude počítaný jako `scheduled`.

Bude počítaný jako `completed`.

Tím se odstraní problém, kdy položka už čeká v Expedici, ale v Inbox progresu pořád navyšuje „Naplánováno“.

---

#### 4. Výpočet missing
Výpočet zůstane principově:

```text
missing = total_tpv - (in_inbox + scheduled + paused + completed)
```

Ale `scheduled`, `paused`, `completed` budou už očištěné o legacy data a doplněné o skutečné expedice položky.

---

## Oprava dolní sekce Inboxu „Naplánované“

### Soubor
`src/components/production/InboxPanel.tsx`

Aktuálně je sekce moc přísně filtrovaná přes týdny `>= currentMonday`. To může schovat projekt, který má položky naplánované v minulém týdnu / je zpožděný, ale pořád není celý vyrobený.

Upravím logiku tak, aby se v sekci **Naplánované** zobrazil projekt, pokud:

```text
missing === 0
in_inbox === 0
scheduled + paused > 0
is_complete === false
není blocker-only
```

Nebude tedy záležet na tom, jestli je naplánovaný týden aktuální, budoucí nebo už zpožděný. Pokud položka není vyrobená, projekt má být v Naplánované sekci vidět.

---

## Očekávané chování po opravě

### `Z-2512-001`
- `AT.02`, `AT.03`, `AT.07`, `C.01` budou počítané jako vyrobené.
- Nebudou navyšovat „chybí“.
- Pokud ostatní položky ještě nejsou ve výrobě, projekt zůstane v Inboxu podle reálného stavu.

### `Z-2519-001`
- Všechny TPV položky budou vyrobené a expedované.
- Projekt zmizí z Inboxu.
- Bude patřit do Expedice / Archivu.

### `Z-2603-001`
- `T.05-a`, `T.05-b`, `T.06-a`, `T.06-b`, `T.08`, `TK.01` budou počítané jako vyrobené.
- Zbývající položky budou dál ukazovat reálný stav.

### Legacy data
- Legacy / midflight řádky už nebudou zkreslovat počet naplánovaných položek.
- Inbox progres bude počítat skutečné TPV položky, ne historické týdenní placeholdery.

---

## Ověření

Po implementaci ověřím:

1. V databázi nevznikly duplicitní `production_expedice` záznamy.
2. `Z-2512-001` má správně označené 4 vyrobené položky.
3. `Z-2519-001` má všechny TPV položky označené jako vyrobené + expedované.
4. `Z-2603-001` má správně označených 6 vyrobených položek.
5. Legacy / midflight schedule řádky se nepočítají jako naplánované TPV položky.
6. Sekce **Naplánované** v Inboxu znovu zobrazuje projekty, které mají aktivní nevyrobené položky.
7. Hotové projekty z Inboxu mizí a pokračují jen v Expedici / Archivu.
8. Build projde bez TypeScript chyb.
