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
  /** Total prodejni_cena across stages */
  totalPrice: number | null;
  /** Latest datum_smluvni across stages */
  latestDatumSmluvni: string | null;
  /** PM summary for multi-stage */
  pmSummary: string | null;
  /** Weighted average margin across stages (1 decimal) */
  weightedMarze: number | null;
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
      totalPrice: null,
      latestDatumSmluvni: null,
      pmSummary: null,
    };
  }

  // Multi-stage: compute summaries
  const statuses = new Set(stageList.map(s => s.status).filter(Boolean));
  let statusSummary: string | null = null;
  if (statuses.size === 1) {
    statusSummary = [...statuses][0]!;
  } else if (statuses.size > 1) {
    const first = stageList.find(s => s.status)?.status ?? "";
    statusSummary = `${first} (+${statuses.size - 1})`;
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

  // PM summary
  const pms = new Set(stageList.map(s => s.pm).filter(Boolean));
  let pmSummary: string | null = null;
  if (pms.size === 1) {
    pmSummary = [...pms][0]!;
  } else if (pms.size > 1) {
    pmSummary = `${pms.size} PM`;
  }

  return {
    isSingleStage: false,
    singleStage: null,
    statusSummary,
    totalPrice,
    latestDatumSmluvni,
    pmSummary,
  };
}
