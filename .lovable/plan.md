## Oprava zadania: progress musí byť per bundle, nie per project

Súhlasím — pôvodná úvaha „Allianz B zdieľa project_id s A-6, preto má dostať rovnaké %“ je chybná. V Dílni sa progress a target musia vyhodnocovať na úrovni bundlu:

- **Allianz A-6** je split bundle v T18 a môže mať napr. `60 % / 60 %`.
- **Allianz B** je samostatný full bundle preliaty z T17 a má vlastný cieľ `100 %`; ak bol v T17 rozpracovaný na 60 %, má v T18 ukázať `60 % / 100 %`, nie nulu a nie automaticky stav A-6.

## Problém v aktuálnom kóde

V `src/components/DilnaDashboard.tsx` sa teraz daily logy agregujú len podľa `project_id`:

```ts
const pid = log.bundle_id.split("::")[0];
latestPctByProject.set(pid, percent);
```

To je príliš hrubé. Keď má jeden projekt v rovnakom období viac bundlov (A-6 + B), jeden projektový percentuálny stav nevie správne rozlíšiť:

- split chain A,
- full bundle B,
- preliaty bundle z predchádzajúceho týždňa.

## Implementačný plán

Súbor: `src/components/DilnaDashboard.tsx`

1. **Zaviesť stabilný bundle identity key**
   - Pre každý schedule bundle používať rovnakú identitu ako UI grouping:
     ```ts
     project_id + stage_id + bundle_label + split_part/full
     ```
   - Full bundle B teda bude samostatná identita od split A-6.

2. **Daily logy mapovať na bundle, nie iba na projekt**
   - Keďže existujúce `production_daily_logs.bundle_id` sú dnes hlavne vo formáte `projectId::weekKey`, doplní sa resolver:
     - log z konkrétneho týždňa sa spáruje so schedule bundlom v tom istom týždni,
     - ak je v tom týždni iba jeden relevantný bundle pre projekt, priradí sa priamo,
     - pri viacerých bundloch sa použije schedule kontext a bundle label/split metadata, kde sú dostupné,
     - fallback na project-level sa použije len tam, kde nejde bezpečne určiť konkrétny bundle.

3. **Pre spilled bundles držať vlastný carried percent**
   - Pri vkladaní preliateho bundlu z `prevSchedule` sa pre tento konkrétny bundle uloží jeho posledný známy stav z predchádzajúceho týždňa.
   - Tým sa Allianz B v T18 nebude resetovať na `null/0`, ale dostane svoj stav z T17.

4. **Oddeliť target od progressu**
   - Full bundle bez `split_group_id`: target = `100 %`.
   - Split bundle so `split_group_id`: target = chain window pre konkrétny týždeň, napr. A-6 môže mať `60 %`.
   - Zobrazenie ostáva vo formáte `stav / target`, napr.:
     - `60 % / 60 %` pre A-6,
     - `60 % / 100 %` pre preliaty full bundle B.

5. **Upraviť slip/spill guard**
   - Guard, ktorý rozhoduje či sa bundle má ešte ukázať ako preliaty, bude porovnávať percento konkrétneho bundlu s targetom konkrétneho bundlu.
   - Nie projektové percento voči projektovému targetu.

## Validácia po úprave

Skontrolujem hlavne tieto scenáre:

- **Allianz A-6 v T18**: zostane správne okolo `60 % / 60 %`.
- **Allianz B preliaty z T17 do T18**: ukáže `60 % / 100 %` a bar bude vyplnený na 60 %.
- **Multisport T17/T18/T19**: fallback do týždňov bez vlastného logu zostane zachovaný, ale nebude prepisovať iné bundly v rovnakom projekte.
- **Full bundle s dokončeným targetom 100 %**: nebude sa zbytočne ukazovať medzi preliatymi.
- **Split bundle chain**: target ryska zostane podľa chain window, nie podľa full 100 %.

## Bez zmien v databáze

Nebudem robiť migrácie ani meniť schému. Úprava bude v aplikačnej logike Dílne a bude spätne kompatibilná s aktuálnymi daily logmi.