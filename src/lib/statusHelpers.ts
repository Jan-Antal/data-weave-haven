import type { ProjectStatusOption } from "@/hooks/useProjectStatusOptions";

/**
 * Returns a Set of status labels considered "terminal" (done/finished).
 * Terminal = the last N statuses by sort_order where N defaults to 3
 * (typically: Expedice, Fakturace, Dokončeno).
 * Falls back to hardcoded list if no options loaded.
 */
export function getTerminalStatuses(
  statusOptions: ProjectStatusOption[],
  lastN = 3
): Set<string> {
  if (!statusOptions.length) {
    return new Set(["Fakturace", "Dokončeno", "Dokonceno", "Expedice"]);
  }
  const sorted = [...statusOptions].sort((a, b) => a.sort_order - b.sort_order);
  const terminal = sorted.slice(-lastN).map((s) => s.label);
  return new Set(terminal);
}

/**
 * Checks if a project status is terminal (done/finished).
 */
export function isTerminalStatus(
  status: string | null | undefined,
  statusOptions: ProjectStatusOption[]
): boolean {
  const terminals = getTerminalStatuses(statusOptions);
  return terminals.has(status ?? "");
}

/**
 * Returns the default status label (first by sort_order).
 */
export function getDefaultStatus(statusOptions: ProjectStatusOption[]): string {
  if (!statusOptions.length) return "Příprava";
  const sorted = [...statusOptions].sort((a, b) => a.sort_order - b.sort_order);
  return sorted[0].label;
}

/**
 * Returns the last status label (hidden by default in filters).
 */
export function getHiddenByDefaultStatuses(statusOptions: ProjectStatusOption[]): string[] {
  // Only hide "Dokončeno" by default
  const dokonceno = statusOptions.find((s) => s.label === "Dokončeno");
  if (dokonceno) return [dokonceno.label];
  if (!statusOptions.length) return ["Dokončeno"];
  return [];
}

/**
 * Returns statuses considered "excluded" from active pipeline
 * (the last 3 by sort_order + "On Hold").
 */
export function getExcludedStatuses(statusOptions: ProjectStatusOption[]): Set<string> {
  const terminals = getTerminalStatuses(statusOptions, 3);
  terminals.add("On Hold");
  return terminals;
}
