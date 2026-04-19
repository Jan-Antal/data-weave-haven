

## Plán: Vizuálny redesign Výkazu — 3 sekcie ako Zaměstnanci + reorganizácia

### 1. Reorganizácia poradia (zhora dole)
Aktuálne: Toolbar → Graf → Summary cards → Tabuľka  
Nové: **Toolbar → Summary cards (4 dashboardy) → Graf → Tabuľka**

Summary cards (Hodiny, Pracovníci, Spárované, Nespárované) idú **nad graf** ako požaduje user.

### 2. Tabuľka rozdelená do 3 samostatných karet (groupBy = "projekt")

Namiesto jednej tabuľky s farebnými oddeľovacími riadkami (aktuálny stav) vytvoriť **tri samostatné `<section>` karty** v štýle `OsobyZamestnanci.tsx`:

```
┌─ Card 1: "Projekty" ──────────────────┐
│ Header strip (badge + count + h/týd) │
│ ─────────────────────────────────────│
│ Table header (UPPERCASE 11px)        │
│ Riadky projektov...                  │
└──────────────────────────────────────┘

┌─ Card 2: "Režie" ─────────────────────┐
│ Header strip — fialový pruh           │
│ Table header                          │
│ Riadky overhead projektov...          │
└──────────────────────────────────────┘

┌─ Card 3: "Nespárované" ───────────────┐
│ Header strip — amber pruh + ikona ⚠   │
│ Table header                          │
│ Riadky unmatched s amber border-l     │
└──────────────────────────────────────┘
```

**Vizuálny jazyk presne ako Zaměstnanci:**
- `<section className="rounded-lg border shadow-sm overflow-hidden bg-card {colorBorder}">`
- Klikateľný header: `w-full flex items-center justify-between px-3 py-2 border-b {colorHeader}` + collapse chevron
- V headeri: `Badge` s farbou sekcie + počet projektov + súčet hodín
- Tabuľka: `Table` s `TableHeader` `bg-muted/30` a `text-[11px] uppercase tracking-wide`, riadky `h-9 hover:bg-muted/50`
- Collapse stav per sekcia (Set<string> alebo 3 boolean states)

**Farby sekcií** (zladené s app paletou):
- **Projekty**: `border-green-200`, header `bg-green-50/80`, badge zelený (ako "direct" v Zaměstnanci)
- **Režie**: `border-purple-200`, header `bg-purple-50/80`, badge fialový (ako "provoz")
- **Nespárované**: `border-[#F5A971]`, header `bg-[#FDE2C7]/60`, badge amber + `AlertTriangle` ikona

### 3. Footer "Celkem"
Sticky tfoot odstrániť (lebo už nie je jedna tabuľka). Namiesto toho na konci pod 3 kartami pridať jednoduchý sumárny riadok: `"Celkem: X h"` v `bg-muted/50` Card s rovnakým štýlom ako footer v Zaměstnanci.

### 4. Skupinové režimy "Osoba" a "Činnosť"
Nezdieľajú projekty/režie/nespárované rozdelenie — ostávajú v **jednej karte** (rovnaký vizuál ako sekcie vyššie, len jedna), bez pruhov.

### 5. Hover/font/typografia konzistentná s Zaměstnanci
- Header strip: `text-[11px] font-semibold` pre badge, `text-[12px] font-medium` pre count, `text-[11px] text-muted-foreground` pre meta
- Table head: `h-9 text-[11px] uppercase tracking-wide`
- Riadky: `text-xs` (13px efektívne na hlavnom obsahu, 11px na meta)
- Project ID: `font-mono text-xs text-primary` (zachovať klikateľnosť)
- Stav badge: zachovať existujúce (Spárováno zelený, Nespárováno amber)

### 6. Súbor
- `src/components/analytics/VykazReport.tsx` — len tento súbor
  - Reorder JSX (summary nad graf)
  - Nahradiť `<ProjektRows>` jednou tabuľkou trojicou samostatných `<section>` cards
  - Pridať `collapsedSections` state (Set: `"projekty" | "rezie" | "nesparovane"`)
  - Extrahovať helper `<VykazSection>` pre opakovateľný card layout
  - Odstrániť sticky tfoot, nahradiť jednoduchým "Celkem" riadkom pod kartami

### Bez zmien
- Žiadne zmeny v dátach, fetchingu, filtroch, grouping logike, exporte CSV, expand/collapse riadkov
- Žiadne zmeny v DB / RLS
- Žiadne zmeny v iných súboroch
- Graf "Hodiny v čase" zostáva nezmenený (len presunutý)

