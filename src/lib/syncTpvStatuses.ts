import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Vyroba" status v TPV List je virtuálny — počíta sa z production_inbox + production_schedule.
 * Táto utilita NEMENÍ tpv_items.status; namiesto toho čistí osirelé/legacy záznamy v
 * production_inbox a production_schedule, ktoré držia status "Vyroba/Naplánováno/..."
 * pri TPV položkách, ktoré už nemajú aktívnu výrobu (mimo midflight/historical).
 *
 * Konkrétne:
 *   - Mažeme production_inbox rows so status='cancelled' (osirelé po zrušení).
 *   - Mažeme production_schedule rows so status='cancelled' (osirelé po zrušení).
 *
 * Midflight (is_midflight=true) a historical (is_historical=true) NIKDY nemažeme.
 *
 * Po behu invaliduje cache `production-statuses` cez vrátený `affectedProjectIds`.
 */
export async function syncTpvStatuses(
  supabaseClient: SupabaseClient,
): Promise<{ inboxRemoved: number; scheduleRemoved: number; affectedProjectIds: string[] }> {
  const affected = new Set<string>();

  // Cancelled inbox rows
  const { data: cInbox } = await (supabaseClient as any)
    .from("production_inbox")
    .select("id, project_id")
    .eq("status", "cancelled");
  const inboxIds = (cInbox || []).map((r: any) => r.id);
  for (const r of cInbox || []) affected.add(r.project_id);

  let inboxRemoved = 0;
  if (inboxIds.length > 0) {
    const { error } = await (supabaseClient as any)
      .from("production_inbox")
      .delete()
      .in("id", inboxIds);
    if (!error) inboxRemoved = inboxIds.length;
  }

  // Cancelled schedule rows that are NOT midflight/historical
  const { data: cSched } = await (supabaseClient as any)
    .from("production_schedule")
    .select("id, project_id, is_midflight, is_historical")
    .eq("status", "cancelled");
  const schedIds = (cSched || [])
    .filter((r: any) => !r.is_midflight && !r.is_historical)
    .map((r: any) => r.id);
  for (const r of cSched || []) {
    if (!r.is_midflight && !r.is_historical) affected.add(r.project_id);
  }

  let scheduleRemoved = 0;
  if (schedIds.length > 0) {
    const { error } = await (supabaseClient as any)
      .from("production_schedule")
      .delete()
      .in("id", schedIds);
    if (!error) scheduleRemoved = schedIds.length;
  }

  return { inboxRemoved, scheduleRemoved, affectedProjectIds: Array.from(affected) };
}
