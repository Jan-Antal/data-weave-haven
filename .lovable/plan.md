

## Plán: "Správa osob" jako samostatná stránka `/osoby`

### Layout (dle reference)

**Hlavička stránky** (pod globálním app headerem):
- Tabové navigace nahoře (ne sidebar): `Zaměstnanci · Externi · Uživatelé · Pozice & číselníky · Kapacita`
- Underline indikátor aktivního tabu, brand barvy (`#223937`), Early Sans typografie
- URL state: `/osoby?tab=zamestnanci|externi|uzivatele|katalog|kapacita`

**Obsah tabu** (card-style):
- Sekční hlavička: titulek + meta ("Zaměstnanci · 46 osob", "Alveno sync · 18.4. 22:00 · jen aktivní")
- Pravá strana hlavičky: filter Select ("Všetky strediská"), Search input, primary CTA ("+ Manuálne / + Přidat")
- Tabulka s grouping rows (`Výroba Direct · Kompletace · 8 osob · 320h brutto`) jako barevné pill labely podle strediska:
  - Výroba Direct = zelený pill
  - Výroba Indirect = oranžový pill
  - Provoz = fialový pill
- Řádky: avatar (iniciály) + jméno | Úsek Select | Pozice Select | Úvazek Select | Absencia (badge "RD · do 31.8." nebo "—") | Status badge (aktívny/neaktívny)
- Neaktivní řádky šedé/fade
- Footer tabulky: "+ Přidat absenci" + nápověda ("Alveno absencia sa importuje automaticky · manuálna: RD/NEM/PN/Jiné")

### Routing & integrace

**Nové:**
- `src/pages/Osoby.tsx` — plnostránkový layout, query-param tab state, žádný Dialog
- `src/components/osoby/UzivateleTable.tsx` — extrakt z `UserManagement` (tabulka inline, pomocné dialogy zůstávají)
- `src/components/osoby/KapacitaPanel.tsx` — extrakt z `CapacitySettings` (graf + composition inline) + sub-tab Zaměstnanci s reaktivitou na vybraný týden

**Upravené:**
- `src/App.tsx` — route `/osoby` chráněná `AdminRoute`, rozšířit `PersistentDesktopHeader` modules
- `src/components/PeopleManagementContext.tsx` — `navigate('/osoby?tab=externi')` místo `setOpen`
- `src/components/production/ProductionHeader.tsx` — settings menu "Správa osob" → `navigate('/osoby')`
- `src/components/osoby/OsobyUzivatele.tsx` → použít `UzivateleTable` (žádný modal-on-modal)
- `src/components/osoby/OsobyKapacita.tsx` → použít `KapacitaPanel`
- `src/components/osoby/OsobyZamestnanci.tsx` → redesign dle reference: avatar, pill grouping, kompaktnější řádky, sekční hlavička s meta + filter

**Smazané:**
- `src/components/SpravaOsob.tsx` (modal verze nahrazena stránkou)

### Vizuální detaily

- Pozadí stránky: `bg-[#f8f7f4]` (existing app bg), card `bg-white rounded-lg border`
- Stredisko pill barvy: zelený `bg-green-100 text-green-800`, oranžový `bg-orange-100 text-orange-800`, fialový `bg-purple-100 text-purple-800`
- Status badge: aktívny `bg-green-50 text-green-700 border-green-200`, neaktívny `bg-red-50 text-red-700`
- Absencia badge: `bg-amber-100 text-amber-800`
- Avatar circle: deterministický pastel z hash jména, 32px, iniciály
- Tabové underline: `border-b-2 border-[#223937]` na aktivním
- Konzistentní s app: Early Sans, accent `#223937`/`#EA592A`, `rounded-md` borders

