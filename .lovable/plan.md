
User says "Odpracované hodiny 733" in Dílna dashboard includes overhead hours that should be excluded. Only direct production activities should count: Kompletace, Lakovna, Baleni+Expedice, Rezání, Olepování, CNC, Dyhárna, Vrtání, Masiv. Excluded: Režie, Engineering, PM, atd.

Let me check current logic.
<lov-tool-use id="toolu_vrtx_019JgJbANWD5VG7S6xrDc5cF" name="code--search_files" integration-id="code" data="{\"query\": \"cinnost_kod\", \"include_patterns\": \"src/components/DilnaDashboard.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01SN4zoF88WWZRn7B7uyqPKo" name="code--search_files" integration-id="code" data="{\"query\": \"cinnost_kod|Odpracovan|EXCLUDED_CINNOST|production_hours_log\", \"include_patterns\": \"src/components/DilnaDashboard.tsx,src/components/analytics/VykazReport.tsx\"}">
</lov-tool-use>
The user is concerned that "Odpracované hodiny 733" includes overhead hours (Režije). Currently `DilnaDashboard` already excludes TPV/ENG/PRO codes — but the user says it should ALSO exclude režijní project codes (the overhead_projects table entries). Let me verify.
<lov-tool-use id="toolu_vrtx_0153kCy1w6qyqMRNZtX3yKZf" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/DilnaDashboard.tsx\", \"lines\": \"1-260\"}">
</lov-tool-use>
Now I understand. The current query excludes only `TPV/ENG/PRO` activity codes. The user wants režijní project codes (entries from `overhead_projects` table — eg. project_id like REZIE, SKLAD, MARKETING, etc.) also excluded from the "Odpracované hodiny" tile in the Dílna dashboard.

I have enough context to plan.

<lov-plan>
## Plán: Vyčistiť "Odpracované hodiny" v Dílna dashboarde od režijních hodín

### Problém
Karta **"Odpracované hodiny" = 733h** v Dílna dashboarde počíta všetky hodiny z `production_hours_log` mimo `cinnost_kod IN (TPV, ENG, PRO)`. Užívateľ chce, aby to ukazovalo **iba priamu výrobnú činnosť na projektoch** (Rezání, CNC, Dyhárna, Vrtání, Olepování, Lakovna, Kompletace, Balení, Expedice, Masiv) — bez režijních projektov (kódy z `overhead_projects` ako napr. REZIE, SKLAD, MARKETING…).

Aktuálne `VykazReport` aj `useAnalytics` už správne odlišujú režie cez `overheadMap` (z tabuľky `overhead_projects`), len `DilnaDashboard` ten filter nemá.

### Zmeny v `src/components/DilnaDashboard.tsx`

**1. Pridať fetch overhead_projects** do `Promise.all` v `useDilnaData` (paralelne s ostatnými queries):
```ts
supabase.from("overhead_projects").select("project_code").eq("is_active", true)
```

**2. Postaviť `overheadSet: Set<string>`** z výsledku.

**3. Vyfiltrovať hodiny pred agregáciou** — ihneď po načítaní `hours`:
```ts
const hoursFiltered = hours.filter(h => !overheadSet.has(h.ami_project_id));
```
A nahradiť všetky následné použitia `hours` → `hoursFiltered` (riadky ~142, 144, 145, 150, 216).

**4. Výsledok**: 
- KPI tile **"Odpracované hodiny"** (`totalHoursWeek`) bude obsahovať iba projektovú výrobu
- Karty projektov ostanú nedotknuté (boli postavené nad `hoursByProject`, ktorá je už očistená)
- "Nespárované" karty nebudú falošne vznikať z REZIE/SKLAD kódov
- Kód `cinnost_kod NOT IN (TPV, ENG, PRO)` filter ostáva (oba filtre sú komplementárne — režie sa filtrujú podľa `ami_project_id`, neproduktívne činnosti podľa `cinnost_kod`)

### Bez zmien
- `VykazReport`, `useAnalytics`, DB schéma, RLS — všetko ostatné funguje korektne
