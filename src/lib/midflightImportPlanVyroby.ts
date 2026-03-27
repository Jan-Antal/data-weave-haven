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

  onProgress?.("Načítám production_hours_log...");

  // Fetch all hours — paginate to avoid 1000 row limit
  const allHours: HoursRow[] = [];
  let from = 0;
  const pageSize = 5000;
  while (true) {
    const { data, error } = await (supabaseClient as any)
      .from("production_hours_log")
      .select("ami_project_id, hodiny, datum_sync")
      .range(from, from + pageSize - 1);
    if (error) {
      errors.push(`Chyba při načítání hodin: ${error.message}`);
      return { created, skipped, errors };
    }
    if (!data || data.length === 0) break;
    allHours.push(...(data as HoursRow[]));
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

  // Fetch existing inbox item_codes for dedup (midflight items)
  const { data: existingInbox } = await (supabaseClient as any)
    .from("production_inbox")
    .select("project_id, item_code, adhoc_reason")
    .or("adhoc_reason.eq.midflight_historical,adhoc_reason.eq.midflight_expedice");
  const existingKeys = new Set<string>();
  for (const item of existingInbox || []) {
    existingKeys.add(`${item.project_id}||${item.item_code}`);
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

  // Track which projects we've seen (for Expedice special entry)
  const projectsInHours = new Set<string>();

  // Process each project+monday
  const toInsert: any[] = [];

  for (const [key, totalHours] of byProjectMonday) {
    const [projectId, monday] = key.split("||");
    const projectName = projectNameMap.get(projectId) || projectId;
    projectsInHours.add(projectId);

    if (monday < currentMonday) {
      // CASE A — Historical → production_inbox as completed items
      const itemCode = `HIST_${monday.replace(/-/g, "")}`;
      const dedupKey = `${projectId}||${itemCode}`;
      if (existingKeys.has(dedupKey)) {
        skipped++;
        continue;
      }

      toInsert.push({
        project_id: projectId,
        item_code: itemCode,
        item_name: `${projectName} — týždeň ${monday}`,
        estimated_hours: Math.round(totalHours * 100) / 100,
        estimated_czk: 0,
        status: "scheduled",
        adhoc_reason: "midflight_historical",
        sent_by: userId,
      });
    } else if (monday === currentMonday) {
      // CASE B — Current week: reduce inbox hours
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
    // CASE C — future weeks: skip
  }

  // CASE D — Expedice projects: create special inbox entry for scheduling
  for (const projectId of projectsInHours) {
    const status = projectStatusMap.get(projectId) || "";
    if (status !== "expedice" && status !== "montáž") continue;

    // Only create if no future scheduled work exists
    if (projectsWithFutureWork.has(projectId)) continue;

    const itemCode = `EXPEDICE_${projectId}`;
    const dedupKey = `${projectId}||${itemCode}`;
    if (existingKeys.has(dedupKey)) continue;

    const projectName = projectNameMap.get(projectId) || projectId;
    toInsert.push({
      project_id: projectId,
      item_code: itemCode,
      item_name: `${projectName} — Expedice`,
      estimated_hours: 0,
      estimated_czk: 0,
      status: "pending",
      adhoc_reason: "midflight_expedice",
      sent_by: userId,
    });
  }

  // Batch insert to production_inbox
  if (toInsert.length > 0) {
    onProgress?.(`Vkládám ${toInsert.length} položek do inboxu...`);
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200);
      const { error: insErr } = await (supabaseClient as any)
        .from("production_inbox")
        .insert(chunk);
      if (insErr) {
        errors.push(`Insert error (batch ${i}): ${insErr.message}`);
      } else {
        created += chunk.length;
      }
    }
  }

  skipped = Math.max(0, (toInsert.length + skipped) - created);

  onProgress?.(`Hotovo. Vytvořeno: ${created}, Přeskočeno: ${skipped}`);
  return { created, skipped, errors };
}
