
## Plán opravy konzistence „Dokončeno / Vrátit do výroby“

### Zjištěná příčina

U projektu `Z-2515-001`, prvek `T02`, je aktuální stav v databázi nekonzistentní:

```text
production_schedule.status = scheduled
production_schedule.completed_at = null
production_expedice existuje pro source_schedule_id = T02
```

Aplikace tedy vidí položku jako hotovou kvůli záznamu v `production_expedice`, i když samotný řádek v `production_schedule` říká `scheduled`.

Proto:
- klik „Vrátit do výroby“ ukáže toast, ale stav se nezmění, protože funkce mění hlavně `production_schedule`, ale nesmaže záznam v `production_expedice`,
- Plán výroby a Výroba se mohou rozcházet, protože někde se bere stav ze `status`, jinde z existence expedice záznamu.

---

## 1. Jednotné pravidlo stavu položky

Zavedu jedno konzistentní pravidlo pro oba moduly:

```text
Výroba / Plán výroby:
- scheduled / in_progress / paused = ve výrobě
- completed = vyrobeno
- production_expedice row bez expediced_at = vyrobeno a čeká v Expedici
- production_expedice row s expediced_at = expedováno / archiv
```

Prakticky:
- položka dokončená ve Výrobě i v Plánu výroby bude mít stejný zdroj pravdy,
- `production_expedice` bude dál sloužit jako přechod do Expedice,
- návrat do výroby musí vždy odstranit odpovídající `production_expedice` záznam.

---

## 2. Oprava „Vrátit do výroby“ v Plánu výroby

### Soubor
`src/hooks/useProductionDragDrop.ts`

Upravím `returnToProduction(scheduleItemId)` tak, aby při návratu:

1. načetl původní `production_schedule` řádek,
2. načetl odpovídající `production_expedice` řádek podle `source_schedule_id`,
3. smazal `production_expedice` řádek,
4. nastavil `production_schedule` zpět na aktivní stav:
   ```text
   status = in_progress nebo scheduled
   completed_at = null
   completed_by = null
   expediced_at = null
   ```
5. invalidoval všechny související query:
   ```text
   production-schedule
   production-expedice
   production-expedice-schedule-ids
   production-progress
   production-statuses
   ```

Undo/Redo pro tuto akci bude snapshotové:
- Undo znovu obnoví původní `production_expedice` řádek a původní schedule stav.
- Redo znovu odstraní expedice řádek a vrátí položku do výroby.
- Nevytvoří duplicitu, protože insert použije původní `id` a bezpečný upsert mechanismus.

---

## 3. Oprava bundle návratu do výroby

### Soubor
`src/components/production/WeeklySilos.tsx`

Aktuálně se u dokončeného bundlu volá `returnToProduction` v cyklu pro každou položku:

```text
for each completed item → returnToProduction(item.id)
```

To je špatně, protože:
- vzniká více undo kroků,
- může se zobrazit toast, i když část změny nezmění reálný stav,
- je vyšší riziko nekonzistence.

Upravím to na jednu bundle operaci:

```text
Vrácení bundlu A projektu Z-2515-001 do výroby
```

Technicky:
- přidám/rozšířím funkci pro hromadný návrat položek do výroby,
- zachytím snapshot všech dotčených `production_schedule` řádků,
- zachytím snapshot všech dotčených `production_expedice` řádků,
- smažu expedice řádky jedním krokem,
- obnovím schedule řádky jedním krokem,
- Step back / Step forward bude jedna operace.

---

## 4. Oprava Výroba modulu, aby správně zobrazoval dokončené položky

### Soubor
`src/hooks/useProductionSchedule.ts`

Dnes hook načítá jen:

```text
scheduled, in_progress, paused
```

To může skrýt položky, které mají `status = completed`, i když mají být ve Výrobě viditelné jako dokončené.

Upravím načítání tak, aby zahrnovalo i:

```text
completed
```

