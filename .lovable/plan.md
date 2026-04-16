

## Plán: Přelité bundles v Plánu výroby — read-only sekce s vlastním barem

### Princip (revize předchozího návrhu)
- **Žádné splitování** přelitých bundles. Položky zůstávají v původním týdnu (T-1) v DB.
- Přelité se v Plánu zobrazí jen **vizuálně** v silo aktuálního týdne T jako **read-only sekce** s vlastním kapacitním barem.
- **Hodiny přelitých se NEzapočítávají do hlavního week capacity baru** (Plán hodnotí budoucnost, ne realitu). Realitu řeší Analytics → Výroba.
- Cíl: PM vidí "v T mám 150h plánu + 60h přelité z T-1" jako dvě oddělené informace, ne jako jeden mix.

### Část 1: Vyroba.tsx — větší oddělovač Přelité vs Plán
Aktuální 1px linka splývá. Změny:
- Tlustá oranžová horní lišta (3px), uppercase heading 12-13px s ikonou ⚠, jemný `bg-orange-50/40` pro celý "Přelité" blok
- Mezera `mt-4` mezi sekcemi
- Jednotně desktop + mobil pager

### Část 2: WeeklySilos.tsx — Přelité sekce v silo aktuálního týdne T

**Logika výpočtu** (jen pro `weekKey === currentMonday`):
- Z `scheduleData` projít všechny týdny `< currentMonday`
- Vyfiltrovat bundles, kde `items.some(i => i.status === "scheduled" || i.status === "in_progress")` (aktivní nedokončené)
- Tyto bundles zobrazit v silo T **před** normálním plánem

**Render v `SiloColumn` (jen T):**
1. **Vlastní mini-bar nad sekcí Přelité**: oranžový progress bar zobrazující `spilledHours / weekCapacity` jako % a `Xh přelité (Y%)` text. Samostatný od hlavního baru.
2. **Section divider**: tlustý oranžový top border 3px + heading "⚠ PŘELITÉ Z PŘEDCHOZÍCH TÝDNŮ" (uppercase, oranžová, 11px)
3. **Bundle karty** přes stávající `CollapsibleBundleCard` s novým propem `isSpilled={true}`:
   - 3px solid `#d97706` left-border
   - Lehce desaturovaný background
   - Read-only badge "Z T{prevWeekNum}" v hlavičce karty
   - Kontextové menu povoleno: **přesunout do T**, **dokončit**, **vrátit do inboxu** (tj. uživatel může reagovat, ale nic se neděje automaticky)
4. **Mezera `mt-4`** + normální divider "PLÁN T{weekNum}"
5. Pak stávající plánované bundles

### Část 3: Hlavní capacity bar — beze změny
- Hlavní week bar zobrazuje **jen plánované hodiny** (jak dnes). Přelité se do něj **NEzapočítávají**.
- Pod hlavním barem (jen v T, jen když existují přelité) přidat malý info řádek:  
  `+ 60h přelité z T-1` (oranžový text, 11px, jen informativně)

### Část 4: CollapsibleBundleCard — nový prop
- `isSpilled?: boolean` → aplikuje oranžový left-border + "Z T{N}" badge
- `spilledFromWeekNum?: number` pro popisek

### Soubory k úpravě
1. `src/pages/Vyroba.tsx` — větší dividery sekcí Přelité/Plán (mobil + desktop)
2. `src/components/production/WeeklySilos.tsx` — výpočet spilled bundles, render sekce v T, mini-bar, info řádek pod hlavním barem
3. `src/components/production/CollapsibleBundleCard` (lokální komponenta v WeeklySilos.tsx) — `isSpilled` prop + styling

### Co se NEMĚNÍ
- DB zůstává netknutá, žádné nové splitování ani přesouvání rows
- Hlavní capacity výpočet zůstává čistý plán
- Realita / vyhodnocení = Analytics → Výroba (mimo scope)

