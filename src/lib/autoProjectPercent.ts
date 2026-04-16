import { supabase } from "@/integrations/supabase/client";
import { saveDailyLog } from "@/hooks/useProductionDailyLogs";

/**
 * Format a Date as YYYY-MM-DD using local time (avoids UTC T-1 shifts).
 */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Get Monday of the week containing the given date (local time).
 */
function getWeekMonday(d: Date): Date {
  const date = new Date(d);
  const dow = date.getDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Compute completion % for a project and write it to production_daily_logs
 * for the current week / current weekday. Idempotent: skips write if percent
 * is unchanged from the last log entry for the same bundle+day.
 */
export async function autoUpdateProjectPercent(projectId: string): Promise<void> {
  if (!projectId) return;
  try {
    const { data: rows, error } = await supabase
      .from("production_schedule")
      .select("status, scheduled_hours")
      .eq("project_id", projectId);
    if (error) throw error;

    const items = (rows || []) as Array<{ status: string; scheduled_hours: number }>;
    // Total = all hours that are part of the project's plan (exclude cancelled).
    const totalHours = items
      .filter((i) => i.status !== "cancelled")
      .reduce((sum, i) => sum + (Number(i.scheduled_hours) || 0), 0);
    const completedHours = items
      .filter((i) => i.status === "expedice" || i.status === "completed")
      .reduce((sum, i) => sum + (Number(i.scheduled_hours) || 0), 0);

    if (totalHours <= 0) return;

    const percent = Math.max(0, Math.min(100, Math.round((completedHours / totalHours) * 100)));

    const today = new Date();
    const monday = getWeekMonday(today);
    const weekKey = toLocalDateStr(monday);
    const bundleId = `${projectId}::${weekKey}`;
    // day_index: 0=Mon..4=Fri, clamp Sat/Sun → 4
    const dow = today.getDay(); // 0=Sun..6=Sat
    const dayIndex = dow === 0 ? 4 : Math.min(dow - 1, 4);

    // Skip if same value already logged for this bundle+day
    const { data: existing } = await supabase
      .from("production_daily_logs" as any)
      .select("percent")
      .eq("bundle_id", bundleId)
      .eq("week_key", weekKey)
      .eq("day_index", dayIndex)
      .maybeSingle();
    if (existing && (existing as any).percent === percent) return;

    await saveDailyLog(bundleId, weekKey, dayIndex, "auto", percent);
  } catch (err) {
    // Non-fatal: completion already happened, just log.
    console.warn("autoUpdateProjectPercent failed", projectId, err);
  }
}

/**
 * Run autoUpdateProjectPercent for a unique set of project IDs.
 */
export async function autoUpdateProjectPercents(projectIds: Iterable<string>): Promise<void> {
  const unique = Array.from(new Set(Array.from(projectIds).filter(Boolean)));
  await Promise.all(unique.map((id) => autoUpdateProjectPercent(id)));
}
