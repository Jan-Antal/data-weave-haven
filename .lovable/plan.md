
## Upravený plán opravy bundle správania

### Cieľ
Opravím bundle logiku v **Plán Výroby / Kanban týždne** tak, aby:

1. Split séria `A-1`, `A-2` blokovala label `A` pre nové full bundle.
2. Full položky rovnakého projektu/etapy v jednom týždni sa automaticky zlúčili do jedného full bundlu.
3. Manuálne pretiahnutie full bundle na iný full bundle zostalo podporované.
4. Drop split položky späť do rovnakého týždňa nerobil nič a neotváral merge popup.
5. Drop animácia sa zobrazovala iba tam, kde je drop naozaj povolený.

---

## 1. Label `A` je obsadený aj split sériou

Upravím `src/lib/productionBundles.ts`.

Pravidlo:

```text
ak existuje split A-1 / A-2 / A-3
=> label A je obsadený
=> nový full bundle musí dostať B alebo ďalší voľný label
```

`getNextBundleLabel(projectId, stageId)` bude brať ako obsadené všetky existujúce `bundle_label`, bez ohľadu na to, či ide o `full` alebo `split`.

---

## 2. Automatické zlučovanie full položiek v jednom týždni

Doplním automatickú normalizáciu full bundlov.

Ak v jednom týždni existuje viac full bundlov pre rovnaké:

```text
project_id + stage_id + scheduled_week
```

a nejde o split položky, tak sa automaticky zlúčia do jedného bundlu.

Výsledok:

```text
všetky full položky dostanú rovnaký bundle_label
bundle_type = 'full'
split_group_id = NULL
split_part = NULL
split_total = NULL
```

Použije sa stabilný cieľový label:

- ak už existuje full bundle label, ponechá sa najstarší / prvý podľa pozície
- ak label koliduje so split labelom, full bundle dostane ďalší voľný label
- split série sa nemenia

Toto sa použije po akciách, ktoré môžu vytvoriť viac samostatných full bundlov v jednom týždni:

- presun položky do týždňa
- presun bundlu do týždňa
- plánovanie z inboxu
- ponechanie ako samostatné položky, ak sú stále full a v rovnakom týždni
- re-send / revive z TPV listu, ak sa následne plánuje do týždňa

---

## 3. Manuálne zlúčenie full bundle do full bundle zostane

Zachovám manuálne pretiahnutie:

```text
Bundle B → Bundle A
```

Povolené iba keď:

- rovnaký `project_id`
- rovnaký `stage_id`
- rovnaký týždeň
- source aj target sú `bundle_type = full`
- nejde o rovnaký bundle
- nejde o completed / locked / legacy cieľ

Pri dropnutí sa source položky prepíšu na target bundle:

```text
bundle_label = target.bundle_label
bundle_type = 'full'
split_group_id = NULL
split_part = NULL
split_total = NULL
```

Toast iba pri skutočnom zlúčení:

```text
Bundle zlúčený do A
```

---

## 4. Drop split položky späť do rovnakého týždňa bude no-op

V `src/pages/PlanVyroby.tsx` upravím `handleDragEnd`.

Ak používateľ vezme split položku v týždni a pustí ju späť do rovnakého týždňa, neurobí sa nič:

```text
split položka T17 → drop späť do T17 = bez akcie
```

Nebude sa otvárať popup:

```text
Spojit / Ponechat odděleně
```

Ten popup zostane iba pre reálne presuny medzi týždňami, kde má zmysel riešiť merge/split.

---

## 5. Drop animácia iba pre povolené ciele

V `src/components/production/WeeklySilos.tsx` upravím validáciu hover/drop stavu.

Karta sa zvýrazní iba keď drop môže reálne prebehnúť:

```text
full → full rovnaký projekt/etapa/týždeň = áno
full → split = nie
split → full = nie
split A → split B = nie
bundle → iný projekt = nie
bundle → iná etapa = nie
bundle → rovnaký bundle = nie
```

Tým zmizne falošný vizuálny signál, že sa dá dropnúť do cudzieho projektu alebo nepovoleného bundlu.

---

## 6. Presné rozpoznanie cieľového bundlu

Upravím identifikáciu bundle targetov tak, aby sa nepoužívalo nepresné `includes`.

Použije sa stabilný bundle key:

```text
weekKey + project_id + stage_id + bundle_label + split_part
```

Pre:

- React `key`
- drag id
- drop id
- `data-bundle-key`
- hľadanie source/target bundlu pri dropnutí

Tým sa dva bundle rovnakého projektu v tom istom týždni nebudú zamieňať.

---

## 7. Oprava aktuálneho stavu Z-2617-001 / T17

Po implementácii opravím aj existujúce dáta projektu `Z-2617-001` v T17.

Cieľ:

```text
split A-N zostane zachovaný
full bundle nesmie používať A, ak A patrí split sérii
samostatné full položky rovnakého projektu/etapy v T17 sa zlúčia do jedného full bundlu
```

Ak sa ukáže, že niektoré položky majú nekonzistentné `stage_id`, opravím iba tie, ktoré jednoznačne patria k tej istej etape. Skutočne rozdielne etapy sa zlučovať nebudú.

---

## 8. Súbory na úpravu

Upravím hlavne:

- `src/lib/productionBundles.ts`
  - obsadenosť labelu pri split sériách
  - helper na automatické full-bundle zlučovanie
  - helper na validáciu drop targetu

- `src/hooks/useProductionDragDrop.ts`
  - zavolanie normalizácie po presunoch/plánovaní
  - manuálne full→full merge
  - undo/redo pre manuálne merge
  - bezpečné čistenie split metadát pri full merge

- `src/pages/PlanVyroby.tsx`
  - no-op pre drop späť do rovnakého týždňa
  - presné rozlíšenie drop na týždeň vs drop na bundle
  - predanie active drag metadát do Kanbanu

- `src/components/production/WeeklySilos.tsx`
  - drop highlight iba pri validnom cieli
  - stabilný bundle key v drag/drop identite
  - žiadne zvýraznenie pri cudzom projekte alebo nepovolenej kombinácii

---

## 9. Otestovanie

Overím:

- split `A-1`, `A-2` blokuje nový full `A`
- nový full bundle po split `A` dostane `B`
- full položky rovnakého projektu/etapy v jednom týždni sa automaticky zlúčia
- manuálne full bundle → full bundle zlúčenie stále funguje
- split drop späť do rovnakého týždňa nič neurobí
- popup merge/keep split sa nezobrazí pri no-op dropnutí
- full → split zostane zakázané
- split → full zostane zakázané
- iný projekt sa nezvýrazní ako drop target
- iná etapa sa nezvýrazní ako drop target
- `Z-2617-001` v T17 bude mať split sériu oddelenú a full položky zlúčené správne
- build prejde bez TypeScript chýb
