/**
 * Helpers for single-stage / multi-stage project display logic.
 *
 * Single-stage (≤1 stage): project row shows stage data directly.
 * Multi-stage (≥2 stages): project row shows summary / aggregated data.
 */
import type { ProjectStage } from "@/hooks/useProjectStages";
import { parseAppDate } from "@/lib/dateFormat";

export interface ProjectDisplayOverrides {
  /** If true, the project has a single stage and the row should act as one line */
  isSingleStage: boolean;
  /** The single stage (when isSingleStage=true) */
  singleStage: ProjectStage | null;
  /** Summary status text for multi-stage (e.g. "Výroba (+2)") */
  statusSummary: string | null;
  /** Base status label (without "+N" suffix) for color lookup */
  statusBase: string | null;
  /** Total prodejni_cena across stages */
  totalPrice: number | null;
  /** Latest datum_smluvni across stages */
  latestDatumSmluvni: string | null;
  /** PM summary for multi-stage (names joined by " / ") */
  pmSummary: string | null;
  /** Kalkulant summary for multi-stage (names joined by " / ") */
  kalkulantSummary: string | null;
  /** Konstruktér summary for multi-stage (names joined by " / ") */
  konstrukterSummary: string | null;
  /** Weighted average margin across stages in STORAGE format (decimal, e.g. 0.25 = 25%) */
  weightedMarze: number | null;
  /** Average percent_tpv across stages (for multi-stage projects) */
  percentTpvAvg: number | null;
}

/**
 * Compute display overrides for a project row based on its stages.
 */
export function getProjectDisplayOverrides(
  stages: ProjectStage[] | undefined
): ProjectDisplayOverrides {
  const stageList = stages ?? [];

  if (stageList.length <= 1) {
    return {
      isSingleStage: true,
      singleStage: stageList[0] ?? null,
      statusSummary: null,
      statusBase: null,
      totalPrice: null,
      latestDatumSmluvni: null,
      pmSummary: null,
      kalkulantSummary: null,
      konstrukterSummary: null,
      weightedMarze: null,
      percentTpvAvg: null,
    };
  }

  // Multi-stage: compute summaries
  const statuses = new Set(stageList.map(s => s.status).filter(Boolean));
  let statusSummary: string | null = null;
  let statusBase: string | null = null;
  if (statuses.size === 1) {
    statusBase = [...statuses][0]!;
    statusSummary = statusBase;
  } else if (statuses.size > 1) {
    statusBase = stageList.find(s => s.status)?.status ?? "";
    statusSummary = `${statusBase} (+${statuses.size - 1})`;
  }

  // Total price
  const totalPrice = stageList.reduce((sum, s) => sum + (s.prodejni_cena ?? 0), 0) || null;

  // Latest datum_smluvni
  let latestDatumSmluvni: string | null = null;
  let latestDate: Date | null = null;
  for (const s of stageList) {
    if (s.datum_smluvni) {
      const d = parseAppDate(s.datum_smluvni);
      if (d && (!latestDate || d > latestDate)) {
        latestDate = d;
        latestDatumSmluvni = s.datum_smluvni;
      }
    }
  }

  // Helper to join unique non-empty values with " / "
  const joinUnique = (vals: (string | null | undefined)[]) => {
    const unique = [...new Set(vals.filter(Boolean))];
    if (unique.length === 0) return null;
    return unique.join(" / ");
  };

  const pmSummary = joinUnique(stageList.map(s => s.pm));
  const kalkulantSummary = joinUnique(stageList.map(s => s.kalkulant));
  const konstrukterSummary = joinUnique(stageList.map(s => s.konstrukter));

  // Weighted average margin: Σ(price_i × margin_i) / Σ(price_i)
  // Result is in STORAGE/decimal format (e.g. 0.25 = 25%)
  const totalWeight = stageList.reduce((acc, s) => acc + (s.prodejni_cena ?? 0), 0);
  let weightedMarze: number | null = null;
  if (totalWeight > 0) {
    const weightedSum = stageList.reduce((acc, s) => {
      const price = s.prodejni_cena ?? 0;
      // marze is stored as decimal (0.25) or percentage (25) — normalize to decimal
      const raw = s.marze ? parseFloat(String(s.marze).replace(",", ".")) : 0;
      const decimal = raw > 1 ? raw / 100 : raw;
      return acc + price * decimal;
    }, 0);
    // Result in decimal, rounded to 3 decimal places (e.g. 0.253)
    weightedMarze = Math.round((weightedSum / totalWeight) * 1000) / 1000;
  }

  // Average percent_tpv across stages (include 0% stages, only skip null)
  const stagesWithPct = stageList.filter(s => s.percent_tpv != null);
  const percentTpvAvg = stagesWithPct.length > 0
    ? Math.round(stagesWithPct.reduce((sum, s) => sum + (s.percent_tpv ?? 0), 0) / stagesWithPct.length)
    : null;

  return {
    isSingleStage: false,
    singleStage: null,
    statusSummary,
    statusBase,
    totalPrice,
    latestDatumSmluvni,
    pmSummary,
    kalkulantSummary,
    konstrukterSummary,
    weightedMarze,
    percentTpvAvg,
  };
}
