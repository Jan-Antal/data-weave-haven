
## Plán: 3 nezávislé multi-select filtre namiesto toggle

### Kontext
Aktuálne je v toolbare `VykazReport` segmentovaný prepínač **Projekt | Osoba | Činnosť**, ktorý určuje **iba režim zoskupenia** (groupBy) zobrazených riadkov. Užívateľ chce z toho urobiť **3 samostatné multi-select filtre** (ako Toggl) — každý s vlastným zoznamom a vyhľadávaním, default = všetko vybrané. Filtre obmedzia, **ktoré záznamy sa zarátajú** do tabuľky, kariet (Celkem hodin, Aktívni pracovníci, Utilizace, Nespárované) aj grafu.

### Zmeny v `src/components/analytics/VykazReport.tsx`

**1. Odstrániť segmentovaný prepínač groupBy** (riadky ~641–666) a `const [groupBy, setGroupBy]`. Tabuľka pod kartami sa zjednoduší — zobrazí sa **len projektové zoskupenie** (najinformatívnejšie). `OsobaRows` a `CinnostRows` sekcie odstránime z renderu (kód nechávame, ale nepoužijeme — prípadne neskôr odstrániť).

**2. Pridať 3 nové filtre (state)**:
- `projectFilter: Set<string>` (kľúč = `ami_project_id`)
- `personFilter: Set<string>` (kľúč = `zamestnanec`)
- `activityFilter: Set<string>` (kľúč = `cinnost_kod`)
- Default: `null` = "všetko vybrané" (žiadne filtrovanie). Keď užívateľ začne odznačovať, prepne sa na `Set` s vybranými hodnotami.

**3. Zoznamy hodnôt pre dropdowny** (z `logs`, `useMemo`):
- `availableProjects`: `[{ id, name }]` zoradené podľa hodín DESC, kde `name = projectsMap.get(id) ?? overheadMap.get(id) ?? id`
- `availablePersons`: zoznam unikátnych `zamestnanec` zoradený podľa hodín
- `availableActivities`: `[{ kod, nazov }]` zoradené podľa hodín

**4. Nový komponent `MultiSelectFilter`** (lokálny vo VykazReport):
- Trigger: `Button variant="outline" size="sm"` s labelom `"Projekty (12)"` resp. `"Projekty: Vše"` keď filter je null
- `PopoverContent` šírka ~280px obsahuje:
  - `Input` "Hledat..." (search v zozname; pre projekty aj `id` aj `name`)
  - `Vybrat vše` / `Zrušit vše` tlačidlá
  - Scrollovateľný zoznam s `Checkbox` + label (názov + malý sivý sufix s ID/kódom napravo)
- Po zmene volá `onChange(newSet | null)` (null keď sú vybrané všetky)

**5. Aplikovať filtre** — vytvoriť `filteredLogs` (`useMemo`):
```ts
const filteredLogs = logs.filter(r =>
  (!projectFilter || projectFilter.has(r.ami_project_id || "—")) &&
  (!personFilter || personFilter.has(r.zamestnanec || "—")) &&
  (!activityFilter || activityFilter.has(r.cinnost_kod || "—"))
);
```
A nahradiť všetky výskyty `logs` v down-stream `useMemo`-ch (`grouped`, `summaryStats`, `chartData`) za `filteredLogs`. `availableProjects/Persons/Activities` musia ostať zo **zdrojových `logs`** (aby si užívateľ vedel pridať späť to, čo si odfiltroval).

**6. Layout toolbaru** (riadok 641–666 nahradíme):
- Center segment nahradíme za `flex gap-2` s tromi `MultiSelectFilter` triggermi: **Projekty**, **Osoby**, **Činnosti**
- Search input napravo ostáva (hľadá v aktuálne zobrazenej projektovej tabuľke — funkcia `q` v `grouped`)

**7. Reset filtrov**: malý `X` ikon button vedľa filtrov keď je aspoň jeden aktívny — nastaví všetky 3 na `null`.

### Bez zmien
- Karty, graf, presety dátumov, export CSV — len pracujú nad `filteredLogs`
- DB / hooks / typy

### Edge cases
- Prázdny výsledok po filtroch → existujúci empty state v grafe a tabuľke ostane funkčný
- Search v dropdowne projektov je diakritiky-insensitive (použijeme `normalizedIncludes` z `@/lib/statusFilter`)
- Keď užívateľ odznačí všetko v dropdowne → `Set()` (prázdny set = nič) — výsledok bude prázdny; vizuálne zobrazíme `"Projekty (0)"`
