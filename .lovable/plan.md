## Problém

V `DilnaDashboard.tsx` má funkcia `computeSlip` hard-override:

```ts
if (isSpilled) return "delay";
```

To znamená, že **každý** spillover bundle je natvrdo červený („V omeškání"), aj keď ho dílňa medzitým dotiahla na 100 %. Insia A-4 je presne ten prípad — bol prelitý z T17 do T18 a hoci je completion 100 %, stále svieti červeno.

## Riešenie

Spillover bundle má `expectedPct = 100` (nastavené v `bundleExpectedPctScaled`, riadok 571). Stačí prestať hard-overridovať a nechať normálny výpočet bežať — pokým completion < 100, vyjde to ako "delay" (rovnaký výsledok ako dnes), a keď dosiahne 100, automaticky preskočí na "ok" (zelený). **Done je done.**

### Zmena v `src/components/DilnaDashboard.tsx` (riadky 941–955)

```ts
function computeSlip(
  completionPct: number | null,
  expectedPct: number | null,
  loggedHours: number,
  isSpilled: boolean,
): SlipStatus {
  // Spillover: expected = 100 (mali sme byť hotoví minulý týždeň). Ak completion
  // dosiahne 100 → bundle je dotiahnutý a ide na "ok" (zelený). Done je done.
  // Inak default-uje na "delay" cez ref=100 v hlavnej vetve.
  if (isSpilled && (completionPct == null || completionPct < 100)) return "delay";
  if (loggedHours <= 0 && expectedPct === null) return "none";
  if (completionPct == null) return "none";
  const ref = expectedPct ?? 100;
  if (completionPct >= ref - SLIP_OK_TOL) return "ok";
  if (completionPct >= ref - SLIP_RED) return "slip";
  return "delay";
}
```

## Dopad

- Spillover bundle s completion < 100 → naďalej červený („V omeškání") — bez zmeny.
- Spillover bundle s completion = 100 → zelený („V plánu") — **nový správny stav**.
- Light orange fill (`isSpilled` background) zostáva — vizuálne je stále jasné, že to je prelitý bundle, len už nie je penalizovaný farbou statusu.
- Karta „Ve skluzu / V omeškání" automaticky odráža správny počet (počítame cez bundly).
