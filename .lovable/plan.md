

# Auto-výpočet % rozpracovanosti z TPV položek

## Přehled

Automaticky počítat `percent_tpv` na základě statusů TPV položek projektu. Každý status má váhu (0–100%), výsledek = průměr vah všech položek (bez zohlednění množství).

## Mapování statusů → váha

| Status | Váha |
|--------|------|
| Chybějící podklady | 0% |
| Čeká na zaměření | 0% |
| Připraveno ke zpracování | 10% |
| Zpracovává se | 40% |
| Odesláno ke schválení | 65% |
| Připomínky ke zpracování | 75% |
| Revize odeslána ke schválení | 90% |
| Schváleno | 100% |

**Vzorec**: `percent_tpv = round(sum(váha_každé_položky) / počet_položek)`

Pokud projekt nemá žádné TPV položky → `percent_tpv` zůstane manuálně editovatelné (beze změny).

## Implementace

### 1. Nový helper: `src/lib/tpvProgress.ts`
- Exportovat mapu `STATUS_WEIGHT: Record<string, number>` (case-insensitive matching, lowercase keys)
- Funkce `computeTPVProgress(items: TPVItem[]): number | null` — vrátí zaokrouhlené % nebo `null` pokud žádné položky

### 2. Automatický výpočet v tabulkách (`CrossTabColumns.tsx`)
- V `case "percent_tpv"`: pokud existují TPV položky pro projekt, zobrazit computed hodnotu (read-only `ProgressBar`), jinak ponechat manuální editaci
- Přidat prop `tpvItems?: TPVItem[]` do `renderColumnCell` parametrů (nebo předat computed value přímo přes `displayProject`)

### 3. Výpočet v `ProjectRow` renderech (všechny 3 tabulky)
- Každá tabulka už má přístup k `useAllTPVItems()` (importuje `itemsByProject`)
- V `ProjectRow` merge: pokud `tpvItems.length > 0`, nastavit `displayProject.percent_tpv = computeTPVProgress(items)` a přidat `percent_tpv` do read-only polí
- Pokud `tpvItems.length === 0`, ponechat manuální hodnotu z projektu

### 4. Project Detail (`ProjectDetailDialog.tsx`)
- V TPV sekci: pokud projekt má TPV položky, zobrazit computed % jako read-only s popiskem "Auto z položek"
- Pokud nemá položky, ponechat manuální input

### 5. Uložení do DB (volitelné, doporučené)
- Po každé změně statusu TPV položky (`useUpdateTPVItem`) přepočítat a uložit `percent_tpv` na projekt/etapu
- To zajistí správné hodnoty i pro export, Ami asistenta, a achievement tracking

## Soubory ke změně

| Soubor | Změny |
|--------|-------|
| `src/lib/tpvProgress.ts` | **Nový** — helper s mapou vah a compute funkcí |
| `src/components/CrossTabColumns.tsx` | percent_tpv: read-only pokud computed |
| `src/components/ProjectInfoTable.tsx` | Merge computed percent_tpv do displayProject |
| `src/components/PMStatusTable.tsx` | Stejné |
| `src/components/TPVStatusTable.tsx` | Stejné |
| `src/components/ProjectDetailDialog.tsx` | Auto % s popiskem "Auto z položek" |
| `src/hooks/useTPVItems.tsx` | Po změně statusu přepočítat a uložit percent_tpv na projekt |

