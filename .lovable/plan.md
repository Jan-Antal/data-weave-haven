
## Plán: Oprava 0% utilizace v Analytics

### Diagnóza
Datově je vše v pořádku — prověřeno přímo v DB:
- `production_hours_log` má 8 983 záznamů (do 2026-04-18)
- Výrobní zaměstnanci (Dílna 1/2/3 + Sklad) jsou aktivní a jejich jména v logu sedí
- Režijní kódy (`Z-2511-99x`) jsou aktivní v `overhead_projects`
- `production_capacity` má řádky pro všechny týdny okna 30d

Replikace výpočtu v SQL dává `utilization30d ≈ 52.6 %` (1 424 projektových hodin / 2 709 h kapacity), ne 0 %.

### Pravděpodobná příčina
Frontend zobrazuje **stará data z cache React Query**. QueryKey je `["analytics", "utilization-v3-capacity"]` a nezměnil se od posledních úprav výpočtu, takže prohlížeč si mohl uchovat starý snapshot bez nových polí (před tím, než byly `production_capacity` data dostupná pro aktuální týden, nebo před zařazením překryvu zaměstnanců).

### Co uděláme

1. **Bump query key** v `src/hooks/useAnalytics.ts`
   - `["analytics", "utilization-v3-capacity"]` → `["analytics", "utilization-v4"]`
   - Vynutí fresh fetch a přepočet u všech klientů

2. **Přidat dočasné diagnostické logy** v `useAnalytics`
   - `console.info("[Analytics]", { p30, r30, cap30, util30d, productionEmpsCount, rawLogsCount })`
   - Uživatel pak otevře konzoli a uvidí, co reálně vyleze (nebo se logy odstraní hned po ověření)

3. **Drobná robustnost výpočtu kapacity**
   - Pokud `cap30 === 0` (např. kapacitní data ještě nebyla nahrána), nepouštět hodnotu 0 %, ale `null` → karta zobrazí "—" s tooltipem, ne matoucí "0 %"
   - To už děláno, ale ověřit, že `pctVsCap` vrací `null` korektně

4. **Po ověření** odstranit diagnostické logy a nechat jen bump query key + null-safe ošetření.

### Soubory
- `src/hooks/useAnalytics.ts` (jediná změna)

### Po nasazení
Otevři Analytics → konzole prohlížeče → pošli mi řádek `[Analytics] {...}`. Z těch čísel hned uvidím, jestli problém zmizel díky bumpnutí cache, nebo jestli je nějaký další bug v reálném prohlížečovém prostředí (např. lokalizace data).
