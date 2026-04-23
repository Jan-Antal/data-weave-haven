
## Plán sjednocení QC kontroly při dokončení v Plánu Výroby

### Zjištění

V modulu **Výroba** funguje dokončení takto:

```text
Označit jako hotovo
→ pokud chybí QC
→ otevře se samostatný modal „Kontrola kvality“
→ uživatel může potvrdit QC, případně zapsat vadu
→ až potom se položka označí jako hotová / přesune do Expedice
```

V **Plánu Výroby** už QC kontrola technicky existuje v `CompletionDialog`, ale chování není stejné:

```text
Pravý klik → Dokončit → Expedice
→ otevře se dokončovací dialog
→ chybějící QC se ukáže jen jako inline upozornění
→ tlačítko se změní na „Potvrdit QC a dokončit“
→ po kliknutí se QC zapíše automaticky a položka se dokončí
```

To znamená, že Plán Výroby teď QC neřeší stejným uživatelským tokem jako Výroba. Chybí samostatné QC okno a možnost řešit vady před dokončením.

---

## Cíl úpravy

Sjednotit chování tak, aby při dokončení položky v **Plánu Výroby** vyskočil stejný typ QC kroku jako ve **Výrobě**.

Výsledné pravidlo:

```text
Pokud položka nemá QC:
- Plán Výroby nesmí položku rovnou dokončit.
- Nejdřív otevře QC dialog.
- Po potvrzení QC dokončí položku a přesune ji do Expedice.
```

Pokud položka QC už má:

```text
Dokončení proběhne rovnou.
```

---

## 1. Rozšíření `CompletionDialog` v Plánu Výroby

### Soubor
`src/components/production/CompletionDialog.tsx`

Upravím dokončovací dialog tak, aby při kliknutí na dokončení:

1. zkontroloval vybrané položky,
2. zjistil, které nemají záznam v `production_quality_checks`,
3. pokud QC chybí:
   - neprovede dokončení hned,
   - otevře samostatný QC potvrzovací dialog,
   - zobrazí seznam položek, kterých se QC týká,
   - po potvrzení zapíše QC a teprve potom dokončí položky,
4. pokud QC nechybí:
   - dokončí položky rovnou jako dnes.

---

## 2. Použití stejného UI principu jako ve Výrobě

### Zdroj vzoru
`src/pages/Vyroba.tsx`

Převezmu logiku a vizuální princip z modulu Výroba:

```text
Dialog title: Kontrola kvality — {projekt}
Seznam položek bez QC
Tlačítko: Potvrdit QC
Volitelné: zápis vady / blokující vady podle existujícího komponentového vzoru
```

První krok udělám tak, aby Plán Výroby minimálně zobrazil samostatný QC modal před dokončením. Pokud půjde jednoduše znovupoužít existující formulář vad z Výroby bez rizika velkého refaktoru, přidám i zápis vad. Pokud je formulář ve Výrobě příliš lokálně navázaný, udělám bezpečnější variantu:

```text
Plán Výroby:
- samostatný QC modal
- potvrzení QC
- dokončení položky
```

a následně bude možné formulář vad extrahovat do sdílené komponenty.

---

## 3. Oprava textů v dokončovacím dialogu

Dnešní inline upozornění:

```text
Chybí QC kontrola
Nejprve potvrďte QC. Poté budou položky přesunuty do Expedice.
```

změním tak, aby dialog jasně říkal, že po kliknutí se otevře QC krok, ne že se QC potvrdí potichu.

Například:

```text
Vybrané položky nemají QC kontrolu.
Před dokončením se otevře potvrzení kvality.
```

Tlačítko:

```text
Pokračovat na QC
```

místo automatického:

```text
Potvrdit QC a dokončit
```

---

## 4. Zachování konzistence dat

Po potvrzení QC v Plánu Výroby se bude zapisovat stejně jako ve Výrobě:

```text
production_quality_checks:
- item_id
- project_id
- checked_by
- checked_at
```

Až potom se provede dokončení:

```text
production_schedule.status = completed
production_schedule.completed_at = now
production_schedule.completed_by = current user

production_expedice:
- source_schedule_id
- project_id
- item_code
- item_name
- stage_id
- manufactured_at
- expediced_at podle split/expedice pravidla
```

---

## 5. Cache invalidace

Po potvrzení QC a dokončení invaliduji:

```text
production-schedule
production-expedice
production-expedice-schedule-ids
production-quality-checks
quality-checks
production-progress
production-statuses
```

Tím se změna okamžitě projeví v:

```text
Plán Výroby
Výroba
Expedice
stavové badge u TPV/projektu
```

---

## 6. Undo / Step back

Zkontroluji, aby dokončení z Plánu Výroby zůstalo jedna vratná akce:

```text
QC potvrzení + dokončení položky = jeden Step back krok
```

Undo musí vrátit:

```text
- položku zpět jako nedokončenou,
- odstranit nově vytvořený production_expedice záznam,
- odstranit QC záznam vytvořený tímto krokem,
- ponechat starší QC záznamy, pokud už existovaly před akcí.
```

Redo musí znovu:

```text
- obnovit QC vytvořené v daném kroku,
- dokončit položku,
- obnovit production_expedice záznam.
```

---

## 7. Ověření

Po implementaci ověřím:

1. V Plánu Výroby pravý klik na aktivní položku bez QC → `Dokončit → Expedice`.
2. Neproběhne okamžité dokončení.
3. Otevře se QC dialog.
4. Po zrušení QC dialogu položka zůstane ve výrobě.
5. Po potvrzení QC se položka dokončí.
6. Vznikne záznam v `production_quality_checks`.
7. Vznikne / zůstane jeden odpovídající záznam v `production_expedice`.
8. Modul Výroba ukáže položku jako hotovou.
9. Položka s existujícím QC se dokončí rovnou bez QC dialogu.
10. Step back vrátí dokončení i nově vytvořený QC krok najednou.
11. Step forward znovu provede QC + dokončení.
12. Build projde bez TypeScript chyb.

---

## Soubory k úpravě

```text
src/components/production/CompletionDialog.tsx
src/pages/Vyroba.tsx        // jen pokud bude potřeba extrahovat sdílenou QC část
src/hooks/useUndoRedo.tsx   // jen pokud stávající undo payload nepokrývá QC + dokončení jako jeden krok
```
