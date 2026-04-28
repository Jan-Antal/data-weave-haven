
## Diagnóza

Commit `5c235211` (26.4.) v `src/components/production/WeeklySilos.tsx` (~riadok 1894) prepísal celé orámovanie bundle karty na neutrálne 1px sivé. Zmizli tri vizuálne signály:

1. **4px farebný `borderLeft`** v farbe projektu (`getProjectColor(project_id)`) — primárny identifikátor projektu.
2. **2px oranžové orámovanie** pri selekcii (`isHighlighted`).
3. Vizuálne odlíšenie spillover a overdue stavov.

Premenná `borderLeftColor` (riadok 1779) je stále v scope, takže netreba dátovú prácu.

## Riešenie

Upraviť `style` objekt bundle wrappera (`<div ref={setBundleNodeRef}>` na riadku 1894) takto:

### `borderLeft` — vždy 4px farba projektu
Jednotná farba projektu pre VŠETKY stavy (spillover aj overdue). Iba pri aktívnej selekcii sa prepne na oranžovú.

```tsx
borderLeft: isHighlighted
  ? "4px solid #d97706"
  : `4px solid ${borderLeftColor}`,
```

### `borderTop / borderRight / borderBottom` — neutrálne, oranžové iba pri selekcii
Overdue NEMENÍ border (užívateľ chce len pozadie).

```tsx
borderTop:    isHighlighted ? "2px solid #d97706"
            : forecastDarkMode ? "1px solid #3d4558" : "1px solid #ece8e2",
borderRight:  /* totožné */,
borderBottom: /* totožné */,
```

### `backgroundColor` — overdue červenkasté, spillover jemne oranžové
```tsx
backgroundColor: forecastDarkMode
  ? (isHighlighted ? "rgba(217,119,6,0.08)" : "#252a35")
  : (shouldHighlightOverdue ? "hsl(0 75% 95%)"      // jemné červenkasté pre overdue
   : isSpilled              ? "rgba(217,119,6,0.06)" // jemný oranžový fill pre spillover
   : isHighlighted          ? "rgba(217,119,6,0.05)"
   :                          "#ffffff"),
```

### `transition` — doplniť `border-left-color`
```tsx
transition: "border-top-color 150ms, border-right-color 150ms, border-bottom-color 150ms, border-left-color 150ms, background-color 150ms, box-shadow 150ms, outline 300ms, opacity 200ms, padding-bottom 160ms, transform 160ms",
```

## Vizuálne pravidlá (zhrnutie)

| Stav | borderLeft (4px) | border (T/R/B) | Pozadie |
|---|---|---|---|
| Default | farba projektu | sivý 1px | biele |
| Selekcia (`isHighlighted`) | oranžový | oranžový 2px | jemne oranžové |
| Spillover (`isSpilled`) | farba projektu | sivý 1px | jemne oranžové |
| Overdue (`shouldHighlightOverdue`) | farba projektu | sivý 1px | jemne červenkasté |
| Spillover + Overdue | farba projektu | sivý 1px | červenkasté má prioritu |

## Súbor

- `src/components/production/WeeklySilos.tsx` — riadky **1894–1909** (style objekt v `CollapsibleBundleCard`).

Žiadne ďalšie súbory netreba meniť.
