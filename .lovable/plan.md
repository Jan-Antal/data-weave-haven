# Oprava: prelité projekty sa zobrazujú o týždeň neskôr

## Zistenie

Po poslednej úprave sa „aktuálny pracovný týždeň“ cez víkend správne posunul na nový týždeň, ale časť logiky prelievania stále robí ešte ďalší `+7 dní` posun.

Výsledok je presne to, čo vidíš:

```text
Sobota po T18:
aktuálny pracovný týždeň = T19
starý kód pre spillover = aktuálny pracovný týždeň + 1 = T20
=> prelité z T18 vidíš až v T20, čiže o týždeň neskôr
```

Správne má byť:

```text
Po–Pia počas T18:
aktuálny pracovný týždeň = T18
prelité z T18 sa majú ukázať v T19

Sobota/Nedeľa po T18:
aktuálny pracovný týždeň = T19
zdroj prelitia = predchádzajúci týždeň T18
cieľ prelitia = aktuálny pracovný týždeň T19
```

## Plán úpravy

### 1. Doplniť jasné helpery do `src/lib/workWeek.ts`

Nechať existujúci `getWorkWeekMonday()`, ale doplniť odvodené funkcie, aby sa už nikde ručne nerobilo nesprávne `+7`:

- `getCalendarWeekMonday()` – skutočný ISO pondelok dnešného kalendárneho týždňa.
- `getSpillSourceWeekMonday()` – týždeň, z ktorého sa majú brať nedokončené projekty.
- `getSpillDestinationWeekMonday()` / `getSpillDestinationWeekKey()` – týždeň, v ktorom sa majú prelité projekty zobraziť.

Pravidlo bude:

```text
Po–Pia: source = aktuálny kalendárny týždeň, destination = ďalší týždeň
So–Ne: source = práve skončený kalendárny týždeň, destination = aktuálny pracovný týždeň
```

### 2. Opraviť Výrobu (`src/pages/Vyroba.tsx`)

Nahradiť miesta, kde sa dnes robí:

```ts
const realMonday = getWorkWeekMonday();
const spilloverDest = realMonday + 7 dní;
```

novým helperom:

- zdrojové silo bude `getSpillSourceWeekKey()`
- cieľové silo bude `getSpillDestinationWeekKey()`

Týka sa oboch výpočtov:

- desktop/hlavný `projects` výpočet
- mobilný/pager `getProjectsForWeek()` helper

### 3. Opraviť Plán Výroby Kanban (`src/components/production/WeeklySilos.tsx`)

Tento komponent ešte používa starý kalendárny `getMonday(new Date())` a potom `+7`, takže Kanban vie ostať o týždeň posunutý.

Upravím:

- `currentWeekKey` na pracovný aktuálny týždeň
- `realCurrentWeekKey` pre daylogy na zdrojový týždeň prelitia
- `spilloverDestKey` na cieľový týždeň prelitia bez extra posunu
- generovanie týždňových stĺpcov tak, aby aktuálny stĺpec cez víkend bol už nový pracovný týždeň

### 4. Opraviť Tabuľkový pohľad Plánu Výroby (`src/components/production/PlanVyrobyTableView.tsx`)

Tento pohľad si aktuálny týždeň stále počíta lokálnym ISO `getMonday(new Date())` a navyše používa `toISOString()`.

Upravím ho na:

- `getWorkWeekMonday()` pre aktuálny týždeň
- lokálne formátovanie `YYYY-MM-DD` namiesto `toISOString().split("T")[0]`

Tým sa zarovná Kanban aj Tabuľka.

### 5. Opraviť Dílna Analytics (`src/components/DilnaDashboard.tsx`)

Dílna už zobrazuje pracovný týždeň správne, ale spillover query je viazané na `weekOffset === 1`, čo po víkendovom preklopení znamená, že preliatie sa načíta až pri ďalšom týždni.

Upravím:

- spillover zdroj na `getSpillSourceWeekKey()`
- spillover cieľ na `getSpillDestinationWeekKey()`
- pre aktuálny týždeň cez víkend sa budú ťahať nedokončené bundly z predchádzajúceho týždňa
- zachová sa guard, aby sa nezobrazili dokončené / midflight / už naplánované bundly

### 6. Aktualizovať pamäť pravidla

Aktualizujem memory pre `production-tracking/spill-logic`, aby bolo jasné:

- „aktuálny pracovný týždeň“ sa cez víkend prepína na nový týždeň,
- ale zdroj prelitia je vtedy predchádzajúci kalendárny týždeň,
- nikdy sa nesmie aplikovať ešte ďalšie `+7` nad pracovný týždeň.

## Očakávaný výsledok

- V sobotu po skončení T18 bude aktuálny pohľad T19.
- Nedokončené projekty z T18 sa zobrazia hneď v T19 ako „Přelité z minulého týdne“.
- Nebudú preskočené do T20.
- Správanie bude rovnaké v:
  - Analytics → Dílna,
  - Výroba,
  - Plán Výroby Kanban,
  - Plán Výroby Tabuľka.