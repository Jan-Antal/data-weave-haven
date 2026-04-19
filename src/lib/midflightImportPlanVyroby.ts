import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Midflight import — ISOLATED midflight layer.
 *
 * Strict boundary rules:
 *  - NEVER touches normal production_inbox rows (no status flips, no deletes, no recalculate).
 *  - NEVER triggers global recalculateProductionHours.
 *  - Reset only deletes own artifacts: rows with is_midflight=true / is_historical=true,
 *    daily logs with bundle_id like '%::MF_%', and production_inbox rows whose
 *    adhoc_reason starts with 'midflight' (own midflight inbox markers, if any).
 *  - Historical bundles are written with is_midflight=true so normal planning
 *    queries can filter them out.
 */

function normalizeProjectId(id: string): string {
  return id.replace(/([0-9])([A-Z])$/, "$1-$2");
}

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

  const { data: { user } } = await supabaseClient.auth.getUser();
  const userId = user?.id;
  if (!userId) {
    errors.push("Není přihlášený uživatel.");
    return { created, skipped, errors };
  }

  // ━━━ ISOLATED RESET — only own midflight artifacts ━━━
  onProgress?.("[midflight] Resetujem iba vlastné midflight artefakty...");

  // Delete midflight daily logs (bundle_id contains "::MF_")
  const { error: errDL } = await (supabaseClient as any)
    .from("production_daily_logs")
    .delete()
    .like("bundle_id", "%::MF_%");
  if (errDL) console.warn("Delete midflight daily logs failed:", errDL.message);

  // Delete midflight schedule rows
  const { error: err1 } = await (supabaseClient as any)
    .from("production_schedule")
    .delete()
    .eq("is_midflight", true);
  if (err1) throw new Error("Reset schedule (midflight) failed: " + err1.message);

  // Delete historical schedule rows
  const { error: err1b } = await (supabaseClient as any)
    .from("production_schedule")
    .delete()
    .eq("is_historical", true);
  if (err1b) throw new Error("Reset schedule (historical) failed: " + err1b.message);

  // Delete only midflight-tagged inbox rows (adhoc_reason starts with 'midflight')
  // — does NOT touch any normal inbox items.
  const { error: err2 } = await (supabaseClient as any)
    .from("production_inbox")
    .delete()
    .like("adhoc_reason", "midflight%");
  if (err2) throw new Error("Reset inbox (midflight markers) failed: " + err2.message);

  // Delete midflight expedice markers
  const { error: err2b } = await (supabaseClient as any)
    .from("production_expedice")
    .delete()
    .eq("is_midflight", true);
  if (err2b) throw new Error("Reset expedice (midflight) failed: " + err2b.message);

  // Cleanup legacy HIST_ rows (older midflight artifacts that may lack is_midflight)
  const { error: err3 } = await (supabaseClient as any)
    .from("production_schedule")
    .delete()
    .like("item_code", "HIST_%");
  if (err3) console.warn("Cleanup HIST_ fallback failed:", err3.message);

  onProgress?.("[midflight] Reset hotový. Spúšťam import...");
  // ━━━ END RESET ━━━

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

  // Fetch valid projects
  const { data: validProjects } = await (supabaseClient as any)
    .from("projects")
    .select("project_id, project_name, status")
    .is("deleted_at", null);

  const validProjectMap = new Map<string, { name: string; status: string }>();
  for (const p of validProjects || []) {
    const status = (p.status || "").toLowerCase();
    validProjectMap.set(p.project_id, { name: p.project_name, status });
  }

  // Group by normalized project + monday (only past/current weeks).
  // Include all valid projects, even terminal ones, so historical midflight
  // keeps the full weekly hour history visible in the plan.
  const byProjectMonday = new Map<string, number>();
  for (const row of allHours) {
    const normalizedId = normalizeProjectId(row.ami_project_id);
    if (!validProjectMap.has(normalizedId)) continue;
    const monday = getMondayOfWeek(row.datum_sync);
    if (monday > currentMonday) continue;
    const key = `${normalizedId}||${monday}`;
    byProjectMonday.set(key, (byProjectMonday.get(key) || 0) + row.hodiny);
  }

  const unknownProjects = new Set<string>();
  for (const row of allHours) {
    const normalizedId = normalizeProjectId(row.ami_project_id);
    if (!validProjectMap.has(normalizedId)) unknownProjects.add(row.ami_project_id);
  }
  for (const uid of unknownProjects) {
    skipped++;
    onProgress?.(`Preskočený neznámy projekt: ${uid}`);
  }

  // Per-project weekly breakdown
  const projectWeeklyHours = new Map<string, Map<string, number>>();
  for (const [key, hours] of byProjectMonday) {
    if (hours < 0.05) continue;
    const [projectId, monday] = key.split("||");
    if (!projectWeeklyHours.has(projectId)) projectWeeklyHours.set(projectId, new Map());
    projectWeeklyHours.get(projectId)!.set(monday, Math.round(hours * 10) / 10);
  }

  // For expedice markers: track latest datum_sync + which projects have future scheduled work
  const projectLatestDatum = new Map<string, string>();
  for (const row of allHours) {
    const normalizedId = normalizeProjectId(row.ami_project_id);
    if (!validProjectMap.has(normalizedId)) continue;
    const prev = projectLatestDatum.get(normalizedId);
    if (!prev || row.datum_sync > prev) projectLatestDatum.set(normalizedId, row.datum_sync);
  }

  const { data: schedItems } = await (supabaseClient as any)
    .from("production_schedule")
    .select("project_id, scheduled_week, status, is_midflight")
    .gte("scheduled_week", currentMonday)
    .in("status", ["scheduled", "in_progress"]);
  const projectsWithFutureWork = new Set<string>();
  for (const s of schedItems || []) {
    if (s.is_midflight) continue; // ignore our own midflight rows
    projectsWithFutureWork.add(s.project_id);
  }

  // ━━━ CREATE MIDFLIGHT HISTORICAL BUNDLES (isolated, status=scheduled, is_midflight=true) ━━━
  // No reconciliation against normal inbox items — they remain untouched.
  const scheduleInserts: any[] = [];
  const dailyLogInserts: any[] = [];

  for (const [projectId, weeklyMap] of projectWeeklyHours) {
    const projectInfo = validProjectMap.get(projectId);
    const projectName = projectInfo?.name || projectId;
    const sortedWeeks = [...weeklyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    const totalParts = sortedWeeks.length;
    const firstBundleId = crypto.randomUUID();

    for (let i = 0; i < sortedWeeks.length; i++) {
      const [monday, hours] = sortedWeeks[i];
      const scheduleId = i === 0 ? firstBundleId : crypto.randomUUID();
      const weekNum = getISOWeekNumber(monday);

      scheduleInserts.push({
        id: scheduleId,
        project_id: projectId,
        item_code: projectId,
        item_name: `${projectName} — T${weekNum}`,
        scheduled_week: monday,
        scheduled_hours: hours,
        scheduled_czk: 0,
        status: "scheduled",
        is_midflight: true,
        completed_at: new Date().toISOString(),
        completed_by: userId,
        split_group_id: i === 0 ? null : firstBundleId,
        split_part: i + 1,
        split_total: totalParts,
        stage_id: null,
      });

      const bundleId = `${projectId}::MF_${monday}`;
      dailyLogInserts.push({
        bundle_id: bundleId,
        week_key: monday,
        day_index: 4,
        percent: 100,
        phase: "Expedice",
        logged_by: userId,
      });
    }

    onProgress?.(`[midflight] ${projectId}: ${sortedWeeks.length} historických týždňov`);
  }

  if (scheduleInserts.length > 0) {
    onProgress?.(`Vkládám ${scheduleInserts.length} midflight bundles...`);
    for (let i = 0; i < scheduleInserts.length; i += 200) {
      const chunk = scheduleInserts.slice(i, i + 200);
      const { error: insErr } = await (supabaseClient as any)
        .from("production_schedule")
        .insert(chunk);
      if (insErr) {
        errors.push(`Schedule insert error (batch ${i}): ${insErr.message}`);
      } else {
        created += chunk.length;
      }
    }
  }

  if (dailyLogInserts.length > 0) {
    onProgress?.(`Vkládám ${dailyLogInserts.length} daily logov...`);
    for (let i = 0; i < dailyLogInserts.length; i += 200) {
      const chunk = dailyLogInserts.slice(i, i + 200);
      const { error: insErr } = await (supabaseClient as any)
        .from("production_daily_logs")
        .insert(chunk);
      if (insErr) {
        errors.push(`Daily log insert error (batch ${i}): ${insErr.message}`);
      }
    }
  }

  // ━━━ Expedice/Dokončeno markers (isolated to production_expedice with is_midflight=true) ━━━
  const expediceMarkerStatuses = new Set(["expedice", "montáž", "dokončeno", "fakturace"]);
  const activeExpediceStatuses = new Set(["expedice", "montáž"]);
  const expediceInserts: any[] = [];

  for (const [projectId, projectInfo] of validProjectMap) {
    if (!expediceMarkerStatuses.has(projectInfo.status)) continue;
    if (projectsWithFutureWork.has(projectId)) continue;

    const projectName = projectInfo.name || projectId;
    const latestDatum = projectLatestDatum.get(projectId);

    let manufacturedAt: string;
    let expExpedicedAt: string | null = null;

    if (activeExpediceStatuses.has(projectInfo.status)) {
      manufacturedAt = latestDatum || new Date().toISOString().split("T")[0];
      expExpedicedAt = null;
    } else {
      if (latestDatum) {
        const nextDay = new Date(latestDatum);
        nextDay.setDate(nextDay.getDate() + 1);
        manufacturedAt = latestDatum;
        expExpedicedAt = nextDay.toISOString();
      } else {
        manufacturedAt = "2025-12-31";
        expExpedicedAt = new Date("2025-12-31").toISOString();
      }
    }

    expediceInserts.push({
      project_id: projectId,
      item_code: "EXPEDICE_MIDFLIGHT",
      item_name: projectName,
      manufactured_at: manufacturedAt,
      expediced_at: expExpedicedAt,
      is_midflight: true,
    });
  }

  if (expediceInserts.length > 0) {
    onProgress?.(`Vkládám ${expediceInserts.length} expedice záznamov...`);
    for (let i = 0; i < expediceInserts.length; i += 200) {
      const chunk = expediceInserts.slice(i, i + 200);
      const { error: insErr } = await (supabaseClient as any)
        .from("production_expedice")
        .insert(chunk);
      if (insErr) {
        errors.push(`Expedice insert error (batch ${i}): ${insErr.message}`);
      } else {
        created += chunk.length;
      }
    }
  }

  onProgress?.(`Hotovo. Vytvořeno: ${created}, Přeskočeno: ${skipped}`);
  return { created, skipped, errors };
}

function getISOWeekNumber(dateStr: string): number {
  const d = new Date(dateStr);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const isoStart = new Date(jan4);
  isoStart.setDate(jan4.getDate() - jan4Day + 1);
  const diff = d.getTime() - isoStart.getTime();
  return Math.floor(diff / (7 * 86400000)) + 1;
}
