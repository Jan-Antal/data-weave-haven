import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { mode, weeklyCapacityHours } = await req.json();
    const capacity = Number(weeklyCapacityHours) || 875;

    // 1. Fetch all data in parallel
    const [projectsRes, tpvRes, scheduleRes, inboxRes] = await Promise.all([
      sb.from("projects")
        .select("project_id, project_name, status, expedice, montaz, predani, datum_smluvni, prodejni_cena")
        .is("deleted_at", null)
        .not("status", "in", '("Fakturace","Dokončeno")'),
      sb.from("tpv_items")
        .select("project_id, item_name, pocet, cena")
        .is("deleted_at", null),
      sb.from("production_schedule")
        .select("id, project_id, item_name, item_code, scheduled_week, scheduled_hours, scheduled_czk, status")
        .in("status", ["scheduled", "in_progress", "completed", "paused"]),
      sb.from("production_inbox")
        .select("id, project_id, item_name, item_code, estimated_hours, estimated_czk, status")
        .eq("status", "pending"),
    ]);

    const projects = projectsRes.data || [];
    const tpvItems = tpvRes.data || [];
    const scheduleItems = scheduleRes.data || [];
    const inboxItems = inboxRes.data || [];

    // 2. Generate week keys (next 16 weeks from current Monday) — timezone-safe
    const today = new Date();
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() + mondayOffset);
    currentMonday.setHours(0, 0, 0, 0);

    const weekKeys: string[] = [];
    for (let i = 0; i < 16; i++) {
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

    // Helper: resolve deadline with source label
    function resolveDeadline(proj: any): { date: string | null; source: string } {
      if (proj.expedice) return { date: proj.expedice, source: "expedice" };
      if (proj.montaz) return { date: proj.montaz, source: "montaz" };
      if (proj.predani) return { date: proj.predani, source: "predani" };
      if (proj.datum_smluvni) return { date: proj.datum_smluvni, source: "smluvni" };
      return { date: null, source: "none" };
    }

    // Helper: distribute totalHours across weeks, returns array of { week, hours }
    function distributeHours(
      totalHours: number,
      usage: Record<string, number>,
      deadlineStr: string | null,
      startFromIdx = 0,
    ): { week: string; hours: number }[] {
      const result: { week: string; hours: number }[] = [];
      let remaining = totalHours;

      // Determine target index (work backwards from deadline or forward)
      let startIdx = startFromIdx;
      if (deadlineStr) {
        const deadline = new Date(deadlineStr);
        // Find latest week starting before deadline
        for (let i = weekKeys.length - 1; i >= 0; i--) {
          if (new Date(weekKeys[i]) <= deadline) {
            startIdx = i;
            break;
          }
        }
        // Try to fill backwards from deadline
        for (let i = startIdx; i >= 0 && remaining > 0; i--) {
          const avail = capacity - (usage[weekKeys[i]] || 0);
          if (avail > 0) {
            const alloc = Math.min(remaining, avail);
            result.push({ week: weekKeys[i], hours: alloc });
            usage[weekKeys[i]] = (usage[weekKeys[i]] || 0) + alloc;
            remaining -= alloc;
          }
        }
      }

      // Fill forward for whatever remains
      for (let i = 0; i < weekKeys.length && remaining > 0; i++) {
        // Skip weeks we already allocated to in backward pass
        if (result.some(r => r.week === weekKeys[i])) continue;
        const avail = capacity - (usage[weekKeys[i]] || 0);
        if (avail > 0) {
          const alloc = Math.min(remaining, avail);
          result.push({ week: weekKeys[i], hours: alloc });
          usage[weekKeys[i]] = (usage[weekKeys[i]] || 0) + alloc;
          remaining -= alloc;
        }
      }

      // Absolute fallback: put remaining in last week
      if (remaining > 0) {
        const lastWeek = weekKeys[weekKeys.length - 1];
        result.push({ week: lastWeek, hours: remaining });
        usage[lastWeek] = (usage[lastWeek] || 0) + remaining;
      }

      return result;
    }

    const blocks: any[] = [];
    const safetyNet: any[] = [];
    let blockIdx = 0;
    const projectMap = new Map(projects.map(p => [p.project_id, p]));

    if (mode === "from_scratch") {
      // ─── FROM SCRATCH: reschedule everything from zero ───
      // Reset usage — ignore all existing scheduled_week values
      const trackUsage: Record<string, number> = {};
      for (const wk of weekKeys) trackUsage[wk] = 0;

      // Collect per-project data
      const scheduleByProject = new Map<string, number>();
      for (const si of scheduleItems) {
        if (si.status === "cancelled") continue;
        scheduleByProject.set(si.project_id, (scheduleByProject.get(si.project_id) || 0) + Number(si.scheduled_hours));
      }

      const inboxByProject = new Map<string, number>();
      for (const item of inboxItems) {
        inboxByProject.set(item.project_id, (inboxByProject.get(item.project_id) || 0) + (Number(item.estimated_hours) || 8));
      }

      // Build unified project list with total hours and source
      interface ProjectWork {
        projectId: string;
        projectName: string;
        totalHours: number;
        source: "existing_plan" | "inbox_item" | "project_estimate";
        deadline: string | null;
        deadlineSource: string;
        tpvCount: number;
        confidence: string;
      }

      const allWork: ProjectWork[] = [];
      const processedProjects = new Set<string>();

      // Projects with schedule items
      for (const [projectId, hours] of scheduleByProject) {
        processedProjects.add(projectId);
        const proj = projectMap.get(projectId);
        const dl = resolveDeadline(proj || {});
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
        });
        if (hasInbox) processedProjects.add(projectId);
      }

      // Projects with only inbox items (no schedule)
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
        });
      }

      // Projects with neither — estimate hours
      for (const proj of projects) {
        if (processedProjects.has(proj.project_id)) continue;
        const dl = resolveDeadline(proj);
        if (!dl.date) {
          const projTpvEst = tpvItems.filter(t => t.project_id === proj.project_id);
          const tpvH = projTpvEst.reduce((s, t) => s + (Number(t.pocet) || 0), 0);
          let estH = tpvH > 0 ? tpvH : (proj.prodejni_cena ? Math.round(Number(proj.prodejni_cena) / 500) : 0);
          if (estH <= 0) estH = 40;
          safetyNet.push({ project_id: proj.project_id, project_name: proj.project_name, estimated_hours: estH, source: "unplanned" });
          continue;
        }
        const projTpv = tpvItems.filter(t => t.project_id === proj.project_id);
        const tpvHours = projTpv.reduce((s, t) => s + (Number(t.pocet) || 0), 0);
        let estimatedHours = tpvHours > 0
          ? tpvHours
          : (proj.prodejni_cena ? Math.round(Number(proj.prodejni_cena) / 500) : 0);
        if (estimatedHours <= 0) estimatedHours = 40;

        allWork.push({
          projectId: proj.project_id,
          projectName: proj.project_name,
          totalHours: estimatedHours,
          source: "project_estimate",
          deadline: dl.date,
          deadlineSource: dl.source,
          tpvCount: projTpv.length || 1,
          confidence: tpvHours > 0 ? "medium" : "low",
        });
      }

      // Sort by deadline ascending (earliest first)
      allWork.sort((a, b) => {
        const da = new Date(a.deadline!).getTime();
        const db = new Date(b.deadline!).getTime();
        return da - db;
      });

      // Distribute each project's hours from week 0 forward
      for (const work of allWork) {
        const weekAllocs = distributeHours(work.totalHours, trackUsage, work.deadline, 0);

        for (const alloc of weekAllocs) {
          blocks.push({
            id: `forecast-${Date.now()}-${blockIdx++}`,
            project_id: work.projectId,
            project_name: work.projectName,
            bundle_description: work.source === "existing_plan" ? "Plán — přeplánováno" :
              work.source === "inbox_item" ? "Inbox — přeplánováno" : "~Výroba — odhad",
            week: alloc.week,
            estimated_hours: Math.round(alloc.hours),
            tpv_item_count: work.tpvCount,
            confidence: work.confidence,
            source: work.source,
            deadline: work.deadline,
            deadline_source: work.deadlineSource,
            is_forecast: true,
          });
        }
      }
    } else {
      // ─── RESPECT PLAN (kolem_planu) mode — unchanged ───

      // Mutable copy for tracking forecast allocation
      const trackUsage = { ...weekUsage };

      // ─── TYPE 2: inbox_item — bundle per project ───
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
        const weekAllocs = distributeHours(group.totalHours, trackUsage, dl.date);

        for (const alloc of weekAllocs) {
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
      }

      // ─── TYPE 3: project_estimate — completely unplanned projects ───
      const projectsWithSchedule = new Set(scheduleItems.map(s => s.project_id));
      const projectsWithInbox = new Set(inboxItems.map(i => i.project_id));

      for (const proj of projects) {
        if (projectsWithSchedule.has(proj.project_id)) continue;
        if (projectsWithInbox.has(proj.project_id)) continue;

        const dl = resolveDeadline(proj);
        const projTpv = tpvItems.filter(t => t.project_id === proj.project_id);
        const tpvHours = projTpv.reduce((s, t) => s + (Number(t.pocet) || 0), 0);
        let estimatedHours = tpvHours > 0
          ? tpvHours
          : (proj.prodejni_cena ? Math.round(Number(proj.prodejni_cena) / 500) : 0);
        if (estimatedHours <= 0) estimatedHours = 40;

        if (!dl.date) {
          safetyNet.push({ project_id: proj.project_id, project_name: proj.project_name, estimated_hours: estimatedHours, source: "unplanned" });
          continue;
        }

        const confidence = tpvHours > 0 ? "medium" : "low";
        const tpvCount = projTpv.length || 1;
        const weekAllocs = distributeHours(estimatedHours, trackUsage, dl.date);

        for (const alloc of weekAllocs) {
          blocks.push({
            id: `forecast-${Date.now()}-${blockIdx++}`,
            project_id: proj.project_id,
            project_name: proj.project_name,
            bundle_description: `~Výroba — odhad`,
            week: alloc.week,
            estimated_hours: Math.round(alloc.hours),
            tpv_item_count: tpvCount,
            confidence,
            source: "project_estimate",
            deadline: dl.date,
            deadline_source: dl.source,
            is_forecast: true,
          });
        }
      }
    }

    console.log(`Forecast generated: ${blocks.length} blocks (${blocks.filter(b => b.source === "existing_plan").length} real, ${blocks.filter(b => b.source === "inbox_item").length} inbox, ${blocks.filter(b => b.source === "project_estimate").length} AI), safetyNet: ${safetyNet.length}`);

    return new Response(JSON.stringify({ blocks, weekKeys, weekUsage, safetyNet }), {
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
