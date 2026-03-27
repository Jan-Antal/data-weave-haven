import type { SupabaseClient } from "@supabase/supabase-js";

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekKeyToMonday(wk: string): string {
  // "2026-W13" → Monday date as "YYYY-MM-DD"
  const [yearStr, weekStr] = wk.split("-W");
  const year = parseInt(yearStr, 10);
  const week = parseInt(weekStr, 10);
  // Jan 4 is always in week 1
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  const mm = String(monday.getMonth() + 1).padStart(2, "0");
  const dd = String(monday.getDate()).padStart(2, "0");
  return `${monday.getFullYear()}-${mm}-${dd}`;
}

function getCurrentWeekKey(): string {
  return getWeekKey(new Date().toISOString().split("T")[0]);
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
  const currentWeek = getCurrentWeekKey();
  const errors: string[] = [];
  let created = 0;
  let skipped = 0;

  onProgress?.("Načítám production_hours_log...");

  // Fetch all hours — paginate to avoid 1000 row limit
  const allHours: HoursRow[] = [];
  let from = 0;
  const pageSize = 5000;
  while (true) {
    const { data, error } = await supabaseClient
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

  // Group by project + week
  const byProjectWeek = new Map<string, number>();
  for (const row of allHours) {
    const wk = getWeekKey(row.datum_sync);
    const key = `${row.ami_project_id}||${wk}`;
    byProjectWeek.set(key, (byProjectWeek.get(key) || 0) + row.hodiny);
  }

  // Fetch project names
  const projectIds = [...new Set(allHours.map((r) => r.ami_project_id))];
  const { data: projects } = await (supabaseClient as any)
    .from("projects")
    .select("project_id, project_name")
    .in("project_id", projectIds);
  const projectNameMap = new Map<string, string>();
  for (const p of projects || []) {
    projectNameMap.set(p.project_id, p.project_name);
  }

  // Fetch existing midflight entries to skip
  const { data: existingMidflight } = await (supabaseClient as any)
    .from("production_schedule")
    .select("project_id, scheduled_week")
    .eq("is_midflight", true);
  const existingSet = new Set(
    (existingMidflight || []).map(
      (r: any) => `${r.project_id}||${getWeekKey(r.scheduled_week)}`
    )
  );

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

  // Process each project+week
  const toInsert: any[] = [];

  for (const [key, totalHours] of byProjectWeek) {
    const [projectId, weekKey] = key.split("||");
    const projectName = projectNameMap.get(projectId) || projectId;

    if (existingSet.has(key)) {
      skipped++;
      continue;
    }

    if (weekKey < currentWeek) {
      // CASE A — Historical
      toInsert.push({
        project_id: projectId,
        item_code: "HISTORICAL",
        item_name: projectName,
        scheduled_week: weekKeyToMonday(weekKey),
        scheduled_hours: Math.round(totalHours * 100) / 100,
        scheduled_czk: 0,
        status: "completed",
        is_midflight: true,
        position: 0,
      });
    } else if (weekKey === currentWeek) {
      // CASE B — Current week
      toInsert.push({
        project_id: projectId,
        item_code: "MIDFLIGHT_CURRENT",
        item_name: projectName,
        scheduled_week: weekKeyToMonday(weekKey),
        scheduled_hours: Math.round(totalHours * 100) / 100,
        scheduled_czk: 0,
        status: "in_progress",
        is_midflight: true,
        position: 0,
      });

      // Reduce inbox hours if project is in inbox
      const inboxEntries = inboxByProject.get(projectId);
      if (inboxEntries && inboxEntries.length > 0) {
        for (const entry of inboxEntries) {
          const remaining = Math.max(0, entry.estimated_hours - totalHours);
          const { error: updErr } = await supabaseClient
            .from("production_inbox")
            .update({ estimated_hours: remaining })
            .eq("id", entry.id);
          if (updErr) {
            errors.push(`Inbox update error ${projectId}: ${updErr.message}`);
          }
        }
      }
    }
    // CASE C — future weeks: skip (leave inbox untouched)
  }

  // Batch insert
  if (toInsert.length > 0) {
    onProgress?.(`Vkládám ${toInsert.length} bundlů...`);
    // Insert in chunks of 200
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200);
      const { error: insErr } = await supabaseClient
        .from("production_schedule")
        .insert(chunk);
      if (insErr) {
        errors.push(`Insert error (batch ${i}): ${insErr.message}`);
      } else {
        created += chunk.length;
      }
    }
  }

  onProgress?.(`Hotovo. Vytvořeno: ${created}, Přeskočeno: ${skipped}`);
  return { created, skipped, errors };
}
