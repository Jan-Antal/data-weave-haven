
## Plán opravy bundle logiky v Plánu výroby

### Problém 1: položka z bundle B nejde přetáhnout do bundle D

V T19 má projekt `Z-2617-001` bundle `B` a `D`, oba jsou typu `full`, ale nejsou ve stejné etapě:

```text
B: stage_id = 5dbe6c7d...
D: stage_id = null
```

Aktuální kontrola dropu nedovolí spojit položky mezi různými `stage_id`, proto přetažení `B → D` skončí jako neplatný drop.

### Úprava
Upravím pravidlo pro full bundle:

- pokud jsou oba bundle typu `full`,
- jsou ze stejného projektu,
- nejsou split,
- uživatel dropuje položku/bundle do jiného full bundlu,

tak sloučení povolím i tehdy, když se `stage_id` liší nebo je u jednoho `null`.

Výsledkem bude:
- položka z `B` půjde přetáhnout do `D`,
- po sloučení převezme položka týden, bundle label a stage cílového bundlu,
- v undo/redo to zůstane jedna operace.

Split bundle pravidla nechám přísnější:
- split se nebude míchat s full,
- různé split série se dál nebudou spojovat.

---

## Problém 2: stejný bundle label `B` existuje v T17 i T19

Aktuální `normalizeFullBundlesForWeek` sjednocuje full bundle pouze v rámci jednoho týdne. To způsobí, že stejný projekt může mít `B` ve více týdnech, pokud se bundle přesune nebo vytvoří v jiném týdnu.

U projektu `Z-2617-001` jsem ověřil stav:

```text
T17: bundle B, full, T.23 -B
T19: bundle B, full, T.23 -A
T19: bundle D, full, T.07, T.08
```

To je podle nového pravidla chyba: každý samostatný full bundle projektu má mít vlastní označení globálně napříč týdny, ne jen v rámci týdne.

---

## Nové pravidlo pro označování full bundle

Pro jeden projekt + etapu bude platit:

```text
A, B, C, D...
```

jsou globální názvy samostatných full bundlů napříč celým plánem.

Tedy:
- pokud existuje `B` v T17, nově vytvořený/samostatný bundle v T19 nesmí také dostat `B`,
- pokud se celý bundle přesune z T17 do T19, jeho label zůstane `B`,
- pokud se položka nebo bundle vloží do existujícího `D`, převezme `D`,
- pokud se položka vyčlení jako nový bundle, dostane první volný label, který není použitý nikde v projektu.

---

## Technická úprava

### 1. `src/lib/productionBundles.ts`

Upravím helpery:

#### `getNextBundleLabel`
Zůstane globální pro projekt + etapu, ale zpřesním, že ignoruje pouze zrušené/vrácené/dokončené historické řádky, a bere aktivní full/split labely jako obsazené.

#### Nový helper
Doplním funkci například:

```ts
getAvailableBundleLabel(projectId, stageId, excludeIds?)
```

Použije se při přesunu nebo vyčlenění, aby nevznikla duplicita labelu mimo původní bundle.

#### `validateBundleDrop`
Upravím tak, aby:
- full → full sloučení bylo povolené i při rozdílném `stage_id`,
- split pravidla zůstala chráněná.

#### `canAcceptBundleDrop`
Upravím stejně jako UI kontrolu:
- drop full položky/bundlu do full bundlu stejného projektu bude povolený,
- stage rozdíl nebude blokovat full → full,
- split logika zůstane beze změny.

---

### 2. `src/hooks/useProductionDragDrop.ts`

Upravím akce:

```text
moveScheduleItemIntoBundle
mergeFullBundleIntoBundle
moveScheduleItemAsNewBundle
moveFullBundleAsNewBundle
moveBundleToWeek
```

Konkrétně:
- při sloučení do cílového bundlu položka převezme i `stage_id` cílového bundlu,
- při vytvoření nového bundlu se použije globálně volný label,
- po přesunu se nebude automaticky normalizovat tak, že se omylem sjednotí samostatné full bundle v jednom týdnu,
- undo/redo payloady zachovají původní `stage_id`, `bundle_label`, `bundle_type`, `scheduled_week`.

---

### 3. `src/hooks/useProductionSchedule.ts`

Zkontroluji klíč pro seskupování bundle:

```ts
project_id + stage_id + bundle_label + split_part
```

Pokud po nové logice bude potřeba, upravím ho tak, aby full bundle seskupoval podle stabilního bundle labelu a split bundle podle split metadat. Cílem je, aby UI správně ukázalo:
- `D` jako jeden bundle po vložení položky z `B`,
- `B` a `D` jako oddělené bundle, pokud se nesloučily.

---

### 4. Oprava existujících dat pro `Z-2617-001`

Připravím jednorázovou bezpečnou opravu aktuální duplicity:

```text
Z-2617-001
T17: B ponechat
T19: B přejmenovat na první volný label, pravděpodobně C nebo E
```

Ponechám existující `D`, protože už existuje jako samostatný bundle v T19.

Oprava bude cílená jen na projekt `Z-2617-001`, ne globální přepis všech dat.

---

## Očekávané chování po opravě

### Ad 1
V T19 půjde:
```text
položka z B → drop na D
```

Výsledek:
```text
D obsahuje původní položky D + položku z B
B zmizí, pokud byl prázdný
```

### Ad 2
Nebude možné, aby jeden projekt měl samostatný full bundle `B` v T17 a další samostatný full bundle `B` v T19.

Pokud nový bundle vzniká v jiném týdnu, dostane nový volný label.

---

## Ověření

Po implementaci ověřím:

1. `Z-2617-001` v T19: položka z `B` jde přetáhnout do `D`.
2. Po dropu má položka label `D`.
3. Po dropu se nezmění split bundle `A`.
4. Full bundle se nespojí se split bundle.
5. Nový full bundle nedostane label, který už projekt používá v jiném týdnu.
6. Aktuální duplicita `B` u `Z-2617-001` bude opravena.
7. Undo vrátí položku zpět do původního bundlu.
8. Redo ji znovu vloží do cílového bundlu bez duplicit.
9. Build projde bez TypeScript chyb.
