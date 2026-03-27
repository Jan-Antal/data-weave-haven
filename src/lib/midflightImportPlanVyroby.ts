import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Normalize project IDs: "Z-2501-002R" → "Z-2501-002-R"
 */
function normalizeProjectId(id: string): string {
  return id.replace(/([0-9])([A-Z])$/, "$1-$2");
}

/**
 * Get the Monday of the ISO week for a given date string.
 * Returns "YYYY-MM-DD" format.
 */
function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().split("T")[0];
}

function getCurrentMonday(): string {
  return getMondayOfWeek(new Date().toISOString().split("T")[0]);
}

interface HoursRow {
  ami_project_id: string;
  hodiny: number;
  datum_sync: string;
}

export async function midflightImportPlanVyroby(
  supabaseClient: SupabaseClient,
  onProgress?: (msg: string) => void
): Promise<{ created: number; skipped: number; errors: string[] }> {
  const currentMonday = getCurrentMonday();
  const errors: string[] = [];
  let created = 0;
  let skipped = 0;

  // Get current user for sent_by
  const { data: { user } } = await supabaseClient.auth.getUser();
  const userId = user?.id;
  if (!userId) {
    errors.push("Není přihlášený uživatel.");
    return { created, skipped, errors };
  }

  // ═══ FULL RESET — delete all previous midflight data ═══
  onProgress?.("Čistím predchádzajúce midflight dáta...");

  // 1. Delete all midflight historical entries from production_schedule
  const { error: resetScheduleErr } = await (supabaseClient as any)
    .from("production_schedule")
    .delete()
    .eq("is_midflight", true);
  if (resetScheduleErr) {
    errors.push(`Reset schedule error: ${resetScheduleErr.message}`);
  }

  // 2. Delete all midflight entries from production_inbox
  const { error: resetInboxErr } = await (supabaseClient as any)
    .from("production_inbox")
    .delete()
    .like("adhoc_reason", "midflight%");
  if (resetInboxErr) {
    errors.push(`Reset inbox error: ${resetInboxErr.message}`);
  }

  onProgress?.("Načítám production_hours_log...");

  // Fetch all hours — paginate to avoid 1000 row limit
  const EXCLUDED_CODES = ["TPV", "ENG", "PRO"];
  const allHours: HoursRow[] = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await (supabaseClient as any)
      .from("production_hours_log")
      .select("ami_project_id, hodiny, datum_sync")
      .filter("cinnost_kod", "not.in", `(${EXCLUDED_CODES.map(c => `"${c}"`).join(",")})`)
      .order("datum_sync", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) {
      errors.push(`Chyba při načítání hodin: ${error.message}`);
      return { created, skipped, errors };
    }
    if (!data || data.length === 0) break;
    allHours.push(...(data as HoursRow[]));
    onProgress?.(`Načítavam históriu... ${allHours.length} záznamov`);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  onProgress?.(`Načteno ${allHours.length} záznamů hodin.`);

  // Fetch valid projects for matching
  const { data: validProjects } = await (supabaseClient as any)
    .from("projects")
    .select("project_id, project_name, status")
    .is("deleted_at", null);

  const validProjectMap = new Map<string, { name: string; status: string }>();
  for (const p of validProjects || []) {
    validProjectMap.set(p.project_id, {
      name: p.project_name,
      status: (p.status || "").toLowerCase(),
    });
  }

  // Group by normalized project + monday
  const byProjectMonday = new Map<string, number>();
  for (const row of allHours) {
    const normalizedId = normalizeProjectId(row.ami_project_id);
    if (!validProjectMap.has(normalizedId)) continue;
    const monday = getMondayOfWeek(row.datum_sync);
    const key = `${normalizedId}||${monday}`;
    byProjectMonday.set(key, (byProjectMonday.get(key) || 0) + row.hodiny);
  }

  // Track skipped unknown projects
  const unknownProjects = new Set<string>();
  for (const row of allHours) {
    const normalizedId = normalizeProjectId(row.ami_project_id);
    if (!validProjectMap.has(normalizedId)) unknownProjects.add(row.ami_project_id);
  }
  for (const uid of unknownProjects) {
    skipped++;
    onProgress?.(`Preskočený neznámy projekt: ${uid}`);
  }

  // Fetch inbox items for current week logic
  const { data: inboxItems } = await (supabaseClient as any)
    .from("production_inbox")
    .select("id, project_id, estimated_hours")
    .eq("status", "pending");
  const inboxByProject = new Map<string, Array<{ id: string; estimated_hours: number }>>();
  for (const item of inboxItems || []) {
    if (!inboxByProject.has(item.project_id)) inboxByProject.set(item.project_id, []);
    inboxByProject.get(item.project_id)!.push(item);
  }

  // Fetch existing schedule items to check if Expedice projects have future work
  const { data: schedItems } = await (supabaseClient as any)
    .from("production_schedule")
    .select("project_id, scheduled_week, status")
    .gte("scheduled_week", currentMonday)
    .in("status", ["scheduled", "in_progress"]);
  const projectsWithFutureWork = new Set<string>();
  for (const s of schedItems || []) {
    projectsWithFutureWork.add(s.project_id);
  }

  // Track which projects we've seen, total hours, latest monday, and latest datum_sync
  const projectsInHours = new Set<string>();
  const projectTotalHours = new Map<string, number>();
  const projectLatestMonday = new Map<string, string>();
  const projectLatestDatum = new Map<string, string>();

  // Track latest datum_sync per normalized project from raw hours
  for (const row of allHours) {
    const normalizedId = normalizeProjectId(row.ami_project_id);
    if (!validProjectMap.has(normalizedId)) continue;
    const prev = projectLatestDatum.get(normalizedId);
    if (!prev || row.datum_sync > prev) projectLatestDatum.set(normalizedId, row.datum_sync);
  }

  // Schedule inserts only (no inbox inserts for expedice)
  const scheduleInserts: any[] = [];

  for (const [key, totalHours] of byProjectMonday) {
    const [projectId, monday] = key.split("||");
    const projectName = validProjectMap.get(projectId)?.name || projectId;
    projectsInHours.add(projectId);

    // Track total hours and latest monday per project
    projectTotalHours.set(projectId, (projectTotalHours.get(projectId) || 0) + totalHours);
    const prev = projectLatestMonday.get(projectId);
    if (!prev || monday > prev) projectLatestMonday.set(projectId, monday);

    if (monday < currentMonday) {
      // Historical → production_schedule as completed midflight items
      const itemCode = `HIST_${monday.replace(/-/g, "")}`;

      scheduleInserts.push({
        project_id: projectId,
        item_code: itemCode,
        item_name: `${projectName} — história ${monday}`,
        scheduled_week: monday,
        scheduled_hours: Math.round(totalHours * 100) / 100,
        scheduled_czk: 0,
        status: "completed",
        completed_at: new Date().toISOString(),
        is_midflight: true,
      });
    } else if (monday === currentMonday) {
      // Current week: reduce inbox hours
      const inboxEntries = inboxByProject.get(projectId);
      if (inboxEntries && inboxEntries.length > 0) {
        for (const entry of inboxEntries) {
          const remaining = Math.max(0, entry.estimated_hours - totalHours);
          const { error: updErr } = await (supabaseClient as any)
            .from("production_inbox")
            .update({ estimated_hours: remaining })
            .eq("id", entry.id);
          if (updErr) {
            errors.push(`Inbox update error ${projectId}: ${updErr.message}`);
          }
        }
      }
    }
    // future weeks: skip
  }

  // Expedice/Montáž → summary entry with completed_at = now()
  // Dokončeno/Fakturace/Reklamace → summary entry with completed_at = last datum_sync
  const doneStatuses = new Set(["dokončeno", "fakturace", "reklamace"]);
  const expediceStatuses = new Set(["expedice", "montáž"]);

  for (const projectId of projectsInHours) {
    const status = validProjectMap.get(projectId)?.status || "";
    const isExpedice = expediceStatuses.has(status);
    const isDone = doneStatuses.has(status);
    if (!isExpedice && !isDone) continue;

    // Only create if no future scheduled work exists
    if (projectsWithFutureWork.has(projectId)) continue;

    const projectName = validProjectMap.get(projectId)?.name || projectId;
    const latestMonday = projectLatestMonday.get(projectId) || currentMonday;
    const totalHrs = projectTotalHours.get(projectId) || 0;

    // Expedice: completed_at = now, Done: completed_at = last recorded work date
    const completedAt = isExpedice
      ? new Date().toISOString()
      : new Date(projectLatestDatum.get(projectId) || new Date().toISOString()).toISOString();

    scheduleInserts.push({
      project_id: projectId,
      item_code: isExpedice ? "EXPEDICE_MIDFLIGHT" : "DONE_MIDFLIGHT",
      item_name: projectName,
      scheduled_week: latestMonday,
      scheduled_hours: Math.round(totalHrs * 100) / 100,
      scheduled_czk: 0,
      status: "completed",
      completed_at: completedAt,
      is_midflight: true,
    });
  }

  // Batch insert all items to production_schedule
  if (scheduleInserts.length > 0) {
    onProgress?.(`Vkládám ${scheduleInserts.length} položek do plánu...`);
    for (let i = 0; i < scheduleInserts.length; i += 200) {
      const chunk = scheduleInserts.slice(i, i + 200);
      const { error: insErr } = await (supabaseClient as any)
        .from("production_schedule")
        .upsert(chunk, { onConflict: "project_id,item_code,scheduled_week", ignoreDuplicates: true });
      if (insErr) {
        errors.push(`Schedule insert error (batch ${i}): ${insErr.message}`);
      } else {
        created += chunk.length;
      }
    }
  }

  onProgress?.(`Hotovo. Vytvořeno: ${created}, Přeskočeno: ${skipped}`);
  return { created, skipped, errors };
}
