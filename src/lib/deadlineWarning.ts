import { parseAppDate } from "@/lib/dateFormat";
import { differenceInDays } from "date-fns";

export interface DeadlineInfo {
  date: Date;
  fieldName: string;
  fieldLabel: string;
}

export type DeadlineWarningLevel = "hard" | "soft" | "none";

export interface DeadlineWarningResult {
  level: DeadlineWarningLevel;
  deadline: DeadlineInfo | null;
  daysUntilDeadline?: number;
}

/**
 * Resolve the effective deadline for a project using priority:
 * 1. expedice (Datum expedice)
 * 2. montaz (Datum montáže)
 * 3. datum_smluvni (Datum smluvní)
 */
export function resolveDeadline(project: {
  expedice?: string | null;
  montaz?: string | null;
  datum_smluvni?: string | null;
}): DeadlineInfo | null {
  if (project.expedice) {
    const d = parseAppDate(project.expedice);
    if (d) return { date: d, fieldName: "expedice", fieldLabel: "Datum expedice" };
  }
  if (project.montaz) {
    const d = parseAppDate(project.montaz);
    if (d) return { date: d, fieldName: "montaz", fieldLabel: "Datum montáže" };
  }
  if (project.datum_smluvni) {
    const d = parseAppDate(project.datum_smluvni);
    if (d) return { date: d, fieldName: "datum_smluvni", fieldLabel: "Datum smluvní" };
  }
  return null;
}

/**
 * Check if scheduling into a given week triggers a deadline warning.
 * - "hard": week starts AFTER the deadline
 * - "soft": deadline is within 14 days from week start (but not breached)
 * - "none": no warning
 */
export function checkDeadlineWarning(
  deadline: DeadlineInfo | null,
  targetWeekStartDate: Date
): DeadlineWarningResult {
  if (!deadline) return { level: "none", deadline: null };

  const weekStart = new Date(targetWeekStartDate);
  weekStart.setHours(0, 0, 0, 0);

  const deadlineDate = new Date(deadline.date);
  deadlineDate.setHours(0, 0, 0, 0);

  // Hard warning: week starts after deadline
  if (weekStart > deadlineDate) {
    return {
      level: "hard",
      deadline,
      daysUntilDeadline: differenceInDays(deadlineDate, weekStart),
    };
  }

  // Soft warning: deadline within 14 days of week start
  const daysUntil = differenceInDays(deadlineDate, weekStart);
  if (daysUntil <= 14 && daysUntil >= 0) {
    return {
      level: "soft",
      deadline,
      daysUntilDeadline: daysUntil,
    };
  }

  return { level: "none", deadline: null };
}
