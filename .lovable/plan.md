
## Úprava notifikace „Chybějící daylog“

### Cíl
Notifikace se nemá posílat podle toho, jestli má log každý projekt zvlášť.

Nové pravidlo bude:

```text
Pokud je za dnešní den zapsaný aspoň jeden daylog na jakýkoliv projekt, notifikace se neposílá.
Notifikace se pošle jen tehdy, když za celý dnešní pracovní den není zapsaný žádný daylog.
```

To platí i pro záznam typu **„Dnes nebyla výroba“**, protože ten se také ukládá do `production_daily_logs`.

---

## Implementace

### 1. Změnit logiku v `check-daylog`
V `supabase/functions/check-daylog/index.ts` upravím kontrolu tak, aby už neporovnávala logy proti jednotlivým položkám ani projektům.

Aktuální problémová logika:

```ts
bundle_id IN scheduleItems.map(s => s.id)
```

bude nahrazena jednoduchou kontrolou:

```ts
production_daily_logs
  .eq("week_key", weekKey)
  .eq("day_index", dayIndex)
  .limit(1)
```

Pokud existuje aspoň jeden řádek, funkce skončí:

```text
Daylog exists for today, skipping
```

### 2. Zachovat kontrolu, zda je vůbec co hlídat
Notifikace se bude řešit jen pokud:

- není víkend,
- není český státní svátek,
- není firemní dovolená,
- týden nemá nulovou kapacitu,
- v aktuálním týdnu existuje aspoň jedna aktivní položka ve výrobě/plánu.

Pokud není nic naplánované, notifikace se neposílá.

### 3. Použít lokální datum místo UTC
Ve funkci nahradím:

```ts
toISOString().split("T")[0]
```

lokálním helperem:

```ts
function toLocalDateStr(d: Date): string
```

Použije se pro:

- `todayStr`
- `weekKey`

Tím se zabrání posunu data o den kvůli UTC.

### 4. Změnit obsah notifikace
Protože už nepůjde o seznam konkrétních projektů, text bude obecný, například:

```text
Za dnešní pracovní den zatím není zapsaný žádný denní log ve výrobě.
```

Titulek může zůstat:

```text
Chybějící denní log
```

nebo být jasnější:

```text
Chybí denní log za celý den
```

### 5. Zabránit duplicitám za stejný den
Při vytváření notifikace doplním `batch_key`, například:

```text
daylog_missing:{todayStr}
```

Před vložením nové notifikace se ověří, zda už uživatel pro tento den tuto notifikaci nemá. Pokud ano, další kopie se nevloží.

### 6. Upravit kliknutí v notifikacích
V `src/components/NotificationPanel.tsx` upravím zobrazení zprávy:

- zpráva nebude jen `truncate` na jeden řádek,
- systémovou notifikaci půjde rozkliknout a zobrazit celý text,
- pro `daylog_missing` bude kliknutí navigovat do modulu:

```text
/vyroba
```

### 7. Aktualizovat pravidlo v paměti projektu
Doplním pravidlo k daylog notifikacím:

```text
Daylog missing alert se posílá jen při úplně chybějícím daylogu za celý den. Stačí jeden záznam v production_daily_logs pro dnešní week_key + day_index.
```

---

## Soubory

- `supabase/functions/check-daylog/index.ts`
- `src/components/NotificationPanel.tsx`
- `mem://features/notifications/holiday-suppression`
- případně `mem://features/production-tracking/daily-log-logic`

---

## Výsledek

- Pokud někdo zapíše daylog aspoň na jeden projekt, systém už ten den nebude hlásit chybějící daylog.
- Falešné notifikace kvůli jiným projektům zmizí.
- Notifikace se nebude duplikovat pro stejný den.
- Text notifikace půjde rozkliknout.
- Kliknutí na daylog notifikaci otevře rovnou modul Výroba.
