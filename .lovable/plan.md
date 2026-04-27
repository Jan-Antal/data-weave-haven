## Cieľ
Vytvoriť novú edge funkciu `daily-report`, ktorá vracia per-bundle plán + denné logy s `weekly_goal_pct` (rovnaké čísla ako Dílna: A-6=68%, D-1=15% atď.).

## Zdroj dát
SQL funkcia `public.get_daily_report(report_date date)` už existuje a per-bundle goal % počíta správne (overené). Edge funkcia bude tenký wrapper okolo nej + obohatenie o agregát po projektoch.

## Endpoint
`GET /functions/v1/daily-report?date=YYYY-MM-DD`
- `date` voliteľné, default = dnes (Europe/Prague, lokálny dátum, žiadne `toISOString`)
- Auth: vyžaduje JWT (validácia v kóde cez SUPABASE_JWKS), ako ostatné interné funkcie

## Response shape
```json
{
  "report_date": "2026-04-27",
  "rows": [ /* surové riadky z get_daily_report */ ],
  "by_project": [
    {
      "project_id": "Z-2617-001",
      "project_name": "Allianz",
      "total_plan_hours": 1234,
      "bundles": [
        { "bundle_id": "...", "bundle_label": "A", "bundle_display_label": "A-6",
          "split_part": "6", "scheduled_week": "2026-04-27",
          "scheduled_hours": 161.8, "weekly_goal_pct": 68,
          "logs": [ { "phase": "...", "percent": 50, "is_on_track": false,
                       "note_text": "...", "logged_at": "..." } ] }
      ]
    }
  ]
}
```

## Implementácia (`supabase/functions/daily-report/index.ts`)
1. CORS preflight + JSON response helpers (vzor podľa `project-summary`).
2. Validácia inputu Zodom (`date` = optional ISO date).
3. Service-role klient → `supabase.rpc('get_daily_report', { report_date })`.
4. Roztriediť `row_kind = 'plan' | 'log'`, zoskupiť do `by_project` → `bundles` → `logs`.
5. Vrátiť aj raw `rows` (pre flexibilitu konzumentov ako AMI/Slack).
6. Žiadne nové RPC, žiadne migrácie.

## config.toml
Pridať blok pre `daily-report` len ak treba override (default `verify_jwt = false` postačí, validácia JWT v kóde). Inak nemeniť.

## Test plán
Po deployi `curl_edge_functions` na `/daily-report?date=2026-04-27` a overiť, že:
- Allianz A-6 má `weekly_goal_pct = 68`
- Allianz D-1 má `weekly_goal_pct = 15`
- Allianz B (full bundle) má `weekly_goal_pct = 100`