
Cíl: opravit výpočet kapacit v záložce Kapacita tak, aby správně zohledňoval absence, aktivaci/deaktivaci zaměstnanců a aby „Složení výrobní kapacity“ ukazovalo skutečně dostupné lidi a hodiny pro vybraný týden.

1. Co jsem ověřil
- V DB je pro T16/2026 v `production_capacity` uložené:
  - `capacity_hours = 830`
  - `absence_days = 0`
  - `total_employees = 26`
  - `usek_breakdown.Kompletace = 580`
- Ale v `ami_absences` pro týden 13. 4. – 17. 4. 2026 reálně jsou absence:
  - Kompletace: 2 lidi celý týden off (`RD`, `NEM`) + další dovolená
  - Lakovna: 1 člověk celý týden `NEM`
  - Strojová dílna: 1 člověk celý týden `NEM` + další dny `DOV`
  - další absence i v jiných úsecích
- To potvrzuje, že současný výpočet je špatně a user report je validní.

2. Hlavní root cause
- Kritická chyba je v práci s `week_start`:
  - `useWeeklyCapacity.ts` ukládá `week_start` přes `toISOString().split("T")[0]`
  - v CZ timezone se Monday posouvá na Sunday
  - takže např. T16 je v DB `2026-04-12`, ale absence jsou agregované na Monday key `2026-04-13`
  - výsledok: `absMap.get(weekStart)` vrací 0 a absence sa vôbec neodčítajú
- Druhá chyba:
  - `getActiveWorkingDays()` řeší jen `deactivated_at`, ignoruje `activated_at` a `deactivated_date`
- Třetí chyba:
  - breakdown tabulka i `usek_breakdown` počítají hrubé hodiny na zaměstnance, ne netto po absencích
  - proto dnes vidíš Kompletace 15/15 místo očekávaných 13/15

3. Implementační plán
- `src/hooks/useWeeklyCapacity.ts`
  - nahradit všechny UTC/ISO převody lokálním date helperem
  - sjednotit generování `week_start` na lokální pondělí
  - tím se opraví match mezi `production_capacity.week_start` a absencemi
- `src/hooks/useCapacityCalc.ts`
  - rozšířit logiku aktivity zaměstnance:
    - zohlednit `activated_at`
    - zohlednit `deactivated_at` i `deactivated_date`
  - místo pouhého týdenního součtu absencí připravit per-employee/per-week absence mapu
  - přepočet dělat na úrovni jednotlivého člověka:
    - brutto hodiny týdne
    - mínus absence konkrétního zaměstnance
    - netto hodiny zaměstnance pro daný týden
  - `computeWeekCapacity()` upravit tak, aby:
    - `byUsek` bylo netto po absencích
    - `totalEmployees` znamenalo skutečně dostupné lidi v týdnu (hodiny > 0)
    - absence nešla jen globálně odečtem na konci
- `src/components/production/CapacitySettings.tsx`
  - summary cards navázat na nový jednotný per-week výpočet
  - „Složení výrobní kapacity“ přepnout na netto data:
    - Kompletace v T16 má ukázat 13/15, ne 15/15
    - zaměstnanec s celotýdenní `NEM`/`RD` nebude počítaný jako aktivní
    - částečné absence sníží hodiny, ale člověk zůstane viditelný
  - tooltipy barů a live graf brát ze stejného zdroje pravdy
  - `absence_days` už nepočítat přes hrubé `hours / 8`, ale z reálných absence rows / person-days
- Persistovaná data
  - po opravě výpočtu přegenerovat uložené řádky v `production_capacity`, hlavně:
    - `week_start`
    - `capacity_hours`
    - `absence_days`
    - `total_employees`
    - `usek_breakdown`

4. Co se nebude měnit
- UI struktura tabu Kapacita
- manuální override sekce
- navigace grafu
- scope zůstává jen `Výroba Direct` a členění po `usek_nazov`

5. Očekávaný výsledok po opravě
- graf už nebude „flat 830“, ale sníží se v týdnech s absencemi
- T16 bude mít správně odečtené NEM/RD/DOV
- summary cards nahoře budou odpovídat vybranému týdnu
- breakdown tabulka bude ukazovat skutečně dostupné lidi a hodiny po úsecích
- uložené hodnoty v `production_capacity` budou konečně konzistentní s absencemi

6. Technické detaily
- Největší bug není v samotné DB absencí, ale v nesouladu klíčů týdne:
  - DB capacity: Sunday key
  - absence map: Monday key
- Bez opravy `week_start` budou absence dál mizet i kdyby byla zbylá logika správná.
- Nepředpokládám novou tabulku ani schema změnu; stačí oprava výpočtu + přepočet existujících řádků.
