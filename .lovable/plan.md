# Oprava: split bundlu generuje náhodné písmeno (Q-2, D-4)

## Príčina

V `SplitBundleDialog.handleSplitBundle()` sa pri splite vytvoria nové riadky v `production_schedule`, ale **nikde sa nenastaví `bundle_label`**:

- **Update** existujúcich riadkov nastavuje len `split_group_id` (nový UUID), `scheduled_hours`, `scheduled_czk`, `item_name`. Pôvodný `bundle_label = "D"` zostane.
- **Insert** spillnutých riadkov vôbec nepošle `bundle_label` → v DB je `NULL`.

Potom v `useProductionSchedule.ts:131`:

```ts
const bundleLabel = row.bundle_label ?? fallbackBundleLabel(row.split_group_id ?? `${pid}:...`);
```

`fallbackBundleLabel` je **deterministický hash UUID-ka na písmeno A–Z**. Pretože pri splite vznikol **nový** `split_group_id` (UUID), hash padne náhodne na "Q", "D" atď. — odtiaľ "Q-2" namiesto "D-2", "D-4" namiesto "A-4".

Druhý dôsledok: pôvodný `D` riadok má `bundle_label = "D"` (z DB), nový spill riadok má `bundle_label = NULL` → fallback "Q". V tej istej split chain teda existujú dva rôzne labely → bundle sa rozpadne na dve karty bez väzby.

## Plán úpravy

### 1. `src/components/production/SplitBundleDialog.tsx`

**a) Rozšíriť typ `BundleSplitItem`** o `bundle_label: string | null`, aby sa dal zachovať pôvodný label.

**b) V `handleSplitBundle()` určiť cieľový label:**

```ts
const targetBundleLabel =
  items.find((i) => i.bundle_label)?.bundle_label ?? null;
```

Ak nikto nemá label (legacy), nechať `null` a po inserte sa zavolá `getAvailableBundleLabel(projectId, stageId, [...newIds])` aby sa pridelil prvý voľný (A, B, C…) — nie hash.

**c) Pri `update` existujúcich riadkov** pridať:

```ts
bundle_label: targetBundleLabel,
bundle_type: "split",
```

**d) Pri `insert` spillnutých riadkov** pridať:

```ts
bundle_label: targetBundleLabel,
bundle_type: "split",
```

Tým majú **všetky** riadky v chain ten istý label (napr. „D"), a `split_part`/`split_total` ich očísluje 1/2, 2/2 → zobrazí sa **D-1, D-2** miesto „D, Q-2".

### 2. `src/components/production/WeeklySilos.tsx`

V mieste, kde sa volá `setBundleSplitState({ items: activeItems.map(...) })` (cca riadok 677), pridať do mapping objektu:

```ts
bundle_label: i.bundle_label ?? null,
```

aby sa pôvodný label dostal do dialogu.

### 3. `src/hooks/useProductionSchedule.ts` (poistka)

Aktuálne `fallbackBundleLabel(split_group_id ?? ...)` generuje pri NULL labeli **náhodné** písmeno z UUID. Tento fallback necháme ako záchranu pre starodávne riadky, ale po fixe vyššie sa naň pri novom splite **nikdy** nedostaneme, lebo `bundle_label` bude v DB vždy nastavený.

### 4. (Voliteľné, samostatné) Migrácia pre už pokazené riadky

Pre existujúce zlomené splity (Allianz D-Q, RD Skalice A→D-4) nie je potrebná SQL migrácia — stačí:
- buď ručne otvoriť „Upraviť split" a uložiť (po fixe sa label normalizuje),
- alebo pripraviť jednorazovú SQL migráciu, ktorá pre každý `split_group_id` v `production_schedule` zjednotí `bundle_label` na prvú nenull hodnotu zo skupiny (a kde je všetko NULL, priradí prvé voľné písmeno cez aplikačnú logiku — to nie je triviálne v SQL, takže si to vyžiada Edge Function alebo manuálny prechod).

**Navrhujem:** v tomto kroku spraviť len **kódový fix** (body 1–2), aby sa nové splity správali korektne. Opravu existujúcich pokazených chainov urobíme samostatne (vieš mi povedať, či ich chceš normalizovať dávkovo, alebo si ich preklikáš ručne).

## Očakávaný výsledok

- Allianz: split „D" vyrobí v cieľovom týždni **D-2** (a pôvodný sa premenuje na **D-1**).
- RD Skalice: split „A-3" vyrobí **A-4**, nie „D-4".
- Bundle ostane jednou kartou cez týždne (rovnaký `bundle_label` + `split_group_id`).
- Žiadne ďalšie náhodné písmená (Q, X, …) pri splitoch.

## Súbory, ktoré sa zmenia

- `src/components/production/SplitBundleDialog.tsx` (typ + handleSplitBundle)
- `src/components/production/WeeklySilos.tsx` (1 riadok – pridať `bundle_label` do mapovania)
