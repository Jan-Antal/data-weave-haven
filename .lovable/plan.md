## Cieľ
Absence (`src/components/analytics/AbsenceReport.tsx`) bude vizuálne, štruktúrne a interakčne identický s Výkaz (`VykazReport.tsx`). Zachová si vlastnú dátovú logiku (typy absencií DOV/NEM/RD/Ostatní, periody, plánované vs. dochádzka), ale UI shell, paleta, ovládací bar, filtre a zoraďovanie do farebných blokov budú prevzaté z Výkazu — žiadne vlastné štýly navyše.

## Čo sa konkrétne mení v `AbsenceReport.tsx`

### 1. Toolbar (zhodný s Výkazom)
- Nahradiť aktuálny rad tlačidiel (Týden / Měsíc / Předch. měsíc / 3 měsíce / Rok + Vlastní) **jedným kompaktným kalendárovým popoverom** identickým s Výkazom:
  - vľavo `ChevronLeft` (rangeOffset −1), v strede `Button` s ikonou kalendára a textom rozsahu (`fmtDate(from) – fmtDate(to)`), vpravo `ChevronRight`.
  - Popover: presetová stĺpcová lišta (Týden / Měsíc / Min. týden / Min. měsíc / Posledné 3 měsíce / Rok) + `Calendar mode="range"` s 2 mesiacmi a `weekStartsOn={1}`.
  - Footer popoveru s `Smazat` a `Hotovo`.
- Stredná zóna toolbaru (centrované): nahradiť dvojicu jednoduchých `Popover` filtrov (Typ, Úsek) za **rovnaký `MultiSelectFilter` komponent ako vo Výkaze** (s textovým hľadaním, "Vybrať vše / Zrušiť vše", počet vybratých, zvýraznený border keď je filter aktívny).
  - Filtre pre Absence: **Typ** (Dovolená/Nemoc/Rodičovská/Ostatní), **Úsek**, **Středisko**, **Zaměstnanec**.
  - Reset tlačidlo `X Reset` zhodne s Výkazom.
- Pravá zóna: `TableSearchBar` + `Export CSV` tlačidlo s rovnakými classami (`h-8 px-3 text-xs gap-1.5`).
- Toolbar kontajner: `shrink-0 border-b bg-card px-4 py-2 flex items-center gap-3` (rovnako ako Výkaz, namiesto súčasného `flex-wrap … gap-2`).

### 2. Sumárne karty (rovnaký rad ako Výkaz)
- Použiť **rovnaký grid** `px-4 pt-4 pb-2 grid grid-cols-2 md:grid-cols-4 gap-3` a **rovnaký štýl `Card`** (`p-4 shadow-sm`, label `text-[11px] uppercase tracking-wide text-muted-foreground`, hodnota `text-2xl font-bold mt-1 tabular-nums`).
- Odstrániť emoji ikonky a farebné `border-l-4` pruhy. Zostávajú 4 KPI: **Celkem hodin absencí**, **Aktivní zaměstnanci**, **Plánované / Skutečné** (manual vs dochádzka — bez vlastnej palety), **Dní v období**.

### 3. Graf "Hodiny v čase" (rovnaký vizuál)
- Prepísať blok `Časová osa absencí` na rovnakú `Card` s headerom (titulok + bucket toggle "Auto/Den/Týden" v `bg-muted rounded-lg p-0.5` segmentovanom prepínači).
- Výška `h-[180px]`, marginy `{ top: 4, right: 4, left: -16, bottom: 0 }`, `CartesianGrid strokeDasharray="3 3" vertical={false}`.
- Stacked bars rovnakou paletou ako Výkaz: `hsl(var(--primary))`, `hsl(var(--primary) / 0.55)`, `hsl(var(--accent))`, plus 4. tón pre "Ostatné" (`hsl(var(--primary) / 0.3)`). Tým **zrušíme vlastné amber/red/violet/slate `KIND_COLOR`**, ktoré sa rozchádzajú s brand paletou.
- Vlastný tooltip identický s Výkazom (rounded-lg border bg-background, riadky s 2×2 farebnými indikátormi).
- Pridať **highlight víkendov a sviatkov** cez `useCzechHolidays` + `useCompanyHolidays` + `ReferenceArea` (rovnaký kód ako vo Výkaze) — Absence to dnes vôbec neukazuje.
- Pod grafom rovnaký legend rad `text-[11px]` s farebnými štvorčekmi.

