
## Doplněný plán revize „Step back“ / Undo systému

### Cíl
Rozšířím revizi Step back tak, aby výrobní workflow bylo spolehlivě vratné i po refreshi stránky a aby jedna reálná akce byla vždy jeden krok zpět/dopředu.

Platnost Step back prodloužím z **15 minut na 30 minut**.

---

## 1. Centrální Undo/Redo systém

### Soubor
`src/hooks/useUndoRedo.tsx`

Upravím:

1. Expiraci z 15 na 30 minut.
2. Bezpečné vykonávání payloadů:
   - insert restore bude používat původní `id`,
   - před insertem ověří, jestli řádek už neexistuje,
   - pokud existuje, použije update místo duplicity,
   - delete přes neexistující `id` nebude padat,
   - multi operace poběží v bezpečném pořadí:
     1. delete nově vzniklých řádků,
     2. update existujících řádků,
     3. insert obnovených řádků.
3. Doplním podporu pro detailnější popis akce v tooltipu:
   - `undoDescription`
   - `redoDescription`
   - případně ponechám `description` jako fallback.

### Hover na šipkách
V horní liště upravím hover text pro Step back / Step forward tak, aby jasně říkal, co se stane:

```text
Zpět: Vrátí 4 položky projektu Z-2512-001 z T18 do Inboxu
Dopředu: Znovu naplánuje 4 položky projektu Z-2512-001 do T18
```

Soubor:
`src/components/production/ProductionHeader.tsx`

---

## 2. Plán výroby: doplněné akce pro Step back

### Soubor
`src/hooks/useProductionDragDrop.ts`

Doplním persistentní undo/redo payloady pro:

1. **Přesun z Inboxu do týdne**
   - jedna položka,
   - celý projekt,
   - bundle jako jedna operace.

2. **Přesun mezi týdny**
   - jedna položka,
   - celý bundle,
   - merge/separate konflikty.

3. **Vrácení do Inboxu / TPV**
   - `moveItemBackToInbox`
   - `returnBundleToInbox`
   - doplním jako jednu undo operaci pro všechny dotčené položky.
   - Undo vrátí schedule řádky přesně zpět.
   - Redo znovu vrátí položky do Inboxu bez duplicit.

4. **Dokončení položky**
   - `completeItems`
   - dokončení bude jedna undo operace.
   - Undo:
     - odstraní odpovídající `production_expedice` záznamy,
     - vrátí `production_schedule` na původní `status`, `completed_at`, `completed_by`,
     - pokud dokončení vytvořilo QC záznam, odstraní i tento QC záznam.
   - Redo:
     - znovu nastaví dokončení,
     - obnoví přesné `production_expedice` záznamy,
     - obnoví přesné QC záznamy, pokud byly součástí původní akce.

5. **Vrácení z Expedice do výroby**
   - `returnToProduction`
   - undo znovu vrátí položku do Expedice v původním stavu.

---

## 3. Dialogy v Plánu výroby

### `src/components/production/CompletionDialog.tsx`

Doplním Step back pro dokončení přes dialog.

Dnes dialog umí při dokončení automaticky vložit i QC záznam, pokud chybí. To musí být jedna atomická operace.

Jedna akce:

```text
Dokončení 3 položek + QC potvrzení
```

Undo udělá společně:
- vrátí položky jako nedokončené,
- odstraní nově vložené `production_expedice`,
- odstraní nově vložené `production_quality_checks`,
- u split-at-completion smaže nově vytvořenou zbývající část,
- obnoví původní hodiny, CZK, split metadata a názvy.

Redo udělá společně:
- znovu dokončí položky,
- znovu vloží expedice záznamy,
- znovu vloží QC záznamy,
- znovu vytvoří split část, pokud vznikla.

### `src/components/production/CancelItemDialog.tsx`

Doplním Step back pro **Zrušení položky**.

Undo:
- vrátí původní `status`,
- vrátí původní `cancel_reason`,
- vrátí původní `cancelled_at`,
- vrátí původní `cancelled_by`.

Pokud se ruší všechny části splitu, bude to pořád jeden krok:

```text
Zrušení 4 částí položky AT.02
```

### `src/components/production/PauseItemDialog.tsx`

Doplním Step back pro **Pauzu položky**.

Undo:
- obnoví původní `status`,
- obnoví původní `pause_reason`,
- obnoví původní `pause_expected_date`.

Pokud pauza zasáhne celý bundle nebo split skupinu, bude to jedna operace.

---

## 4. Expedice panel

### Soubor
`src/components/production/ExpedicePanel.tsx`

Doplním persistentní Step back pro tyto akce:

1. **Expedovat jednu položku**
   - `markAsExpediced`
   - Undo vrátí `expediced_at` na původní hodnotu.

2. **Expedovat celý projekt**
   - `markAllAsExpediced`
   - jedna operace pro všechny položky.
   - Undo vrátí každému řádku jeho původní `expediced_at`.

3. **Vrátit z Archivu do Expedice**
   - `unExpedice`
   - `unExpediceAll`
   - Undo obnoví původní expedovaný stav.

4. **Vrátit do Výroby**
   - `returnToProduction`
   - `returnAllToProduction`
   - Undo znovu vloží přesné `production_expedice` záznamy.
   - Nebude hádat podle názvu položky.

