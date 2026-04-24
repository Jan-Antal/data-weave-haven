# Plán: 5. summary karta „Hodnota výroby" v Dílne

## Cieľ
Pridať na vrch Analytics → Dílna 5. summary kartu, ktorej hodnota = suma `valueCzk` zo všetkých zobrazených project kariet (rovnaká logika a rovnaký formát ako per-card hodnota dnes vpravo dole).

## Súbor
- `src/components/DilnaDashboard.tsx`

## Zmeny

### 1) `useDilnaData` — pridať agregát
Po výpočte `slipCount` (riadok ~366) pridať:
```ts
const totalValueCzk = cards.reduce((s, c) => s + (c.valueCzk || 0), 0);
```
A vrátiť `totalValueCzk` v return objekte.

### 2) Komponent — destructure
Riadok 489: pridať `totalValueCzk` do destructuringu z `data`.

### 3) Grid — z 4 stĺpcov na 5
Riadok 498: `md:grid-cols-4` → `md:grid-cols-5`.

### 4) Nová karta (za poslednou existujúcou „Mimo plán / Nespárované")
```tsx
<Card className="p-4 shadow-sm">
  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Hodnota výroby</div>
  <div className="text-2xl font-bold mt-1 tabular-nums text-[#2f6f2c]">
    {totalValueCzk > 0
      ? `${(totalValueCzk / 1_000_000).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M Kč`
      : "—"}
  </div>
  <div className="text-[11px] text-muted-foreground mt-2">Suma napříč projekty týdne</div>
</Card>
```

## Akceptačné kritériá
1. ✅ V Analytics → Dílna sa hore zobrazuje 5 summary kariet namiesto 4.
2. ✅ Posledná karta „Hodnota výroby" zobrazuje súčet `M Kč` zo všetkých project kariet pod ňou.
3. ✅ Hodnoty na seba sedia: súčet `M Kč` zobrazený dole pravo na kartách = nová horná suma.
4. ✅ Pri zmene `weekOffset` (iný týždeň) sa hodnota prepočíta — agregát beží v `useDilnaData` queryFn.
5. ✅ Žiadna nová DB query — využíva existujúci `valueCzk` per karta.

## Mimo rozsah
- Žiadne zmeny v DB ani v iných komponentoch.
- Per-card render bez zmien.