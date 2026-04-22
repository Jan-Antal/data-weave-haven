
## Sjednocení dokončení prvku přes QC před Expedicí

### Cíl
V **Plánu výroby** nesmí akce **„Dokončit → Expedice“** odeslat prvek do Expedice, pokud ještě nemá potvrzenou **QC kontrolu**.

Chování bude stejné jako v modulu **Výroba**:

```text
1. Pokud QC existuje → prvek se může dokončit a objeví se v Expedici.
2. Pokud QC chybí → nejdřív se musí potvrdit QC.
3. Až po potvrzení QC se prvek pošle do Expedice.
```

Současně zkontroluji a sjednotím provázanost opačného směru:

```text
Dokončení ve Výrobě → zápis do production_expedice → automatické zobrazení v Plánu výroby jako Expedice.
```

---

## Co upravím

### 1. Plán výroby: místo blokace otevřít QC krok
V `CompletionDialog.tsx` už existuje kontrola QC, ale aktuálně jen zablokuje dokončení hláškou **„chybí QC“**.

Upravím ji tak, aby uživatel mohl pokračovat řízeně:

- pokud vybrané položky nemají QC,
- dialog zobrazí jasný QC krok,
- tlačítko nebude jen neaktivní / blokované,
- bude dostupná akce typu:

```text
Potvrdit QC a dokončit → Expedice
```

Po kliknutí:

1. vloží se záznam do `production_quality_checks`,
2. zapíše se aktivita `item_qc_confirmed`,
3. následně se provede dokončení,
4. vloží se řádek do `production_expedice`,
5. položka se zobrazí v Expedici.

### 2. Zachovat možnost dokončit jen položky, které už QC mají
Pokud má vybraná položka QC potvrzené, workflow zůstane rychlé:

```text
Dokončit → Expedice
```

Bez dalšího potvrzování.

### 3. Sjednotit logiku s modulem Výroba
V modulu **Výroba** už workflow funguje tak, že:

- `production_quality_checks` je zdroj QC potvrzení,
- `production_expedice` je zdroj toho, že prvek je hotový / čeká na expedici,
- `useProductionSchedule` podle `production_expedice.source_schedule_id` přepne prvek v Plánu výroby na virtuální stav `expedice` / `completed`.

Tuto logiku ponechám jako společný zdroj pravdy a upravím Plán výroby, aby používal stejný princip.

### 4. Oprava dokončení v Plánu výroby
V `CompletionDialog.tsx` sjednotím dokončovací zápis:

- před insertem do `production_expedice` vždy ověřím QC,
- pokud QC chybí a uživatel zvolí potvrzení, vytvořím QC řádky,
- zabráním duplicitnímu vložení QC pro položky, které už kontrolu mají,
- po dokončení invaliduji cache:
  - `production-schedule`,
  - `production-expedice`,
  - `production-expedice-schedule-ids`,
  - `production-quality-checks`,
  - `quality-checks`.

### 5. Ověření provázanosti modulu Výroba
Zkontroluji a případně dorovnám:

- že dokončení ve Výrobě zapisuje do `production_expedice`,
- že se po zápisu invaliduje `production-schedule`,
- že Plán výroby po načtení vidí expedované položky přes `useProductionSchedule`,
- že nedochází k duplicitnímu odeslání stejného `source_schedule_id` do Expedice.

Pokud najdu riziko duplicit, doplním ochranu v kódu před insertem.

### 6. UI text a stav tlačítek
V dialogu bude jasně vidět, co se stane:

```text
Chybí QC kontrola
Nejprve potvrďte QC. Poté budou položky přesunuty do Expedice.
```

Tlačítka:

```text
Zrušit
Potvrdit QC a dokončit
```

Pokud QC nechybí:

```text
Dokončit → Expedice
```

### 7. Soubory

Upravím:

- `src/components/production/CompletionDialog.tsx`
- případně `src/hooks/useProductionDragDrop.ts`, pokud bude potřeba sjednotit duplicitní ochranu
- případně `src/pages/Vyroba.tsx`, pokud kontrola ukáže chybějící invalidaci nebo riziko duplicit
- paměť workflow:
  - `mem://features/production-planning/expedice-shipping-workflow`

---

## Výsledek

- Z Plánu výroby už nepůjde poslat prvek do Expedice bez QC.
- Pokud QC chybí, uživatel ji může potvrdit přímo v dokončovacím workflow.
- Po potvrzení QC se prvek automaticky dokončí a objeví v Expedici.
- Dokončení z modulu Výroba zůstane provázané s Plánem výroby.
- Plán výroby a Výroba budou používat stejný zdroj pravdy: `production_quality_checks` + `production_expedice`.
