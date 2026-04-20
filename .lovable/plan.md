

## Zjednotenie farebnej logiky progressu: Výroba vs Analytics Dílna

### Súčasný stav (rozdiel)

**Modul Výroba** — semafor (3 stavy podľa očakávaného dnešného progressu):
- `getProjectStatus(pid)` v `src/pages/Vyroba.tsx` (riadky ~998-1023)
- Porovnáva **`bundleProgress`** (% dokončené v daylogoch tento týždeň) vs **`expectedPct`** (chain-window fraction dňa):
  - `bundleProgress >= expected − 10` → 🟢 **on-track** (#3a8a36)
  - `bundleProgress >= expected − 25` → 🟠 **at-risk** (#d97706)
  - inak → 🔴 **behind** (#dc2626)
- Spilled projekty automaticky `behind`.

**Analytics Dílna** — všetko zelené, lebo:
- `computeSlip(trackedPct, completionPct, loggedHours)` v `DilnaDashboard.tsx` (riadky ~376-383)
- Porovnáva **`trackedPct`** (loggedHours / plannedHours týždňa) vs **`completionPct`** (posledný daylog %):
  - `diff > 20` → delay (červená)
  - `diff > 5` → slip (oranžová)
  - inak → ok (**zelená**)
- **Problém:** Nezohľadňuje `expectedPct` (kde dnes mám byť). Ak má projekt low completion (napr. 30 %) ale aj nízke logované hodiny (napr. 25 % planu), `diff = -5` → **„V plánu" zelená**, hoci v skutočnosti je výrazne pod očakávaným dnešným cieľom (napr. 60 %). Zároveň už máme v Dílna spočítaný `expectedPct` (turkysová ryska), ale do farby slipStatus nevstupuje.

### Návrh zjednotenia

Zladiť **Analytics Dílna** s logikou Výroby — používať rovnaké tolerancie a **`expectedPct`** ako referenciu (nie `trackedPct`). Tým získame jednotnú „semafor" interpretáciu naprieč modulmi.

**Zmena v `src/components/DilnaDashboard.tsx`:**

1. **Refactor `computeSlip()`** — nový podpis a logika:
   ```ts
   function computeSlip(
     completionPct: number | null,
     expectedPct: number | null,
     loggedHours: number,
     isSpilled: boolean
   ): SlipStatus {
     if (isSpilled) return "delay";
     if (loggedHours <= 0 && expectedPct === null) return "none";
     if (completionPct == null) return "none";
     const ref = expectedPct ?? 100;
     if (completionPct >= ref - 10) return "ok";       // 🟢
     if (completionPct >= ref - 25) return "slip";     // 🟠 (premapované na "at-risk")
     return "delay";                                    // 🔴
   }
   ```

2. **Volanie `computeSlip()`** (riadok ~265) zmeniť tak, aby dostalo `card.expectedPct` namiesto `trackedPct`. (Spilled detekcia: porovnať či projekt nemá `scheduled_week === weekKey` v `production_schedule` — ak má len staršie naplánované týždne s `paused`/`in_progress`, považovať za spilled. Túto informáciu už máme v rámci `chainWindowByProject`.)

3. **Tolerancie** zjednotiť na konštanty:
   - `SLIP_OK_TOL = 10` (dnes v Dílna 5 → zarovnať s Výrobou)
   - `SLIP_RED = 25` (dnes 20 → zarovnať)

4. **Labels** ponechať existujúce (`V plánu` / `Ve skluzu` / `V omeškání` / `Bez logu`) — výrazovo zodpovedajú on-track/at-risk/behind z Výroby.

5. **Farby** ponechať — paleta je už rovnaká (#3a8a36 / #d97706 / #dc2626).

### Validácia (po implementácii)

- Projekt s completion 30 % a expected 60 % → predtým „V plánu" zelená, po zmene **červená „V omeškání"** (rovnako ako vo Výrobe).
- Projekt s completion 55 % a expected 60 % → **zelená „V plánu"** (diff −5, v tolerancii).
- Projekt bez daylogu → „Bez logu" sivá (nezmenené).
- Spilled projekt → vždy červená (nové, zjednotené s Výrobou).
- Počet `delayCount` / `slipCount` v hlavičke Dílna by sa mal zvýšiť oproti súčasnému stavu, kde je takmer všetko zelené.

### Dotknuté súbory

- `src/components/DilnaDashboard.tsx` — `computeSlip()` signatúra, jej volanie, prípadne malý helper na detekciu „spilled" projektu.

### Mimo scope

- Logika `expectedPct` (chain-window fraction) sa nemení.
- Logika `bundleProgress` vo Výrobe sa nemení.
- Sortovanie kariet v Dílna ostáva (delay → slip → ok → off_plan → unmatched).

