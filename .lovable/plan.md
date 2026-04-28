# Daily-report endpoint pre n8n Slack workflow

## Cieľ
Umožniť n8n volať existujúcu edge funkciu `daily-report` pomocou shared-secret hlavičky (bez user JWT, bez service-role kľúča), aby si mohol postaviť denný Slack report výroby s rovnakými dátami ako Analytics → Dílna.

## Čo sa zmení

### 1. `supabase/functions/daily-report/index.ts` — pridať shared-secret bypass
Pred existujúcou JWT validáciou skontrolovať hlavičku `x-report-secret`. Ak sa zhoduje s hodnotou env premennej `DAILY_REPORT_SECRET`, JWT check sa preskočí. Inak pôvodné správanie ostáva bezo zmeny (UI v aplikácii ďalej funguje cez user JWT).

```ts
const sharedSecret = Deno.env.get("DAILY_REPORT_SECRET");
const providedSecret = req.headers.get("x-report-secret");
const isMachineCall = !!sharedSecret && providedSecret === sharedSecret;

if (!isMachineCall) {
  // existing user-JWT validation (Authorization: Bearer ...)
}
```

Žiadna iná zmena v správaní funkcie — ten istý JSON response (`report_date`, `rows`, `by_project`).

### 2. Pridať runtime secret `DAILY_REPORT_SECRET`
Po schválení tohto plánu otvorím prompt na pridanie secretu — vygeneruješ / vložíš hodnotu (napr. silný náhodný reťazec). Tú istú hodnotu si potom uložíš do n8n credentials.

### 3. `supabase/config.toml` — bez zmeny
`verify_jwt = false` pre `daily-report` už je nastavené, netreba nič meniť.

## Ako to bude n8n volať

```
GET https://jvkuqvwmrzttelxkhrwr.supabase.co/functions/v1/daily-report
  ?date=2026-04-28        ← voliteľné, default = dnes (Europe/Prague)

Headers:
  Authorization:  Bearer <SUPABASE_ANON_KEY>   ← required by Supabase API gateway
  apikey:         <SUPABASE_ANON_KEY>
  x-report-secret: <DAILY_REPORT_SECRET>       ← naša shared-secret kontrola
```

Anon key je v projekte aj tak public (frontend ho používa). Skutočná autorizácia je `x-report-secret`.

## Mapovanie odpovede na Slack message

`response.by_project[].bundles[]` obsahuje všetko, čo potrebuješ:

| Pole | Slack zobrazenie |
|---|---|
| `project_name` | nadpis sekcie |
| `bundle_display_label` | napr. `A-4`, `B`, `D-1` |
| `logs[0].phase` | aktuálna fáza |
| `logs[0].percent` | aktuálne % |
| `weekly_goal_pct` | cieľové % na dnešok |
| `logs[0].is_on_track` | ✅ / ❌ |
| `logs[0].note_text` | poznámka (ak je) |
| `logs.length === 0` | ⚠️ bundle bez logu |

## Testovanie po nasadení
Spravím curl test cez `supabase--curl_edge_functions` s hlavičkou `x-report-secret`, aby sme overili, že to vracia očakávaný `by_project` JSON.

## Dotknuté súbory
- `supabase/functions/daily-report/index.ts` (úprava auth)
- nový secret `DAILY_REPORT_SECRET` (pridáš ty po prompte)
