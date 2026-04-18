
## Plán: Správná logika utilizace v Analytics

### Vzorec
```
Utilizace = (Výrobní hodiny − Režijní hodiny) / Výrobní hodiny
```
- **Výrobní hodiny** = SUM `production_hours_log.hodiny` v okně, **bez** `cinnost_kod IN ('TPV','ENG','PRO')`
- **Režijní hodiny** = SUM hodin (stejné filtrování TPV/ENG/PRO), kde `ami_project_id ∈ aktivní overhead_projects.project_code`
- Časové okno = aktuální `timeRange` filtr (week / month / 3months / year / all)

### Změny

**1. `src/hooks/useAnalytics.ts`**
- Hook přijme `timeRange: TimeRange`
- Spočítat `rangeStart` (stejný helper jako v `AnalyticsBreakdownRow`)
- Načíst `production_hours_log` ve vybraném okně + aktivní `overhead_projects`
- Přeskočit záznamy s `cinnost_kod ∈ {TPV, ENG, PRO}`
- `totalHours` (výrobní), `overheadHours`, `productiveHours = total − overhead`
- `utilizationPct = totalHours > 0 ? round(productiveHours / totalHours * 100) : null`
- Vrátit v `summary`: `utilizationPct`, `totalHours`, `overheadHours`, `productiveHours`
- Bump key na `utilization-v6`
- Odstranit nepoužívanou kapacitní logiku (`cap30`, employee filtering, `isEmployeeActiveForLogDate`) — pro nový vzorec není potřeba

**2. `src/pages/Analytics.tsx`**
- Předat `timeRange` do `useAnalytics(timeRange)`
- Karta utilizace: titulek dle okna, podtitulek `{productiveHours} h produktivních z {totalHours} h výrobních · {overheadHours} h režie`
- Tooltip vysvětlí vzorec

### Soubory
- `src/hooks/useAnalytics.ts`
- `src/pages/Analytics.tsx`
