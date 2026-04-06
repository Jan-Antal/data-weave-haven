

# Import Excel — režim "Aktualizovat existující"

## Problém

Dnes jediný způsob jak hromadně aktualizovat ceny (nebo jiná pole) je: exportovat → upravit → smazat vše → importovat znovu. Tím se ztratí stopa zpracování (status, konstruktér, poznámky, vazba na produkci).

## Řešení

Přidat do ExcelImportWizard třetí režim importu — **"Aktualizovat existující"** — který:
1. Matchuje řádky z Excelu na existující TPV položky podle `item_code`
2. Aktualizuje **jen namapovaná pole** (např. jen cenu), ostatní pole nechá beze změny
3. Nové kódy (nenalezené v DB) volitelně přidá jako nové položky
4. Nezmazané položky zůstanou nedotčené

## Změny v `src/components/ExcelImportWizard.tsx`

### 1. Nový import mode selector (Step 1, po nahrání souboru)

Přidat volbu režimu pod info o souboru:
- **"Nový import"** (výchozí) — stávající chování, vloží nové + volitelně přepíše duplicity
- **"Aktualizovat existující"** — matchuje podle kódu, aktualizuje jen vybraná pole

```text
State: importMode: "new" | "update"  (default "new")
```

### 2. Step 3 (Preview) — změny pro update režim

Když `importMode === "update"`:
- `buildRows()` porovná Excel hodnoty s DB hodnotami, označí **změněné buňky** (highlight)
- Řádky kde `item_code` neexistuje v DB → status "new" (zelená, volitelně přidat)
- Řádky kde `item_code` existuje a **nic se nezměnilo** → automaticky odškrtnuté
- Řádky kde `item_code` existuje a **pole se liší** → selected, změněné buňky zvýrazněné (oranžově)
- Stats: "X položek k aktualizaci, Y beze změny, Z nových"

### 3. Step 3 → 4 (doImport) — update logika

Když `importMode === "update"`:
- Pro existující položky: `UPDATE` jen polí která jsou namapovaná **a** mají jinou hodnotu
- Pro nové položky (pokud selected): `INSERT` jako dnes
- Nezmazává nic, nedotýká se nenamapovaných polí

### 4. Duplicate mode dropdown

- V režimu "new": zobrazit jako dnes (skip/overwrite)
- V režimu "update": skrýt (vždy overwrite, ale jen změněná pole)

## Implementační detail

```typescript
// V buildRows pro update mode:
const { data: existing } = await supabase
  .from("tpv_items")
  .select("id, item_code, nazev, popis, pocet, cena, konstrukter, notes, status, sent_date, accepted_date")
  .eq("project_id", projectId)
  .is("deleted_at", null);

const existingMap = new Map(existing?.map(e => [e.item_code, e]) || []);

// Pro každý řádek z Excelu:
const dbRow = existingMap.get(values.item_code);
if (dbRow) {
  // Porovnat jen namapovaná pole
  const changedFields: string[] = [];
  for (const f of TARGET_FIELDS) {
    if (mapping[f.key] === null) continue; // nemapováno → přeskočit
    if (f.key === "item_code") continue;
    const excelVal = values[f.key];
    const dbVal = String(dbRow[f.key] ?? "");
    if (excelVal !== dbVal) changedFields.push(f.key);
  }
  // status: changedFields.length > 0 ? "update" : "unchanged"
}
```

## UX Flow

1. Nahraju Excel s aktualizovanými cenami
2. Vyberu režim "Aktualizovat existující"
3. Namapuji sloupce (stačí jen Kód + Cena)
4. V náhledu vidím: "42 položek, 38 s novou cenou, 4 beze změny"
5. Změněné buňky jsou zvýrazněné oranžově (stará → nová hodnota)
6. Kliknu "Aktualizovat 38 položek"
7. Hotovo — status, konstruktér, poznámky, vazba na produkci zůstaly

## Soubory

1. **`src/components/ExcelImportWizard.tsx`** — přidat `importMode` state, upravit `buildRows()`, `doImport()`, a UI pro Step 1 (mode selector) a Step 3 (change highlighting)

