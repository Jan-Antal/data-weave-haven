import type { ProjectStage } from "@/hooks/useProjectStages";
import type { Project } from "@/hooks/useProjects";

/**
 * Maps stage field keys to their parent project field keys.
 * Fields not listed here use the same key name on both stage and project.
 */
const STAGE_TO_PROJECT_FIELD: Record<string, string> = {
  start_date: "datum_objednavky",
};

/** Fields that can be inherited from parent project */
const INHERITABLE_STAGE_FIELDS = new Set([
  "status", "risk", "zamereni", "tpv_date", "expedice", "montaz",
  "predani", "datum_smluvni", "konstrukter", "narocnost", "architekt",
  "start_date",
]);

/** Fields always shown from parent (stage doesn't have its own column) */
const PARENT_ONLY_FIELDS = new Set(["klient", "location"]);

/**
 * Check if a stage field is inherited (stage's own value is null/empty
 * but parent has a value).
 */
export function isStageFieldInherited(
  stage: ProjectStage, project: Project, field: string
): boolean {
  if (PARENT_ONLY_FIELDS.has(field)) return true;
  if (!INHERITABLE_STAGE_FIELDS.has(field)) return false;

  const stageVal = (stage as any)[field];
  if (stageVal != null && stageVal !== "" && String(stageVal).trim() !== "") return false;

  const projectField = STAGE_TO_PROJECT_FIELD[field] || field;
  const projectVal = (project as any)[projectField];
  return projectVal != null && projectVal !== "";
}

/**
 * Get the display value for a stage field — own value if set,
 * otherwise fall back to parent project value.
 */
export function getStageDisplayValue(
  stage: ProjectStage, project: Project, field: string
): any {
  if (PARENT_ONLY_FIELDS.has(field)) {
    return (project as any)[field] ?? null;
  }

  const stageVal = (stage as any)[field];
  if (stageVal != null && stageVal !== "" && String(stageVal).trim() !== "") {
    return stageVal;
  }

  const projectField = STAGE_TO_PROJECT_FIELD[field] || field;
  return (project as any)[projectField] ?? null;
}

/** CSS class for inherited (gray) vs own (normal) stage field text */
export function inheritedTextClass(
  stage: ProjectStage, project: Project, field: string
): string {
  return isStageFieldInherited(stage, project, field) ? "text-muted-foreground/60" : "";
}
