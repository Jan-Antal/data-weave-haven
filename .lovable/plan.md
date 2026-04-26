## Cieľ
Opraviť logiku „Přelité“ vo Výrobe aj Analytics → Dílna podľa správnej semantiky:

- V T17 nemá byť nič preliate, pretože dáta pred T17 sú midflight história a reálne dokončené.
- V T18 sa majú ako preliate zobraziť aktuálne nedokončené balíky z týždňa T18, ktoré sú už v tomto týždni a ešte nie sú vyrobené/expedované: Příluky Valovi A-5, Insia A-4, Insia B, Allianz B a súvisiace aktuálne balíky.
- V T19 sa nemá zobrazovať nič preliate, kým nie sme v T19.
- Prelievanie sa vyhodnocuje len pre aktuálny reálny týždeň, nie pre ľubovoľný zobrazený historický/budúci týždeň.

## Zistenie
Aktuálny problém spôsobilo, že sme „přelité“ počítali ako T-1 riadky pre každý zobrazený týždeň. To je zle pre túto dátovú situáciu:

- T17 ukazuje staré midflight T16 ako preliate, hoci sú to historicky dokončené dáta.
- T18 hľadá T17, ale požadované balíky sú v skutočnosti v pláne T18 a niektoré ich položky ešte nie sú v `production_expedice`.
- T19 hľadá T18, hoci reálny týždeň je stále T18, takže budúce prelievanie ešte nemá existovať.

## Nové pravidlo
Zavedie sa jednotný helper pre obidva moduly:

```text
shownWeek = týždeň, ktorý si používateľ pozerá
realWeek = aktuálny týždeň podľa dnešného dátumu

Přelité sa počíta iba ak shownWeek == realWeek.
Zdrojom sú nedokončené aktívne riadky v shownWeek, nie T-1.
Dokončené znamená:
- status je completed/expedice/cancelled, alebo
- existuje riadok v production_expedice pre source_schedule_id.

completed_at samotné sa nepoužije.
Midflight riadky sa vo Výrobe/Analytike nebudú používať ako prelievané v historických týždňoch.
```

## Úpravy

### 1. `src/pages/Vyroba.tsx`
- Odstrániť všeobecné prelievanie z predchádzajúceho zobrazeného týždňa.
- Zobrazovať sekciu „Přelité“ len keď je zobrazený reálny aktuálny týždeň.
- Pre aktuálny týždeň označiť ako `isSpilled` tie balíky/projekty, ktoré majú aktívne nedokončené položky v aktuálnom týždni.
- Pri výpočte aktívnych položiek brať do úvahy `production_expedice` cez `expedicedScheduleIds`, aby napr. čiastočne vyrobené balíky nevyzerali celé ako preliate.
- Týždne v minulosti a budúcnosti nebudú generovať žiadnu sekciu „Přelité“.

### 2. `src/components/DilnaDashboard.tsx`
- Zrušiť samostatnú T-1 query `prevSchedRes` pre „spilled“ logiku.
- Balíky v aktuálnom týždni rozdeliť na:
  - normálne naplánované,
  - aktívne nedokončené označené amber chipom ako „Přelité / dořešit tento týden“.
- „Přelité“ badge a `spilledCount` zobrazovať len pre reálny aktuálny týždeň.
- Pre budúci T19 neukazovať žiadne „Přelité z T18“, kým sa reálny dátum nepresunie do T19.
- Neplánované projekty s natrackovanými hodinami ponechať bez zmeny.

### 3. `src/components/production/WeeklySilos.tsx`
- Opraviť rovnaký pattern v plánovacom boarde: `spilledBundlesForCurrent` nesmie vyťahovať T-1 midflight dáta ako preliate.
- Sekciu „přelité“ ponechať iba pre aktuálny reálny týždeň a iba pre nedokončené aktuálne balíky, ak ju tam chceme zobrazovať konzistentne.

## Overenie po implementácii
Vizuálne prejdem:

1. `/vyroba`
   - T17: sekcia „Přelité“ je prázdna/skrytá.
   - T18: viditeľné požadované aktuálne nedokončené balíky: Příluky Valovi A-5, Insia A-4, Insia B, Allianz B.
   - T19: nič preliate.

2. `/analytics?tab=dilna`
   - T17: žiadne preliate midflight dáta.
   - T18: rovnaké balíky ako vo Výrobe, plus existujúce neplánované projekty s natrackovanými hodinami.
   - T19: nič preliate.

3. Skontrolujem, že `completed_at` samotné nič neoznačuje ako dokončené ani preliate a že riadky existujúce v `production_expedice` sa z „přelité“ vyradia.

## Bez databázovej migrácie
Nebude sa meniť schéma ani dáta. Ide o opravu aplikačnej logiky a zobrazenia.