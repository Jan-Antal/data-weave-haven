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

  if (activeHighlight === "overdue" && severity === "overdue") return "hsl(0, 70%, 55%)";
  if (activeHighlight === "upcoming" && severity === "upcoming") return "#EA592A";
  if (activeHighlight === "high-risk" && (project.risk === "High")) return "#EAB308";

  return null;
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
