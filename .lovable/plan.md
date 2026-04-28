## Problém

V Dílna dashboarde karta **„Ve skluzu / V omeškání"** počíta projekty, nie bundly:

```ts
const delayCount = cards.filter(c => c.slipStatus === "delay").length;
const slipCount  = cards.filter(c => c.slipStatus === "slip").length;
```

`card.slipStatus` je **„worst across bundles"** — takže projekt s 5 bundlami, z ktorých 3 meškajú, sa zaráta ako 1. Užívateľ chce vidieť reálny počet meškajúcich/skĺzajúcich **bundlov**.

## Riešenie

V `src/components/DilnaDashboard.tsx` prepočítať `slipCount` a `delayCount` agregáciou cez `card.bundles[]` namiesto cez `cards[]`.

### Zmena (riadky 906–907)

```ts
// PRED
const delayCount = cards.filter(c => c.slipStatus === "delay").length;
const slipCount  = cards.filter(c => c.slipStatus === "slip").length;

// PO — počítame bundly naprieč všetkými projektmi (len naplánované karty,
// nie off_plan/unmatched, ktoré nemajú bundly v pláne týždňa)
const allBundles = cards
  .filter(c => c.warning === "none")
  .flatMap(c => c.bundles);
const delayCount = allBundles.filter(b => b.slipStatus === "delay").length;
const slipCount  = allBundles.filter(b => b.slipStatus === "slip").length;
```

### Úprava popisku pod číslom (riadok 1080)

Aktuálny popisok hovorí o projektoch — zmeniť na bundly:

```tsx
// PRED
<div className="text-[11px] text-muted-foreground mt-2">
  Z {cards.filter(c => c.warning === "none").length} naplánovaných projektů
</div>

// PO
<div className="text-[11px] text-muted-foreground mt-2">
  Z {allBundles.length} naplánovaných bundlů
</div>
```

`allBundles.length` musí byť dostupné v render scope — preto ho pridáme aj do `return { ... }` z `useDilnaData` (napr. ako `totalBundles`) a destruktúrneme v komponente vedľa `slipCount`/`delayCount`.

## Čo zostáva nezmenené

- **Karta „Mimo plán / Nespárované"** — naďalej projektová úroveň (off_plan/unmatched sú projektové príznaky, bundly tam nemajú zmysel).
- **Sortovanie projektových kariet** podľa worst-bundle slipStatus zostáva — vizuálne usporiadanie sa nemení.
- **Per-bundle zobrazenie** vnútri kariet sa nemení.
