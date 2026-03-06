/**
 * Stage Inheritance System — Clean rewrite
 *
 * Tracks which stage fields are inherited from the parent project
 * using a `manually_edited_fields` JSON array on each stage record.
 */
import type { ProjectStage } from "@/hooks/useProjectStages";
import type { Project } from "@/hooks/useProjects";

// ── Field classification ─────────────────────────────────────────────

/** Read-only inherited fields — always show parent value, normal font */
export const READ_ONLY_INHERITED = new Set(["project_name", "klient"]);

/** Editable inherited fields — copied from parent on creation, gray until manually edited */
export const EDITABLE_INHERITED = new Set([
  "display_name", "kalkulant", "pm", "status", "start_date", "datum_smluvni",
  "tpv_date", "expedice", "montaz", "predani",
  "architekt", "konstrukter", "risk", "zamereni",
]);

/** NOT inherited — always start empty, always normal font */
export const NOT_INHERITED = new Set([
  "prodejni_cena", "marze", "narocnost", "hodiny_tpv",
  "percent_tpv", "pm_poznamka", "tpv_poznamka",
]);

/**
 * Maps stage field keys to their parent project field keys
 * when the names differ between stage and project.
 */
export const STAGE_TO_PROJECT_FIELD: Record<string, string> = {
  start_date: "datum_objednavky",
  display_name: "project_name",
};

/** Reverse: project field → stage field */
export const PROJECT_TO_STAGE_FIELD: Record<string, string> = {
  datum_objednavky: "start_date",
  project_name: "display_name",
};

// ── manually_edited_fields helpers ───────────────────────────────────

/** Read the manually_edited_fields array from a stage */
export function getEditedFields(stage: ProjectStage): string[] {
  const raw = (stage as any).manually_edited_fields;
  if (Array.isArray(raw)) return raw;
  return [];
}

/** Check if a field has been manually edited */
export function isFieldManuallyEdited(stage: ProjectStage, field: string): boolean {
  return getEditedFields(stage).includes(field);
}

/** Add a field to the manually_edited_fields array (returns new array) */
export function addEditedField(stage: ProjectStage, field: string): string[] {
  const current = getEditedFields(stage);
  if (current.includes(field)) return current;
  return [...current, field];
}

// ── Display value logic ──────────────────────────────────────────────

/**
 * Get the display value for a stage field.
 * - READ_ONLY_INHERITED: always from parent project
 * - EDITABLE_INHERITED: stage's own value (which was copied at creation)
 * - NOT_INHERITED: stage's own value
 */
export function getStageDisplayValue(
  stage: ProjectStage, project: Project, field: string
): any {
  if (READ_ONLY_INHERITED.has(field)) {
    return (project as any)[field] ?? null;
  }
  // For editable inherited and non-inherited, always use stage's own value
  return (stage as any)[field] ?? null;
}

// ── CSS class logic ──────────────────────────────────────────────────

/**
 * Returns the CSS class for a stage field value.
 * - READ_ONLY_INHERITED: empty (normal dark font)
 * - EDITABLE_INHERITED + NOT manually edited: gray
 * - EDITABLE_INHERITED + manually edited: empty (normal)
 * - NOT_INHERITED: empty (normal)
 */
export function stageFieldClass(
  stage: ProjectStage, field: string
): string {
  if (READ_ONLY_INHERITED.has(field)) return "";
  if (!EDITABLE_INHERITED.has(field)) return "";
  return isFieldManuallyEdited(stage, field) ? "" : "text-muted-foreground";
}

// ── Values to copy on stage creation ─────────────────────────────────

/**
 * Build the initial field values for a new stage, copying from parent project.
 * Only copies EDITABLE_INHERITED fields that have a value on the project.
 */
export function buildInheritedStageData(
  project: Project
): Record<string, any> {
  const data: Record<string, any> = {};
  for (const field of EDITABLE_INHERITED) {
    const projectField = STAGE_TO_PROJECT_FIELD[field] || field;
    const val = (project as any)[projectField];
    if (val != null && val !== "") {
      data[field] = val;
    }
  }
  return data;
}

/**
 * Returns the set of field names that were actually inherited (had values on parent).
 * Used for the creation animation.
 */
export function getInheritedFieldKeys(project: Project): Set<string> {
  const keys = new Set<string>();
  for (const field of EDITABLE_INHERITED) {
    const projectField = STAGE_TO_PROJECT_FIELD[field] || field;
    const val = (project as any)[projectField];
    if (val != null && val !== "") {
      keys.add(field);
    }
  }
  return keys;
}
