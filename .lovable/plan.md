

## Plán: Sjednocený shell pro stránky s pod-navigací

### Cíl
Jeden vizuální shell pro všechny moduly s taby (Správa osob, Analytics, případně další). Žádné title/description nad taby, taby přilepené pod hlavní topbar, stejné toolbary, stejné rozměry a barvy všude.

### 1) Nová sdílená komponenta `PageTabsShell`
Soubor: `src/components/shell/PageTabsShell.tsx`

Renderuje:
- **Tab bar** (full-width, border-b 0.5px, bg `var(--background)`) — přilepený přímo pod app topbar, žádný gap
- **Aktivní tab**: `border-b-2 border-[#0a2e28] text-[#0a2e28] font-medium`
- **Neaktivní tab**: `text-muted-foreground`, bez underline, hover přidá `text-foreground`
- Volitelný `rightSlot` pro globální akce (TestModeBanner)
- Children = obsah aktivního tabu (rendrují si vlastní toolbar)

API:
```ts
type TabDef = { key: string; label: string; visible?: boolean };
<PageTabsShell tabs={...} activeKey paramName="tab">
  {(active) => active === "..." ? <Component /> : ...}
</PageTabsShell>
```

URL state přes `?tab=...` (zachová stávající chování Osoby).

### 2) Sjednocený `SectionToolbar`
Soubor: `src/components/shell/SectionToolbar.tsx`

První řádek obsahu pro každý tab — výška 48px, `px-5 py-2 border-b`, flex justify-end:
- left slot (volitelný — group filter pill, week picker u Dílny)
- right slot — search (h-8), action button (h-8)

### 3) Úpravy `src/pages/Osoby.tsx`
- **Smazat** `<h1>Správa osob</h1>` a description text
- **Smazat** vnitřní `px-6 pt-5 pb-0` wrapper
- Použít `PageTabsShell` s existujícími taby
- TestModeBanner přesunout pod tab bar jako tenký řádek (jen pokud `isTestUser`)

### 4) Úpravy `src/pages/Analytics.tsx`
Aktuálně Analytics má **toggle Dílna** uvnitř filter rowu místo top-level navigace.

- Vytáhnout `dilnaMode` jako tab: **Projekty | Dílna**
- (Volitelně Utilizace jako 3. tab — dnes je v `UtilizationCard` v summary; dle požadavku uživatele přidat jako sub-tab)
- Použít `PageTabsShell`
- Tab "Projekty" = stávající tabulka + summary cards + filter row
- Tab "Dílna" = `<DilnaDashboard>` s week navigací jako toolbar
- Odstranit `<Factory />` Dílna toggle button z filter rowu
- URL: `/analytics?tab=projekty|dilna|utilizace`

### 5) Sjednocení obsahu tabů Správa osob

**OsobyKapacita** — dnes renderuje `<CapacitySettings inline />` které má vlastní header/Tabs strukturu. V `CapacitySettings` v inline režimu odstranit vlastní vnitřní Tabs wrapper (pokud je) a sjednotit padding na `px-5 py-3` aby seděl s ostatními taby. Žádný card-style background, jen `bg-background`.

**OsobyUzivatele** — `UserManagement inline` musí používat stejnou hlavičkovou strukturu (`px-5 pt-4 pb-3 border-b` + h2 + actions vpravo) jako `OsobyZamestnanci` a `OsobyExternisti`.

### 6) Tabulkové standardy (aplikovat na všechny taby Osoby + Analytics)
- Row height: `h-10` (40px) — `TableRow` v `ui/table.tsx` má dnes `h-9`, ale neměnit globálně; přidat třídu lokálně v osoby tabech
- Name cell: `text-[13px]`, secondary info: `text-[11px] text-muted-foreground`
- Group headers (Výroba Direct atd.): `bg-muted/40 text-[11px] uppercase tracking-wide font-medium px-3 py-1.5`
- Status pills: `text-[10px] px-2 py-0.5 rounded-full` — sjednotit už použité pills v `OsobyZamestnanci`
- Selecty v řádcích: `h-8 text-xs`

### 7) Soubory

**Nové:**
- `src/components/shell/PageTabsShell.tsx`
- `src/components/shell/SectionToolbar.tsx`

**Upravené:**
- `src/pages/Osoby.tsx` — odstranit title/desc, použít shell
- `src/pages/Analytics.tsx` — taby Projekty/Dílna, vytáhnout Dílna toggle
- `src/components/osoby/OsobyZamestnanci.tsx` — sjednotit row height + pill rozměry
- `src/components/osoby/OsobyExternisti.tsx` — sjednotit (search v `SectionToolbar` patternu)
- `src/components/osoby/OsobyKatalog.tsx` — sjednotit
- `src/components/osoby/OsobyUzivatele.tsx` + `UserManagement.tsx` (inline branch) — sjednotit hlavičku
- `src/components/osoby/OsobyKapacita.tsx` + `CapacitySettings.tsx` (inline branch) — odstranit vnitřní card-style, sjednotit padding

### Bez změny
Funkcionalita, data, dotazy, mutace, RLS, routy. Pouze vizuální vrstva.

