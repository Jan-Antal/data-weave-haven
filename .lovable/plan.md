

User wants AI as the **review/optimization layer** on top of the deterministic forecast. Two-stage pipeline: deterministic baseline → AI optimizer. Plus the hour-source fix is still required (1190 vs 561) otherwise AI gets garbage in.

Keep concise.

---

## Plán: AI Forecast jako 2-stage pipeline

### Cíl
Deterministický algoritmus připraví **návrh**, AI ho zreviduje a přeplánuje pro lepší flow (méně přepínání, dodržení deadline, vyhlazení kapacity).

### Architektura

```text
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ 1. Deterministic│ →  │ 2. AI Optimizer  │ →  │ 3. UI: blocks +  │
│  baseline       │    │  (Gemini Flash)  │    │  AI reasoning    │
│  (frontload)    │    │                  │    │                  │
└─────────────────┘    └──────────────────┘    └──────────────────┘
       ~500ms                ~3-5s                  user reviews
```

### Změny

**1) Sjednotit hodiny (kritické — bez toho AI dostane špatná čísla)**
- `forecast-schedule/index.ts`: použít `project_plan_hours.hodiny_plan` jako pravdu
- Odečíst už naplánované hodiny → forecast plánuje jen **zbývající**
- Vyřeší rozdíl Multisport 1190h vs 561h

**2) Nová edge funkce `forecast-ai-optimize`**
- Vstup: výstup z deterministického forecastu + projekty + kapacita
- Volá Lovable AI (`google/gemini-3-flash-preview`) přes tool calling
- Tool schema vrací: `{ blocks: [{ projectId, week, hours, reasoning }], warnings: [], summary: "..." }`
- Systémový prompt: priorita = nejbližší deadline, nepřekročit kapacitu, preferovat dokončení v jednom týdnu, vyhladit zatížení

**3) UI flow v `useForecastMode.ts` + `ForecastCommitBar`**
- Krok 1: tlačítko „Generovat" → běží deterministický (rychlý náhled)
- Krok 2: automaticky pokračuje do AI optimizace s indikátorem „🤖 AI optimalizuje..."
- Krok 3: zobrazí AI návrh + souhrn + warnings; uživatel vidí porovnání nebo rovnou commit
- Fallback: pokud AI selže (429/402/timeout), ponechat deterministický výsledek + toast „AI nedostupná, zobrazujem základní plán"

**4) Per-blok AI reasoning**
- Každý blok dostane `ai_reasoning: string` (např. „Posunuto z 4.5. na 11.5. — Multisport má dřívější deadline")
- Zobrazit v `ForecastCard` tooltipu nebo expandu

### Soubory k úpravě / vytvoření
- `supabase/functions/forecast-schedule/index.ts` — sjednocení hodin (bod 1)
- `supabase/functions/forecast-ai-optimize/index.ts` — **nová** AI funkce (bod 2)
- `src/hooks/useForecastMode.ts` — 2-stage volání + AI loading state
- `src/components/production/ForecastCommitBar.tsx` — indikátor AI fáze, „🤖 AI" badge
- `src/components/production/ForecastOverlay.tsx` — zobrazit `ai_reasoning` per blok

### Co se NEMĚNÍ
- DB schéma
- Commit logika (zápis do `production_schedule` zůstává)
- Vizuální styl bloků (zelené Inbox, oranžové Project)

### Náklady
- Default model `gemini-3-flash-preview`: ~3-5s, ~0.001 kreditu/spuštění
- Při velkém portfoliu (>50 projektů) automaticky přepnout na `gemini-2.5-pro` pro lepší rozhodování

### Co potvrdit
1. **Jdeme přes celé** (sjednocení hodin + AI optimizace + UI flow)?
2. **AI vždy automaticky**, nebo přepínač „Použít AI optimalizaci" (uživatel může vypnout pro rychlost)?
3. **Per-blok reasoning** v tooltipu — ano/ne?

