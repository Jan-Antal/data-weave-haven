import type { SupabaseClient } from "@supabase/supabase-js";
import { recalculateProductionHours } from "./recalculateProductionHours";

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

  // ━━━ HARD RESET ━━━
  onProgress?.("[midflight] Resetujem všetky midflight dáta...");

  // 0a. Revert inbox items marked by previous reconciliation
  onProgress?.("[midflight] Obnovujem inbox items z predchádzajúcej reconciliation...");
  const { error: errReconSched } = await (supabaseClient as any)
    .from("production_inbox")
    .update({ status: "pending", adhoc_reason: null })
    .eq("adhoc_reason", "recon_scheduled");
  if (errReconSched) console.warn("Revert recon_scheduled failed:", errReconSched.message);

  const { error: errReconReduced } = await (supabaseClient as any)
    .from("production_inbox")
    .update({ status: "pending", adhoc_reason: null, split_group_id: null, split_part: null, split_total: null })
    .like("adhoc_reason", "recon_reduced%");
  if (errReconReduced) console.warn("Revert recon_reduced failed:", errReconReduced.message);

  // 0b. Recalculate all inbox hours from prices/formulas to restore original values
  onProgress?.("[midflight] Prepočítavam hodiny inboxu z cien...");
  try {
    await recalculateProductionHours(supabaseClient, "all", undefined, true);
  } catch (e: any) {
    console.warn("Recalculate failed:", e.message);
  }

  // 0b2. Delete duplicate inbox items with split-suffix names "(N/M)" — orphans from prior returnBundleToInbox
  // These are leftovers when midflight schedule bundles get reverted; original inbox items remain and get re-reduced fresh.
  onProgress?.("[midflight] Mažem duplicitné inbox položky so split-suffix...");
  const { error: errDupInbox } = await (supabaseClient as any)
    .from("production_inbox")
    .delete()
    .filter("item_name", "~", " \\([0-9]+/[0-9]+\\)$");
  if (errDupInbox) console.warn("Delete duplicate inbox items failed:", errDupInbox.message);

  // 0c. Delete daily logs created by midflight (bundle_id contains "::MF_")
  const { error: errDL } = await (supabaseClient as any)
    .from("production_daily_logs")
    .delete()
    .like("bundle_id", "%::MF_%");
  if (errDL) console.warn("Delete midflight daily logs failed:", errDL.message);

  // 1. Delete ALL midflight entries from production_schedule
  const { error: err1 } = await (supabaseClient as any)
    .from("production_schedule")
    .delete()
    .eq("is_midflight", true);
  if (err1) throw new Error("Reset schedule failed: " + err1.message);

  // 1b. Delete ALL historical reconciliation entries
  const { error: err1b } = await (supabaseClient as any)
    .from("production_schedule")
    .delete()
    .eq("is_historical", true);
  if (err1b) throw new Error("Reset historical failed: " + err1b.message);

  // 2. Delete ALL midflight entries from production_inbox
  const { error: err2 } = await (supabaseClient as any)
    .from("production_inbox")
    .delete()
    .like("adhoc_reason", "midflight%");
  if (err2) throw new Error("Reset inbox failed: " + err2.message);

  // 3. Delete ALL midflight entries from production_expedice
  const { error: err2b } = await (supabaseClient as any)
    .from("production_expedice")
    .delete()
    .eq("is_midflight", true);
  if (err2b) throw new Error("Reset expedice failed: " + err2b.message);

  // 4. Cleanup legacy HIST_ rows that may have is_midflight=false
  const { error: err3 } = await (supabaseClient as any)
    .from("production_schedule")
    .delete()
    .like("item_code", "HIST_%");
  if (err3) console.warn("Cleanup fallback failed:", err3.message);

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

  // Group by normalized project + monday (only past/current weeks)
  const byProjectMonday = new Map<string, number>();
  for (const row of allHours) {
    const normalizedId = normalizeProjectId(row.ami_project_id);
    if (!validProjectMap.has(normalizedId)) continue;
    const monday = getMondayOfWeek(row.datum_sync);
    if (monday > currentMonday) continue; // skip future
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

  // Build per-project weekly breakdown
  const projectWeeklyHours = new Map<string, Map<string, number>>();
  const projectTotalHist = new Map<string, number>();
  for (const [key, hours] of byProjectMonday) {
    if (hours < 0.05) continue;
    const [projectId, monday] = key.split("||");
    if (!projectWeeklyHours.has(projectId)) projectWeeklyHours.set(projectId, new Map());
    projectWeeklyHours.get(projectId)!.set(monday, Math.round(hours * 10) / 10);
    projectTotalHist.set(projectId, (projectTotalHist.get(projectId) || 0) + hours);
  }

  // Fetch pending inbox items for reconciliation
  const { data: pendingInbox } = await (supabaseClient as any)
    .from("production_inbox")
    .select("id, project_id, item_code, item_name, estimated_hours, estimated_czk, stage_id")
    .eq("status", "pending")
    .order("sent_at", { ascending: true });

  const inboxByProject = new Map<string, Array<{ id: string; project_id: string; item_code: string; item_name: string; estimated_hours: number; estimated_czk: number; stage_id: string | null }>>();
  for (const item of pendingInbox || []) {
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

  // Track latest datum_sync per normalized project from raw hours
  const projectLatestDatum = new Map<string, string>();
  for (const row of allHours) {
    const normalizedId = normalizeProjectId(row.ami_project_id);
    if (!validProjectMap.has(normalizedId)) continue;
    const prev = projectLatestDatum.get(normalizedId);
    if (!prev || row.datum_sync > prev) projectLatestDatum.set(normalizedId, row.datum_sync);
  }

  // ━━━ CREATE SPLIT BUNDLES from inbox items ━━━
  const scheduleInserts: any[] = [];
  const dailyLogInserts: any[] = [];
  const inboxUpdates: Array<{ id: string; estimated_hours?: number; status?: string; adhoc_reason?: string; split_group_id?: string; split_part?: number; split_total?: number }> = [];

  for (const [projectId, weeklyMap] of projectWeeklyHours) {
    const inboxItems = inboxByProject.get(projectId);
    const projectInfo = validProjectMap.get(projectId);
    const projectName = projectInfo?.name || projectId;

    // Use project-level info for midflight bundles (not individual items)
    const templateCode = projectId;
    const templateName = projectName;
    const templateStageId = inboxItems?.[0]?.stage_id || null;
    const totalHistHours = Math.round((projectTotalHist.get(projectId) || 0) * 10) / 10;
    // Sort weeks chronologically
    const sortedWeeks = [...weeklyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    // Calculate inbox remainder to determine total split parts
    const totalInboxHours = inboxItems
      ? inboxItems.reduce((s, i) => s + i.estimated_hours, 0)
      : 0;
    const remainderHours = Math.max(0, totalInboxHours - totalHistHours);
    const hasRemainder = remainderHours > 0.05 && inboxItems && inboxItems.length > 0;

    // totalParts = hist weeks + 1 (inbox remainder as last part)
    const totalParts = sortedWeeks.length + (hasRemainder ? 1 : 0);

    // First bundle's ID serves as split_group_id for the rest (FK constraint)
    const firstBundleId = crypto.randomUUID();

    for (let i = 0; i < sortedWeeks.length; i++) {
      const [monday, hours] = sortedWeeks[i];
      const scheduleId = i === 0 ? firstBundleId : crypto.randomUUID();
      const weekNum = getISOWeekNumber(monday);

      scheduleInserts.push({
        id: scheduleId,
        project_id: projectId,
        item_code: templateCode,
        item_name: `${templateName} — T${weekNum}`,
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
        stage_id: templateStageId,
      });

      // Daily log with 100% completion
      const bundleId = `${projectId}::MF_${monday}`;
      dailyLogInserts.push({
        bundle_id: bundleId,
        week_key: monday,
        day_index: 4, // Friday
        percent: 100,
        phase: "Expedice",
        logged_by: userId,
      });
    }

    // Reduce inbox items proportionally by totalHistHours (apply split metadata to ALL items)
    if (inboxItems && inboxItems.length > 0 && totalInboxHours > 0) {
      const reductionRatio = Math.min(1, totalHistHours / totalInboxHours);

      for (const item of inboxItems) {
        const reducedBy = item.estimated_hours * reductionRatio;
        const newHours = Math.max(0, Math.round((item.estimated_hours - reducedBy) * 10) / 10);

        if (newHours < 0.05) {
          // Fully consumed by history → mark as scheduled (legacy completed)
          inboxUpdates.push({
            id: item.id,
            status: "scheduled",
            adhoc_reason: "recon_scheduled",
            split_group_id: firstBundleId,
            split_part: totalParts,
            split_total: totalParts,
          });
        } else {
          // Partially consumed → keep in inbox as remainder, attach to split group
          inboxUpdates.push({
            id: item.id,
            estimated_hours: newHours,
            adhoc_reason: "recon_reduced",
            split_group_id: firstBundleId,
            split_part: totalParts,
            split_total: totalParts,
          });
        }
      }
    }

    onProgress?.(`[midflight] ${projectId}: ${totalHistHours}h → ${sortedWeeks.length} split bundles (${totalParts} total parts), ${inboxItems?.length ?? 0} inbox items reconciled`);
  }

  // ━━━ Insert schedule bundles ━━━
  if (scheduleInserts.length > 0) {
    onProgress?.(`Vkládám ${scheduleInserts.length} split bundles do plánu...`);
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

  // ━━━ Insert daily logs ━━━
  if (dailyLogInserts.length > 0) {
    onProgress?.(`Vkládám ${dailyLogInserts.length} daily logov (100%)...`);
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

  // ━━━ Apply inbox updates ━━━
  for (const upd of inboxUpdates) {
    const updatePayload: any = {};
    if (upd.status) updatePayload.status = upd.status;
    if (upd.adhoc_reason !== undefined) updatePayload.adhoc_reason = upd.adhoc_reason;
    if (upd.estimated_hours !== undefined) updatePayload.estimated_hours = upd.estimated_hours;
    if (upd.split_group_id) updatePayload.split_group_id = upd.split_group_id;
    if (upd.split_part) updatePayload.split_part = upd.split_part;
    if (upd.split_total) updatePayload.split_total = upd.split_total;

    const { error } = await (supabaseClient as any)
      .from("production_inbox")
      .update(updatePayload)
      .eq("id", upd.id);
    if (error) errors.push(`Inbox update error ${upd.id}: ${error.message}`);
  }

  // ━━━ Insert Expedice/Dokončeno markers to production_expedice ━━━
  const expediceMarkerStatuses = new Set(["expedice", "montáž", "dokončeno", "fakturace"]);
  const activeExpediceStatuses = new Set(["expedice", "montáž"]);
  const expediceInserts: any[] = [];
  let expediceCount = 0;

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
    expediceCount++;
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
  console.log("[midflight] production_expedice created:", expediceCount);

  onProgress?.(`Hotovo. Vytvořeno: ${created}, Přeskočeno: ${skipped}`);
  return { created, skipped, errors };
}

/** Get ISO week number from a Monday date string */
function getISOWeekNumber(dateStr: string): number {
  const d = new Date(dateStr);
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
  const weekNum = Math.ceil((dayOfYear + new Date(d.getFullYear(), 0, 1).getDay() - 1) / 7);
  // Use proper ISO calculation
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const isoStart = new Date(jan4);
  isoStart.setDate(jan4.getDate() - jan4Day + 1);
  const diff = d.getTime() - isoStart.getTime();
  return Math.floor(diff / (7 * 86400000)) + 1;
}
