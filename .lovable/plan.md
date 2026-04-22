
## Úprava plánu: slučování full bundlů + čitelné nebarevné označení

### Cíl
Opravit dvě věci v **Plánu výroby / Kanban Týdny**:

1. Dva samostatné **full bundle** balíky stejného projektu/etapy ve stejném týdnu půjdou sloučit přetažením jednoho zavřeného projektového bundlu na druhý.
2. Označení bundlu bude jasné, ale bez barevného kódování:
   - full: `A`, `B`, `C`
   - split: `A-1`, `A-2`, `A-3`
   - split informace u počtu položek zůstane zachovaná.

---

## 1. Stabilní identita bundlu

Aktuálně se v některých místech bundle identifikuje jen podle:

```text
project_id + weekKey
```

To způsobuje, že dva bundle stejného projektu v jednom týdnu se chovají jako jeden celek.

Upravím identitu na:

```text
weekKey + project_id + stage_id + bundle_label + split_part
```

Použiju ji pro:

- React `key`
- `data-bundle-key`
- drag id
- drop id
- hledání source/target bundlu při drag & drop

Tím se budou dva full bundly v T9 rozlišovat správně.

---

## 2. Drag full bundle do full bundle

Přidám podporu pro sloučení:

```text
Bundle B → Bundle A
```

Povoleno pouze když:

- stejný `project_id`
- stejný `stage_id`
- stejný týden
- source i target mají `bundle_type = full`
- nejde o dokončený / legacy / locked týden

Výsledek:

```text
source položky dostanou bundle_label cílového bundlu
bundle_type = 'full'
split_group_id = NULL
split_part = NULL
split_total = NULL
```

Toast pouze při úspěšném sloučení:

```text
Bundle zlúčený do A
```

Zakázané kombinace zůstanou:

- full → split
- split → full
- jiná etapa
- split A → split B

---

## 3. Žádná nová drop zóna

Nebudu vytvářet samostatnou zónu nebo extra tlačítko pro drop.

Chování bude:

```text
drop na prázdné místo týdne = přesun do týdne / nový bundle
drop přímo na zavřenou kartu bundlu = vložit/sloučit do tohoto bundlu
```

Projekt nemusí být otevřený. Drop target bude samotná zavřená projektová karta.

---

## 4. Vizuální feedback při možném dropu

Když je možné dropnout bundle na bundle, karta se vizuálně zvýrazní bez nové zóny:

- karta se jemně zvětší směrem dolů
- přidá se decentní outline/stín
- zvýšení výšky bude krátké a přechodové, aby bylo jasné „sem můžeš pustit“

Nebudu používat barevné značení podle bundle labelu.

---

## 5. Nebarevný bundle label napravo nad hodinami

V pravé části zavřené karty, nad hodinami, doplním výrazný ale neutrální label:

```text
A
53h
```

Split:

```text
A-1
53h
```

Pravidla:

- full bundle: `A`
- split bundle: `A-1`, `A-2`, podle `split_part`
- neutrální vzhled: žádné modrá/zelená/amber/fialová podle písmen
- styl bude čitelný: tmavý text, jemný šedý podklad nebo tenký border
- hodiny zůstanou pod labelem napravo

---

## 6. Zachovat split označení u počtu položek

Současné označení u počtu položek zůstane:

```text
3 položek  Split 2/3
```

Nebudu ho odstraňovat. Nový label `A-2` vpravo bude sloužit jako rychlá abecední identifikace bundlu, zatímco `Split 2/3` u počtu položek zůstane vysvětlující informace.

---

## 7. `ks` badge pravidlo

Zachovám pravidlo:

```text
1 ks = bez badge
2+ ks = zelený badge "2 ks", "18 ks"...
```

Zkontroluji aktivní, pozastavené i dokončené položky, aby se `1 ks` nikde znovu nezobrazovalo.

---

## 8. Technické úpravy

Upravím hlavně:

- `src/components/production/WeeklySilos.tsx`
  - stabilní bundle key
  - droppable přímo na zavřenou kartu bundlu
  - hover/drop feedback zvětšením karty dolů
  - nebarevný label `A`, `A-1` napravo nad hodinami
  - zachování `Split x/y` u počtu položek
  - sjednocení `ks > 1`

- `src/pages/PlanVyroby.tsx`
  - rozpoznání dropu na konkrétní bundle
  - odlišení dropu na týden vs dropu na kartu bundlu
  - předání source/target bundle identity do akce sloučení

- `src/hooks/useProductionDragDrop.ts`
  - nová akce pro sloučení bundle do bundle ve stejném týdnu
  - validace full/split/stage pravidel
  - update `bundle_label` source položek na target label
  - undo/redo pro sloučení

- `src/lib/productionBundles.ts`
  - případné doplnění helperu pro vytvoření stabilního bundle key a nebarevného display labelu

---

## 9. Ověření

Po implementaci ověřím:

- v T9 lze mít dva full bundly stejného projektu
- přetažením jednoho zavřeného bundlu na druhý se sloučí
- sloučení nemění `production_inbox`, `production_expedice`, analytics ani modul Výroba
- split/full blokace zůstávají funkční
- jiná etapa nejde sloučit
- labely jsou čitelné jako `A`, `B`, `A-1`, `A-2`
- nejsou použité barvy podle písmen
- `Split x/y` u počtu položek zůstává
- `1 ks` se nezobrazuje, `2+ ks` ano
- build projde bez TypeScript chyb
