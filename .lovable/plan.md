# Oprava `cieľ 0%` v Slack daily reporte

## Diagnóza

V tvojom výstupe sa pri log riadkoch vždy ukazuje `cieľ 0%`:

```
✅ B · CNC · 80% / cieľ 0%        ← Insia
✅ — · Řezání · 75% / cieľ 0%     ← Allianz
```

Overené dotazom na DB. Existujú **dva rôzne dôvody**:

### Dôvod 1 — log na bundle, ktorý nie je v plán-okne tohto týždňa
Príklad: Insia má dnes log pre **bundle B** (CNC 80 %), ale `production_schedule` v týždni `2026-04-27` má pre Insia **len A-4** (B vôbec nie je naplánované v aktívnom týždni). LATERAL join v `get_daily_report` nenájde `bundle_goal` → vráti 0.

To isté Allianz log B 22 %.

### Dôvod 2 — log na split-group bundle (`SG:<uuid>` formát)
Niektoré bundle_id v `production_daily_logs` majú formát `Z-2604-002::2026-04-27::SG:<uuid>` (3 segmenty), nie `project::week::stage::label::split` (5 segmentov). SQL parser v `get_daily_report` z týchto vyrobí `bundle_label = ''` (NULL) → v Slacku sa zobrazia ako `—` a goal je 0.

Príklady z dnešných logov:
- `Z-2604-002::2026-04-27::SG:6e4c7c2e-...` → log s percent 12, ale bez bundle_label
- `Z-2607-008::2026-04-27::SG:a5804482-...` → 50 %
- `Z-2617-001::2026-04-27::SG:c722ec3f-...` → 75 %

## Riešenie (2 zmeny v `public.get_daily_report`)

### Zmena A — parsovanie split-group bundle_id
Pridať detekciu `SG:<uuid>` formátu v `todays_logs` CTE: ak druhý-od-konca segment začína `SG:`, vyhľadať príslušný `split_group_id` v `production_schedule` a doplniť `bundle_label` + `split_part` z plánu. Tým sa stratené `—` riadky priradia k svojmu bundlu (napr. A-3 namiesto `—`).

### Zmena B — fallback goal_pct pre logy mimo aktuálneho týždňa
V LATERAL `bg2` rozšíriť hľadanie o **akýkoľvek aktívny bundle** s daným `(project_id, bundle_label, split_part)` v ľubovoľnom otvorenom týždni — nielen v `bundles_in_week`. Ak žiadny otvorený bundle neexistuje (napr. všetko completed/expedice), vrátiť `NULL` namiesto 0, aby n8n vedel rozlíšiť „cieľ 0 %“ od „cieľ neznámy/nerelevantný“.

### Zmena C (n8n strana, dokumentácia v odpovedi)
V Slack šablóne:
- Ak `weekly_goal_pct === null` → zobrazovať `bez cieľa` namiesto `cieľ 0%`.
- Ak `weekly_goal_pct === 0` (legitímne, bundle existuje ale je na začiatku) → ponechať `cieľ 0%`.

## Čo sa dotkne / čo sa nezmení

- **Dotkne sa**: SQL funkcia `public.get_daily_report` (jeden migration step). Edge function `daily-report` zostáva nezmenená — len konzumuje opravené dáta.
- **Nezmení sa**: Analytics → Dílna používa iný hook (`useProductionDailyLogs`), preto sa UI v appe nezmení. Žiadny dopad na plánovanie, kanban ani inbox.
- **Bezpečnosť**: Funkcia je `STABLE`, žiadny RLS dopad — naďalej beží cez service_role v edge funkcii.

## Kroky implementácie

1. Migration: prepísať `public.get_daily_report` so zmenami A+B.
2. Otestovať `supabase--read_query` na dnešný dátum — overiť že:
   - Insia log B má teraz `weekly_goal_pct` z plán-okna iného týždňa alebo NULL (nie 0).
   - SG-formát logy získali `bundle_label` (Z-2604-002 → A-3, atď.).
3. `curl` edge funkcie s `x-report-secret` na overenie payload formátu.
4. Poskytnúť ti aktualizovaný n8n JS snippet s `null`-aware vetvou pre cieľ.

## Otázka pred implementáciou

Pri logoch na bundle, ktorý **nikde nemá aktívny plán** (napr. čisto ad-hoc "Bez výroby" log na uzavretý/neexistujúci bundle), preferuješ:

- **(a)** Skryť ich úplne zo Slack reportu (sú to šum)
- **(b)** Zobraziť s `bez cieľa` (transparentnosť)
- **(c)** Zobraziť s `cieľ 0%` (dnešný stav)

Default odporúčam **(b)**.