a potom stav sjednotím:
- pokud existuje `production_expedice` řádek bez `expediced_at`, položka se v UI zobrazí jako dokončená / v Expedici,
- pokud je `production_schedule.status = completed`, zobrazí se jako dokončená,
- pokud se položka vrátí do výroby, oba moduly ji po invalidaci uvidí jako aktivní.

---

## 5. Oprava lokálních kontrol ve Výrobě

### Soubor
`src/pages/Vyroba.tsx`

Sjednotím lokální helpery, které dnes ne vždy používají stejnou logiku:

- `isItemDone`
- `isItemDoneLocal`
- řazení dokončených položek dolů,
- výpočet `hasIncomplete`,
- tlačítko „Označit jako hotovo“.

Konkrétně opravím problém typu:

```text
status = expedice
```

nesmí být brán jako nedokončený jen proto, že není přesně `completed`.

Výsledkem bude:
- hotové položky budou vždy ve spodní části,
- tlačítko „Označit jako hotovo“ nebude nabízet dokončené položky,
- QC a dokončení budou pracovat se stejnou logikou jako Plán výroby.

---

## 6. Dokončení položky ve Výrobě

### Soubor
`src/pages/Vyroba.tsx`

Při označení položky jako hotovo sjednotím zápis:

1. vložit/obnovit `production_expedice`,
2. nastavit `production_schedule.status = completed`,
3. nastavit `completed_at`,
4. nastavit `completed_by`.

Při vrácení zpět:

1. smazat `production_expedice`,
2. vrátit `production_schedule.status` na `in_progress` nebo `scheduled`,
3. vyčistit `completed_at`,
4. vyčistit `completed_by`.

Tím budou Plan Výroby a Výroba ukazovat stejný stav ze stejných dat.

---

## 7. Cílená oprava aktuálních dat pro Z-2515-001 / T02

Po úpravě kódu provedu cílenou opravu aktuálního rozbitého stavu:

```text
Projekt: Z-2515-001
Prvek: T02
Akce: odstranit stale production_expedice záznam, pokud má být T02 zpět ve výrobě
```

Tím se aktuální položka ihned vrátí do aktivního stavu a přestane se tvářit jako dokončená.

Nebudu dělat žádný hromadný přepis ostatních projektů bez kontroly.

---

## 8. Realtime a cache invalidace

### Soubor
`src/hooks/useRealtimeSync.ts`

Doplním invalidaci pro `production_expedice`, protože změny v této tabulce přímo mění stav položek ve Výrobě i v Plánu výroby.

Při INSERT / UPDATE / DELETE v `production_expedice` se invaliduje:

```text
production-expedice
production-expedice-schedule-ids
production-schedule
production-progress
```

Tím se oba moduly přepočítají hned po změně.

---

## 9. Ověření

Po implementaci ověřím:

1. `Z-2515-001 / T02` se po opravě již netváří jako dokončený, pokud byl vrácen do výroby.
2. Pravý klik v Plánu výroby → „Vrátit do výroby“ skutečně odstraní stav dokončeno.
3. Po návratu do výroby zmizí odpovídající záznam z `production_expedice`.
4. Výroba modul ukáže stejný stav jako Plán výroby.
5. Dokončení položky ve Výrobě se propíše do Plánu výroby.
6. Dokončení položky v Plánu výroby se propíše do Výroby.
7. Hotové položky se ve Výrobě řadí dolů.
8. Vrácení celého bundlu je jeden Step back krok.
9. Undo návratu do výroby znovu obnoví dokončený / expedice stav.
10. Redo návratu do výroby znovu vrátí položku do aktivní výroby.
11. Nevzniknou duplicitní `production_expedice` záznamy.
12. Build projde bez TypeScript chyb.

---

## Soubory k úpravě

```text
src/hooks/useProductionDragDrop.ts
src/components/production/WeeklySilos.tsx
src/hooks/useProductionSchedule.ts
src/pages/Vyroba.tsx
src/hooks/useRealtimeSync.ts
```
