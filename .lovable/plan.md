
## Plán: 3 opravy — chýbajúce dni v grafe, geometria range selekcie, skrytie outside dní

### 1) Chýbajúce dni v grafe "Hodiny v čase" — Supabase row cap

**Príčina**: Query v `useQuery(["vykaz-log", ...])` používa `.range(0, 99999)` ale Supabase REST API má server-side hard cap (typicky 1000 riadkov per request). Pre marec 2026 existuje 1682 riadkov v `production_hours_log` → vráti len prvých 1000 (chronologicky skôr) a posledné dni v mesiaci vypadnú. Rovnaký pattern v každom mesiaci s viac ako ~1000 záznamami.

**Riešenie**: Stránkované načítanie v cykle (po 1000 riadkov, kým server vráti plný batch), s ORDER BY `datum_sync` aby sa pagination chovala deterministicky.

```ts
// Pseudo-implementácia v queryFn:
const PAGE = 1000;
let all: LogRow[] = [];
let offset = 0;
while (true) {
  const { data, error } = await supabase
    .from("production_hours_log")
    .select("ami_project_id,zamestnanec,cinnost_kod,cinnost_nazov,hodiny,datum_sync")
    .gte("datum_sync", from)
    .lte("datum_sync", to)
    .order("datum_sync", { ascending: true })
    .range(offset, offset + PAGE - 1);
  if (error) throw error;
  if (!data?.length) break;
  all = all.concat(data as LogRow[]);
  if (data.length < PAGE) break;
  offset += PAGE;
}
return all.filter((r) => !r.cinnost_kod || !EXCLUDED_CINNOST.has(r.cinnost_kod));
```

### 2) Geometria range selekcie v kalendári (kontinuálny pill)

**Súčasný stav** (screenshot 1): každý vybraný deň má vlastný oranžový bubble s roundingom zo všetkých strán → vyzerá ako separátne bunky.

**Cieľ** (screenshot 3 — fialová referencia): súvislá pill-tvarovaná lišta cez celý riadok. Začiatok riadka rounded vľavo, koniec rounded vpravo, stred bez radiusu, jeden súvislý fill.

**Zmeny v `src/components/ui/calendar.tsx` → `classNames`**:
- `cell`: pridať `[&:has([aria-selected])]:bg-primary/15` (kontinuálne pozadie cez celú šírku bunky bez gapov medzi dňami) a odstrániť/úpraviť pôvodné `[&:has([aria-selected])]:bg-transparent`
- `day_range_start`: `bg-primary text-primary-foreground rounded-l-md rounded-r-none`
- `day_range_end`: `bg-primary text-primary-foreground rounded-r-md rounded-l-none`
- `day_range_middle`: `bg-transparent text-foreground rounded-none hover:bg-primary/25` (parent `cell` poskytuje fill)
- `day_selected` (single = `from === to` alebo iba `from`): ponechať `rounded-md bg-primary` — react-day-picker aplikuje `day_selected` aj na single dátum
- `first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md` — ponechať (zaobľuje okraje riadka keď selekcia pokračuje cez koniec týždňa)

⚠️ Toto je shared `ui/calendar.tsx`, ovplyvní aj iné dialogy (PlanDateEditDialog, StageDateEditDialog) — vizuálne zlepšenie konzistentné s brand štýlom.

### 3) Skryť outside-month dni v kalendári

**Súčasný stav** (screenshot 1): dni z predchádzajúceho/nasledujúceho mesiaca (napr. "30, 31" v aprílovom paneli pre prev_month=marec) sú zobrazené šedo a niekedy s fill, čo pôsobí chaoticky.

**Cieľ**: outside dni úplne skryť (prázdne bunky), aby každý mesiac mal jasne vymedzený rámec.

**Zmeny len v inštancii `Calendar` v `VykazReport.tsx`** (nie globálne — iné dialogy môžu chcieť outside dni):
- Pridať prop `showOutsideDays={false}` (DayPicker default je true; náš wrapper ho explicitne odovzdáva, takže `false` zafunguje).

### Súbory
- `src/components/analytics/VykazReport.tsx` — query pagination + `showOutsideDays={false}` na Calendar
- `src/components/ui/calendar.tsx` — úpravy `classNames` pre kontinuálny range pill

### Bez zmien
- Žiadne zmeny v dátach, RLS, agregácii, exporte, iných sekciách
- Žiadne nové závislosti
