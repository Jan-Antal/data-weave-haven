import { parseAppDate } from "@/lib/dateFormat";

export type RiskHighlightType = "overdue" | "upcoming" | "high-risk" | null;

const COMPLETED_STATUSES = ["Fakturace", "Dokončeno"];

/**
 * Get the risk highlight color for a project row.
 * Returns the most severe color: red > orange > yellow.
 */
export function getProjectRiskColor(
  project: { datum_smluvni?: string | null; status?: string | null; risk?: string | null },
  activeHighlight: RiskHighlightType
): string | null {
  if (!activeHighlight) return null;

  const isCompleted = COMPLETED_STATUSES.includes(project.status || "");
  if (isCompleted) return null;

  const severity = getProjectRiskSeverity(project);

  if (activeHighlight === "overdue" && severity === "overdue") return RISK_COLORS["overdue"];
  if (activeHighlight === "upcoming" && severity === "upcoming") return RISK_COLORS["upcoming"];
  if (activeHighlight === "high-risk" && (project.risk === "High")) return RISK_COLORS["high-risk"];

  return null;
}

/** Dashboard-driven highlight for TPV Status tab (uses datum_tpv + tpv_risk) */
export function getTPVDashboardRiskColor(
  project: { datum_tpv?: string | null; tpv_risk?: string | null; risk?: string | null; status?: string | null },
  activeHighlight: RiskHighlightType
): { bg: string | null; dotColor: string | null } {
  if (!activeHighlight) return { bg: null, dotColor: null };

  const severity = getTPVRiskSeverity(project);
  if (!severity) return { bg: null, dotColor: null };

  if (activeHighlight === severity) {
    return { bg: RISK_COLORS[severity], dotColor: RISK_DOT_COLORS[severity] };
  }

  return { bg: null, dotColor: null };
}

export function getProjectRiskSeverity(
  project: { datum_smluvni?: string | null; status?: string | null; risk?: string | null }
): "overdue" | "upcoming" | "high-risk" | null {
  const isCompleted = COMPLETED_STATUSES.includes(project.status || "");
  if (isCompleted) return null;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (project.datum_smluvni) {
    const d = parseAppDate(project.datum_smluvni);
    if (d) {
      d.setHours(0, 0, 0, 0);
      if (d < now) return "overdue";
      const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (diff <= 14) return "upcoming";
    }
  }

  if (project.risk === "High") return "high-risk";
  return null;
}

/** TPV-specific severity using datum_tpv and tpv_risk fields */
export function getTPVRiskSeverity(
  project: { datum_tpv?: string | null; tpv_risk?: string | null; risk?: string | null; status?: string | null }
): "overdue" | "upcoming" | "high-risk" | null {
  const isCompleted = COMPLETED_STATUSES.includes(project.status || "");
  if (isCompleted) return null;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (project.datum_tpv) {
    const d = parseAppDate(project.datum_tpv);
    if (d) {
      d.setHours(0, 0, 0, 0);
      if (d < now) return "overdue";
      const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (diff <= 14) return "upcoming";
    }
  }

  const riskField = project.tpv_risk || project.risk;
  if (riskField === "High") return "high-risk";
  return null;
}

const RISK_COLORS: Record<string, string> = {
  overdue: "#fde8e8",
  upcoming: "#fef0e0",
  "high-risk": "#fefae0",
};

const RISK_DOT_COLORS: Record<string, string> = {
  overdue: "hsl(0, 70%, 55%)",
  upcoming: "#EA592A",
  "high-risk": "#EAB308",
};

export function getTPVRiskRowStyle(
  project: { datum_tpv?: string | null; tpv_risk?: string | null; risk?: string | null; status?: string | null }
): { bg: string | null; dotColor: string | null } {
  const severity = getTPVRiskSeverity(project);
  if (!severity) return { bg: null, dotColor: null };
  return { bg: RISK_COLORS[severity], dotColor: RISK_DOT_COLORS[severity] };
}
