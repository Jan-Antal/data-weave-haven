import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIN_HOURS = 20;
const MAX_HOURS = 2000;

function clampHours(h: number): number {
  return Math.max(MIN_HOURS, Math.min(MAX_HOURS, Math.round(h)));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { mode, weeklyCapacityHours } = await req.json();
    const capacity = Number(weeklyCapacityHours) || 875;

    // 1. Fetch all data in parallel (including settings & presets)
    const [projectsRes, tpvRes, scheduleRes, inboxRes, settingsRes, presetsRes] = await Promise.all([
      sb.from("projects")
        .select("project_id, project_name, status, expedice, montaz, predani, datum_smluvni, prodejni_cena, datum_tpv, vyroba, marze, cost_preset_id")
        .is("deleted_at", null)
        .eq("is_test", false)
        .not("status", "in", '("Fakturace","Dokončeno")')
        .not("project_id", "like", "TEST%"),
      sb.from("tpv_items")
        .select("project_id, item_name, pocet, cena")
        .is("deleted_at", null),
      sb.from("production_schedule")
        .select("id, project_id, item_name, item_code, scheduled_week, scheduled_hours, scheduled_czk, status")
        .in("status", ["scheduled", "in_progress", "completed", "paused"]),
      sb.from("production_inbox")
        .select("id, project_id, item_name, item_code, estimated_hours, estimated_czk, status")
        .eq("status", "pending"),
      sb.from("production_settings")
        .select("hourly_rate")
        .limit(1)
        .single(),
      sb.from("cost_breakdown_presets")
        .select("id, name, production_pct, is_default, sort_order")
        .order("sort_order", { ascending: true }),
    ]);

    const projects = projectsRes.data || [];
    // Build set of valid (non-test, non-deleted) project IDs to filter related data
    const validProjectIds = new Set(projects.map(p => p.project_id));
    const tpvItems = (tpvRes.data || []).filter(t => validProjectIds.has(t.project_id));
    const scheduleItems = (scheduleRes.data || []).filter(s => validProjectIds.has(s.project_id));
    const inboxItems = (inboxRes.data || []).filter(i => validProjectIds.has(i.project_id));

    // Dynamic settings from DB
    const hourlyRate = Number(settingsRes.data?.hourly_rate) || 550;
    const costPresets = presetsRes.data || [];
    const defaultPreset = costPresets.find((p: any) => p.is_default) || costPresets[0] || null;

    // 2. Generate week keys (next N weeks from current Monday)
    const today = new Date();
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() + mondayOffset);
    currentMonday.setHours(0, 0, 0, 0);

    let maxWeekCount = 16;
    for (const proj of projects) {
      const dl = proj.expedice || proj.montaz || proj.predani || proj.datum_smluvni;
      if (dl) {
        const dlDate = new Date(dl);
        const diffWeeks = Math.ceil((dlDate.getTime() - currentMonday.getTime()) / (7 * 86400000));
        if (diffWeeks + 8 > maxWeekCount) maxWeekCount = diffWeeks + 8;
      }
    }

    const weekKeys: string[] = [];
    for (let i = 0; i < maxWeekCount; i++) {
      const d = new Date(currentMonday);
      d.setDate(currentMonday.getDate() + i * 7);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      weekKeys.push(`${y}-${m}-${dd}`);
    }

    // 3. Calculate existing usage per week from real schedule
    const weekUsage: Record<string, number> = {};
    for (const wk of weekKeys) weekUsage[wk] = 0;
    for (const si of scheduleItems) {
      if (si.status !== "cancelled" && weekUsage[si.scheduled_week] !== undefined) {
        weekUsage[si.scheduled_week] = (weekUsage[si.scheduled_week] || 0) + Number(si.scheduled_hours);
      }
    }

    // Helper: find earliest week index where a project has real work (in_progress/completed)
    function findEarliestRealWorkIdx(projectId: string): number {
      let earliest = -1;
      for (const si of scheduleItems) {
        if (si.project_id !== projectId) continue;
        if (si.status !== "in_progress" && si.status !== "completed") continue;
        const idx = weekKeys.indexOf(si.scheduled_week);
        if (idx >= 0 && (earliest < 0 || idx < earliest)) {
          earliest = idx;
        }
      }
      return earliest;
    }

    // Helper: resolve deadline
    function resolveDeadline(proj: any): { date: string | null; source: string } {
      if (proj.expedice) return { date: proj.expedice, source: "expedice" };
      if (proj.montaz) return { date: proj.montaz, source: "montaz" };
      if (proj.predani) return { date: proj.predani, source: "predani" };
      if (proj.datum_smluvni) return { date: proj.datum_smluvni, source: "smluvni" };
      return { date: null, source: "none" };
    }

    // Helper: estimate hours for a project using DB-driven cost breakdown
    interface EstimationResult {
      hours: number;
      level: number; // 1=rozpad, 2=odhad s marží, 3=odhad s def. marží, 4=chybí podklady
      badge: string;
      usedPreset?: string;
    }

    function estimateProjectHours(proj: any, projTpv: any[]): EstimationResult {
      const prodejniCena = Number(proj.prodejni_cena) || 0;
      const marze = proj.marze != null ? Number(proj.marze) : null;

      // Which preset to use
      const preset = proj.cost_preset_id
        ? costPresets.find((p: any) => p.id === proj.cost_preset_id)
        : defaultPreset;

      if (!preset || prodejniCena === 0) {
        return { hours: MIN_HOURS, level: 4, badge: "⚠ Chybí podklady" };
      }

      const effectiveMarze = marze ?? 15; // default 15% if not set
      const naklady = prodejniCena * (1 - effectiveMarze / 100);
      const vyrobaNaklady = naklady * (Number(preset.production_pct) / 100);
      const hours = clampHours(vyrobaNaklady / hourlyRate);

      const level = proj.cost_preset_id ? 1 : (marze != null ? 2 : 3);
      const badge = level === 1 ? "Rozpad" : level === 2 ? "Výroba – odhad" : "Výroba – odhad (def. marže)";

      return { hours, level, badge, usedPreset: preset.name };
    }

    // Helper: distribute totalHours across weeks
    // Returns { allocated, overflow } — overflow goes to safety net
    function distributeHours(
      totalHours: number,
      usage: Record<string, number>,
      deadlineStr: string | null,
      startFromIdx = 0,
    ): { allocated: { week: string; hours: number }[]; overflow: number } {
      const result: { week: string; hours: number }[] = [];
      let remaining = totalHours;

      // Find deadline week index (cap allocation to this week)
      let deadlineIdx = weekKeys.length - 1;
      if (deadlineStr) {
        const deadline = new Date(deadlineStr);
        for (let i = weekKeys.length - 1; i >= 0; i--) {
          if (new Date(weekKeys[i]) <= deadline) {
            deadlineIdx = i;
            break;
          }
        }
        // If deadline is before our first week, everything overflows
        if (deadlineIdx < startFromIdx) {
          return { allocated: [], overflow: totalHours };
        }
      }

      // Try to fill backwards from deadline within [startFromIdx, deadlineIdx]
      if (deadlineStr) {
        for (let i = deadlineIdx; i >= startFromIdx && remaining > 0; i--) {
          const avail = capacity - (usage[weekKeys[i]] || 0);
          if (avail > 0) {
            const alloc = Math.min(remaining, avail);
            result.push({ week: weekKeys[i], hours: alloc });
            usage[weekKeys[i]] = (usage[weekKeys[i]] || 0) + alloc;
            remaining -= alloc;
          }
        }
      } else {
        // No deadline — fill forward from startFromIdx
        for (let i = startFromIdx; i < weekKeys.length && remaining > 0; i++) {
          if (result.some(r => r.week === weekKeys[i])) continue;
          const avail = capacity - (usage[weekKeys[i]] || 0);
          if (avail > 0) {
            const alloc = Math.min(remaining, avail);
            result.push({ week: weekKeys[i], hours: alloc });
            usage[weekKeys[i]] = (usage[weekKeys[i]] || 0) + alloc;
            remaining -= alloc;
          }
        }
      }

      // Any remaining hours are overflow (cannot fit before deadline)
      return { allocated: result, overflow: remaining };
    }

    const blocks: any[] = [];
    const safetyNet: any[] = [];
    let blockIdx = 0;
    const projectMap = new Map(projects.map(p => [p.project_id, p]));

    if (mode === "from_scratch") {
      // ─── FROM SCRATCH: reschedule everything ───
      const trackUsage: Record<string, number> = {};
      for (const wk of weekKeys) trackUsage[wk] = 0;

      // Collect per-project scheduled hours
      const scheduleByProject = new Map<string, number>();
      for (const si of scheduleItems) {
        if (si.status === "cancelled") continue;
        scheduleByProject.set(si.project_id, (scheduleByProject.get(si.project_id) || 0) + Number(si.scheduled_hours));
      }

      const inboxByProject = new Map<string, number>();
      for (const item of inboxItems) {
        inboxByProject.set(item.project_id, (inboxByProject.get(item.project_id) || 0) + (Number(item.estimated_hours) || 8));
      }

      interface ProjectWork {
        projectId: string;
        projectName: string;
        totalHours: number;
        source: "existing_plan" | "inbox_item" | "project_estimate";
        deadline: string | null;
        deadlineSource: string;
        tpvCount: number;
        confidence: string;
        startFromIdx: number;
        estimation_level?: number;
        estimation_badge?: string;
        estimation_preset?: string;
      }

      const allWork: ProjectWork[] = [];
      const processedProjects = new Set<string>();

      // Projects with schedule items
      for (const [projectId, hours] of scheduleByProject) {
        processedProjects.add(projectId);
        const proj = projectMap.get(projectId);
        const dl = resolveDeadline(proj || {});
        const realWorkIdx = findEarliestRealWorkIdx(projectId);
        const startIdx = realWorkIdx >= 0 ? realWorkIdx : 0;

        if (!dl.date) {
          const inboxH = inboxByProject.get(projectId) || 0;
          safetyNet.push({ project_id: projectId, project_name: proj?.project_name || projectId, estimated_hours: Math.round(hours + inboxH), source: "scheduled" });
          if (inboxByProject.has(projectId)) processedProjects.add(projectId);
          continue;
        }
        const hasInbox = inboxByProject.has(projectId);
        const inboxHours = inboxByProject.get(projectId) || 0;
        const projTpv = tpvItems.filter(t => t.project_id === projectId);
        allWork.push({
          projectId,
          projectName: proj?.project_name || projectId,
          totalHours: hours + inboxHours,
          source: hasInbox ? "inbox_item" : "existing_plan",
          deadline: dl.date,
          deadlineSource: dl.source,
          tpvCount: projTpv.length || 1,
          confidence: "high",
          startFromIdx: startIdx,
        });
        if (hasInbox) processedProjects.add(projectId);
      }

      // Projects with only inbox items
      for (const [projectId, hours] of inboxByProject) {
        if (processedProjects.has(projectId)) continue;
        processedProjects.add(projectId);
        const proj = projectMap.get(projectId);
        const dl = resolveDeadline(proj || {});
        if (!dl.date) {
          safetyNet.push({ project_id: projectId, project_name: proj?.project_name || projectId, estimated_hours: Math.round(hours), source: "inbox" });
          continue;
        }
        const projTpv = tpvItems.filter(t => t.project_id === projectId);
        allWork.push({
          projectId,
          projectName: proj?.project_name || projectId,
          totalHours: hours,
          source: "inbox_item",
          deadline: dl.date,
          deadlineSource: dl.source,
          tpvCount: projTpv.length || 1,
          confidence: "high",
          startFromIdx: 0,
        });
      }

      // Projects with neither — estimate hours
      for (const proj of projects) {
        if (processedProjects.has(proj.project_id)) continue;
        const dl = resolveDeadline(proj);
        const projTpv = tpvItems.filter(t => t.project_id === proj.project_id);
        const est = estimateProjectHours(proj, projTpv);

        if (!dl.date) {
          safetyNet.push({ project_id: proj.project_id, project_name: proj.project_name, estimated_hours: est.hours, source: "unplanned" });
          continue;
        }

        allWork.push({
          projectId: proj.project_id,
          projectName: proj.project_name,
          totalHours: est.hours,
          source: "project_estimate",
          deadline: dl.date,
          deadlineSource: dl.source,
          tpvCount: projTpv.length || 1,
          confidence: est.level <= 2 ? "medium" : "low",
          startFromIdx: 0,
          estimation_level: est.level,
          estimation_badge: est.badge,
          estimation_preset: est.usedPreset,
        });
      }

      // Sort by deadline ascending
      allWork.sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

      // Distribute each project's hours
      for (const work of allWork) {
        const { allocated, overflow } = distributeHours(work.totalHours, trackUsage, work.deadline, work.startFromIdx);

        for (const alloc of allocated) {
          const proj = projectMap.get(work.projectId);
          blocks.push({
            id: `forecast-${Date.now()}-${blockIdx++}`,
            project_id: work.projectId,
            project_name: work.projectName,
            bundle_description: work.source === "existing_plan" ? "Plán — přeplánováno" :
              work.source === "inbox_item" ? "Inbox — přeplánováno" : work.estimation_badge || "~Výroba — odhad",
            week: alloc.week,
            estimated_hours: Math.round(alloc.hours),
            tpv_item_count: work.tpvCount,
            confidence: work.confidence,
            source: work.source,
            deadline: work.deadline,
            deadline_source: work.deadlineSource,
            tpv_expected_date: work.source === "project_estimate" ? (proj?.datum_tpv || null) : null,
            is_forecast: true,
            estimation_level: work.estimation_level,
            estimation_badge: work.estimation_badge,
            estimation_preset: work.estimation_preset,
          });
        }

        // Overflow → safety net
        if (overflow > 0) {
          safetyNet.push({
            project_id: work.projectId,
            project_name: work.projectName,
            estimated_hours: Math.round(overflow),
            source: "overflow_past_deadline",
          });
        }
      }
    } else {
      // ─── RESPECT PLAN (kolem_planu) mode ───
      const trackUsage = { ...weekUsage };

      // Inbox items bundled per project
      const inboxByProject = new Map<string, { items: typeof inboxItems; totalHours: number }>();
      for (const item of inboxItems) {
        const existing = inboxByProject.get(item.project_id);
        const hours = Number(item.estimated_hours) || 8;
        if (existing) {
          existing.items.push(item);
          existing.totalHours += hours;
        } else {
          inboxByProject.set(item.project_id, { items: [item], totalHours: hours });
        }
      }

      for (const [projectId, group] of inboxByProject) {
        const proj = projectMap.get(projectId);
        const dl = resolveDeadline(proj || {});
        const { allocated, overflow } = distributeHours(group.totalHours, trackUsage, dl.date);

        for (const alloc of allocated) {
          blocks.push({
            id: `forecast-${Date.now()}-${blockIdx++}`,
            project_id: projectId,
            project_name: proj?.project_name || projectId,
            bundle_description: `Inbox — ${group.items.length} položek`,
            week: alloc.week,
            estimated_hours: Math.round(alloc.hours),
            tpv_item_count: group.items.length,
            confidence: "high",
            source: "inbox_item",
            deadline: dl.date,
            deadline_source: dl.source,
            is_forecast: true,
          });
        }

        if (overflow > 0) {
          safetyNet.push({
            project_id: projectId,
            project_name: proj?.project_name || projectId,
            estimated_hours: Math.round(overflow),
            source: "overflow_past_deadline",
          });
        }
      }

      // Unplanned projects — estimate
      const projectsWithSchedule = new Set(scheduleItems.map(s => s.project_id));
      const projectsWithInbox = new Set(inboxItems.map(i => i.project_id));

      for (const proj of projects) {
        if (projectsWithSchedule.has(proj.project_id)) continue;
        if (projectsWithInbox.has(proj.project_id)) continue;

        const dl = resolveDeadline(proj);
        const projTpv = tpvItems.filter(t => t.project_id === proj.project_id);
        const est = estimateProjectHours(proj, projTpv);

        if (!dl.date) {
          safetyNet.push({ project_id: proj.project_id, project_name: proj.project_name, estimated_hours: est.hours, source: "unplanned" });
          continue;
        }

        const confidence = est.level <= 2 ? "medium" : "low";
        const tpvCount = projTpv.length || 1;
        const { allocated, overflow } = distributeHours(est.hours, trackUsage, dl.date);

        for (const alloc of allocated) {
          blocks.push({
            id: `forecast-${Date.now()}-${blockIdx++}`,
            project_id: proj.project_id,
            project_name: proj.project_name,
            bundle_description: est.badge || `~Výroba — odhad`,
            week: alloc.week,
            estimated_hours: Math.round(alloc.hours),
            tpv_item_count: tpvCount,
            confidence,
            source: "project_estimate",
            deadline: dl.date,
            deadline_source: dl.source,
            tpv_expected_date: proj.datum_tpv || null,
            is_forecast: true,
            estimation_level: est.level,
            estimation_badge: est.badge,
            estimation_preset: est.usedPreset,
          });
        }

        if (overflow > 0) {
          safetyNet.push({
            project_id: proj.project_id,
            project_name: proj.project_name,
            estimated_hours: Math.round(overflow),
            source: "overflow_past_deadline",
          });
        }
      }
    }

    console.log(`Forecast generated: ${blocks.length} blocks (${blocks.filter(b => b.source === "existing_plan").length} real, ${blocks.filter(b => b.source === "inbox_item").length} inbox, ${blocks.filter(b => b.source === "project_estimate").length} AI), safetyNet: ${safetyNet.length}`);

    return new Response(JSON.stringify({ blocks, weekKeys, weekUsage, safetyNet, hourlyRate }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("forecast error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