### 4. Radenie do farebných blokov (`CollapsibleSection`)
- Toto je hlavný požiadavok ("radenie podle typu/projektu do bloku"). V Absence budú dáta zoradené do **3 farebných sekcií podľa typu absencie** s presne rovnakým `CollapsibleSection` komponentom prevzatým z Výkazu (alebo presunutým do zdieľaného súboru — viď bod 6):
  - **🟢 "Dovolená"** — tone `projekty` (zelená paleta `border-green-200`, header `bg-green-50/80`).
  - **🟣 "Rodičovská"** — tone `rezie` (fialová paleta).
  - **🟡 "Nemoc + Ostatní"** — tone `nesparovane` (jantárová paleta s `AlertTriangle` ikonou).
- Každá sekcia: collapse hlavička s badgom (názov typu), počet zamestnancov, súčet hodín; pod hlavičkou rovnaká `Table` ako vo Výkaze s expandable detail riadkom (periody) — zachová sa súčasná logika `groupPeriods`.
- Footer karta `Celkem` s `bg-muted/40` a hodnotou v `text-primary` (rovnako ako Výkaz).

### 5. Detail rows (periody)
- Zachovať existujúcu `groupPeriods` logiku, ale prerenderovať expandovaný blok rovnakým štýlom ako vo Výkaze (`bg-muted/30 p-0`, vnorený `Table` s `h-7 text-[10px]` headerom).
- Nahradiť farebné `Badge variant=destructive/secondary/...` za neutrálne `outline` badge s textom typu — farba sekcie už komunikuje typ.
- Zdroj ("Plánované / Dochádzka") ostáva ako jemný `text-[10px]` chip s `bg-primary/10` (totožné s Výkazom).

### 6. Zdieľaný komponent (voliteľné, ale odporúčané)
- Vytvoriť `src/components/analytics/_shared.tsx` s exportmi:
  - `MultiSelectFilter`, `CollapsibleSection`, `FlatSection`, `sectionStyle`, `formatHours`, `toLocalDateStr`, `addDays`, `getRangeBounds` (zjednotená signatúra), `RangePickerToolbar`.
- `VykazReport.tsx` aj `AbsenceReport.tsx` import z tohto súboru. Tým sa zaručí, že akákoľvek budúca zmena v Výkaze sa automaticky prejaví v Absence (a obrátene), a odstráni sa duplikácia ~250 riadkov.

### 7. Drobnosti / čistenie
- Odstrániť `KIND_COLOR`, `KIND_BADGE_VARIANT` (nepoužité po unifikácii palety).
- Odstrániť emoji v textoch (`🏖️`, `👶`, `🤒`) — Výkaz ich tiež nepoužíva.
- Lokalizácia tlačidiel a labelov 1:1 podľa Výkazu (české názvy, `Posledné 3 měsíce`, `Smazat`, `Hotovo`, `Reset`, `Vybrat vše`, `Zrušit vše`).

## Súbory dotknuté
- **upraviť**: `src/components/analytics/AbsenceReport.tsx` (kompletný rewrite render časti, dátová vrstva ostáva).
- **(voliteľne) vytvoriť**: `src/components/analytics/_shared.tsx` a v `VykazReport.tsx` importovať z neho `MultiSelectFilter`, `CollapsibleSection` atď.

## Čo sa NEmení
- Dátová logika (queries `ami_absences`, `ami_employees`, `groupPeriods`, `categorize`, `hoursForRow`).
- CSV export schéma.
- URL/route `tab=absence`.

## Výsledok
Po nasadení bude Absence vizuálne nerozlíšiteľná od Výkazu okrem obsahu (kategórie absencií namiesto projektov/režie/nespárovaných). Toolbar, kalendár, multi-select filtre, sumárne karty, graf aj farebné collapsible sekcie zdieľajú jednu paletu a komponenty.