5. **Vrátit do Inboxu / TPV**
   - `returnAllToInbox`
   - jedna operace, která zaznamená:
     - odstraněné `production_expedice`,
     - odstraněné `production_schedule`,
     - změněné nebo nově vložené `production_inbox`.
   - Undo obnoví celý stav před vrácením.
   - Redo znovu provede vrácení bez duplicit.

---

## 5. Modul Výroba

### Soubor
`src/pages/Vyroba.tsx`

Doplním persistentní payloady pro existující Step back akce:

1. **Denní log**
   - změna fáze / procent / poznámky,
   - Bez výroby.

2. **Přelití do dalšího týdne**
   - více položek jako jeden krok.

3. **Poslat do Expedice**
   - `handleConfirmExpedice`
   - Undo:
     - vrátí projekt na původní status,
     - odstraní vložené expedice záznamy,
     - obnoví původní data.
   - Redo:
     - znovu pošle projekt do Expedice pomocí uložených záznamů.

4. **Označit jako Hotovo**
   - jedna nebo více položek.
   - Undo odstraní odpovídající expedice záznamy.
   - Redo je znovu vloží přes původní uložený snapshot.

5. **QC potvrzení**
   - pokud QC vzniká samostatně, bude mít vlastní Step back.
   - pokud QC vzniká jako součást dokončení, nebude samostatný druhý krok, ale bude součástí dokončení.

---

## 6. Bundle = jedna operace

U všech bundle akcí sjednotím chování:

```text
Přesun bundlu Z-2512-001 → T18
```

nebude:

```text
Přesun AT.01
Přesun AT.02
Přesun AT.03
```

Technicky budu používat snapshoty:

```text
beforeRows
afterRows
```

Undo obnoví `beforeRows`.
Redo obnoví `afterRows`.

To zabrání tomu, aby redo znovu spouštělo drag/drop logiku, merge dialogy nebo konfliktové větve.

---

## 7. Ochrana proti duplicitám a loop chybám

Zavedu pravidlo:

- undo/redo nikdy nevolá `pushUndo`,
- redo nepřepočítává akci znovu podle aktuálního stavu,
- redo používá uložený snapshot,
- insert používá původní `id`,
- pokud řádek existuje, aktualizuje se,
- pokud řádek neexistuje při delete, akce pokračuje,
- pokud řádek chybí při kritickém update, zobrazí se čitelná chyba.

Tím se sníží riziko:
- duplicit v `production_schedule`,
- duplicit v `production_inbox`,
- duplicit v `production_expedice`,
- duplicit QC záznamů,
- nekonečného undo/redo loopu.

---

## 8. Audit ostatních modulů

Zreviduji i současný stav mimo výrobu:

### Projekty
- inline edit projektu,
- status,
- termíny,
- PM,
- konstruktér,
- cena.

### TPV
- inline edit položky,
- mazání položek,
- bulk status,
- změna počtu kusů s dopadem na výrobu.

### Nastavení
Prověřím, kde Step back dává smysl:
- kapacity,
- statusy,
- kurzy,
- formule,
- nákladové presety.

Výstupem bude krátká tabulka:

```text
Modul              Dnes                 Po opravě
Plán výroby        část session-only    persistent 30 min
Výroba             část session-only    persistent 30 min
Expedice           bez Step back        persistent 30 min
TPV                částečně             audit + doplnění
Projekty           částečně             ověřeno/doplněno
Nastavení          různé                rozhodnuto podle akce
```

---

## 9. Ověření

Po implementaci ověřím:

1. Step back po refreshi funguje do 30 minut.
2. Přesun jedné položky v Plánu výroby jde vrátit po refreshi.
3. Přesun bundlu je jedna undo operace.
4. Undo bundlu nevyrobí duplicity.
5. Redo bundlu nevyvolá merge/conflict dialogy.
6. Vrácení do Inboxu / TPV jde vrátit i zopakovat.
7. Zrušení položky jde vrátit.
8. Pauza položky jde vrátit.
9. Dokončení položky jde vrátit včetně expedice záznamu.
10. Pokud dokončení vytvoří QC, Step back odstraní i QC ve stejném kroku.
11. Step forward QC znovu obnoví jen pokud QC vzniklo danou akcí.
12. Poslat do Expedice jde vrátit jako jedna operace.
13. Expedovat jde vrátit jako jedna operace.
14. Vrácení z Expedice do výroby jde vrátit.
15. Vrácení z Expedice do Inboxu jde vrátit bez duplicit.
16. Hover na Step back / Step forward jasně popisuje, co tlačítko udělá.
17. Build projde bez TypeScript chyb.

---

## Soubory k úpravě

```text
src/hooks/useUndoRedo.tsx
src/components/production/ProductionHeader.tsx
src/hooks/useProductionDragDrop.ts
src/components/production/CompletionDialog.tsx
src/components/production/CancelItemDialog.tsx
src/components/production/PauseItemDialog.tsx
src/components/production/ExpedicePanel.tsx
src/pages/Vyroba.tsx
src/hooks/useTPVItems.tsx
src/hooks/useProjectMutations.tsx
src/hooks/useCustomColumns.tsx
```

Databázové schéma `undo_sessions` už existuje. Novou tabulku nepředpokládám.
