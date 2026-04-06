

# Fix XLSX extrakce — čtení všech listů, nejen sheet1

## Problém

Oba edge funkce (`extract-tpv` i `extract-tpv-from-sharepoint`) čtou pouze `xl/worksheets/sheet1.xml`. Pokud má Excel víc záložek (např. "Rekapitulace" na sheet1 a skutečné položky na "Atypy"), extraktor najde jen prázdnou rekapitulaci a vrátí 0 položek.

## Řešení

Číst **všechny sheety** z XLSX, spojit je do jednoho TSV (s oddělovačem názvu listu) a poslat celý obsah do AI. AI pak najde položky bez ohledu na to, na kterém listu jsou.

### Jak XLSX interně mapuje sheety

XLSX soubor obsahuje `xl/workbook.xml` s názvy listů a `xl/worksheets/sheet1.xml`, `sheet2.xml`, atd. Potřebujeme:
1. Najít všechny `xl/worksheets/sheet*.xml` soubory v ZIP archivu
2. Parsovat každý sheet zvlášť
3. Spojit TSV výstupy s hlavičkou `=== Sheet: sheet1 ===` atd.

## Soubory k úpravě

### 1. `supabase/functions/extract-tpv-from-sharepoint/index.ts`

Funkce `extractFromExcel` (řádky 177-193):
- Místo hledání pouze `sheet1.xml`, iterovat přes všechny entries matchující `xl/worksheets/sheet*.xml`
- Pro každý sheet parsovat cells → TSV
- Spojit všechny sheety do jednoho textu s oddělovači
- Pokud sheet1 TSV je krátký (< 500 znaků) a existují další sheety, logovat info

### 2. `supabase/functions/extract-tpv/index.ts`

Funkce `extractFromXLSX` (řádky 170-186) — identická změna:
- Číst všechny sheety místo jen `sheet1.xml`
- Spojit do jednoho TSV pro AI

### Změna v obou funkcích (stejná logika)

```text
Před:  let ssXml = '', wsXml = '';
       for (e of entries) {
         if (e.filename === 'xl/sharedStrings.xml') ...
         if (e.filename === 'xl/worksheets/sheet1.xml') ...
       }
       // parse one sheet → TSV → AI

Po:    let ssXml = '';
       const sheetEntries: { name: string; entry: ZipEntry }[] = [];
       for (e of entries) {
         if (e.filename === 'xl/sharedStrings.xml') ...
         if (e.filename.match(/^xl\/worksheets\/sheet\d+\.xml$/)) 
           sheetEntries.push({ name: e.filename, entry: e });
       }
       // sort by sheet number
       // parse each sheet → TSV
       // combine: "=== List 1 ===\n{tsv1}\n=== List 2 ===\n{tsv2}"
       // send combined to AI
```

## Výsledek

- Excel s jedním listem — chování beze změny
- Excel s více listy (Rekapitulace + Atypy) — AI dostane obsah všech listů a extrahuje položky odkudkoliv
- Žádné změny ve frontendu ani promptu

