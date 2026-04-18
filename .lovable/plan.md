

## Plán oprav Správy osob

### Co opravím

1. **Okamžitá změna Úseku/Pozice bez refresh**
   - Opravím cache flow pro `ami_employees`.
   - Dnes se update ukládá do DB, ale neinvaliduje query `["all-employees-osoby"]`, ze které čte `OsobyZamestnanci`.
   - Doplním:
     - přesné `invalidateQueries` pro seznam zaměstnanců v Osobách,
     - stejnou invalidaci pro související seznamy v kapacitě/dropdownech,
     - ideálně i `setQueryData` pro okamžitý lokální přepis řádku bez čekání na refetch.
   - Navíc doplním realtime sync pro `ami_employees` a `position_catalogue`, aby se změny propsaly napříč modulem automaticky.

2. **Odstranění zbytečného menu v Kapacitách**
   - `CapacitySettings` stále obsahuje interní `Tabs` s `Kapacita / Zaměstnanci`.
   - V inline režimu je úplně odstraním.
   - V záložce **Kapacita** zůstane jen samotný kapacitní obsah bez duplicitní navigace.

3. **Vizual sjednotit s Analytics / Project Info**
   - `Osoby.tsx` upravím na stejnou hierarchii:
     - page header + taby nahoře,
     - pod tím rovnou obsah modulu,
     - bez “modal feel” a bez vnořených vizuálních vrstev navíc.
   - Sjednotím toolbar pattern ve všech submodulech:
     - stejné paddingy,
     - stejný border-b,
     - stejné sticky table headery,
     - stejné pozadí a rytmus spacingu jako v Analytics.
   - U `Externisti`, `Katalog`, `Uživatelé`, `Zaměstnanci` použiju stejnou hlavičkovou strukturu, aby stránka působila jako jeden modul.

### Technicky

- **`src/hooks/useOsoby.ts`**
  - opravit `useUpdateEmployeeFields`, `useTerminateEmployee`, `useReactivateEmployee`, `useDeleteEmployeePermanently`
  - invalidovat i `["all-employees-osoby"]`
  - případně přidat okamžitý `setQueryData` update pro edited employee row

- **`src/hooks/useRealtimeSync.ts`**
  - přidat subscriptions pro:
    - `ami_employees`
    - `position_catalogue`
    - případně `people`, pokud chci sjednotit chování i pro externisty

- **`src/components/production/CapacitySettings.tsx`**
  - odstranit interní `<Tabs>`
  - v inline variantě renderovat pouze kapacitní panel
  - zrušit duplicitní “Zaměstnanci” menu

- **`src/components/osoby/OsobyKapacita.tsx`**
  - nechat jen čistý inline kapacitní panel bez další navigace

- **`src/pages/Osoby.tsx`**
  - doladit shell stránky na stejný pattern jako Analytics / Project Info
  - sjednotit background, spacing, overflow a obsahový layout

- **`src/components/osoby/OsobyZamestnanci.tsx`**
  - po úpravě cache ověřit, že se po změně přegenerují grouping rows i filtry bez refresh

- **`src/components/osoby/OsobyExternisti.tsx`**
- **`src/components/osoby/OsobyKatalog.tsx`**
- **`src/components/osoby/OsobyUzivatele.tsx`**
  - sjednotit toolbar a table presentation s novým page layoutem

### Výsledek

- změna **Úsek / Pozice** se projeví ihned,
- v **Kapacitě** zmizí zbytečné interní menu,
- **Správa osob** bude vizuálně držet stejnou hierarchii a rytmus jako zbytek aplikace.

