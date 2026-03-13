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

    // 2. Generate week keys (next 16 weeks from current Monday)
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
      weekKeys.push(d.toISOString().slice(0, 10));
    }

    // 3. Calculate existing usage per week from real schedule
    const weekUsage: Record<string, number> = {};
    for (const wk of weekKeys) weekUsage[wk] = 0;
    for (const si of scheduleItems) {
      if (si.status !== "cancelled" && weekUsage[si.scheduled_week] !== undefined) {
        weekUsage[si.scheduled_week] = (weekUsage[si.scheduled_week] || 0) + Number(si.scheduled_hours);
      }
    }

    // Mutable copy for tracking forecast allocation
    const trackUsage = { ...weekUsage };

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
    let blockIdx = 0;

    const projectMap = new Map(projects.map(p => [p.project_id, p]));

    // ─── TYPE 1: existing_plan — bundle per project per week (only in from_scratch) ───
    if (mode === "from_scratch") {
      // Group schedule items by project+week
      const existingBundles = new Map<string, { projectId: string; week: string; totalHours: number; itemCount: number }>();
      for (const si of scheduleItems) {
        if (si.status === "cancelled") continue;
        const key = `${si.project_id}::${si.scheduled_week}`;
        const existing = existingBundles.get(key);
        if (existing) {
          existing.totalHours += Number(si.scheduled_hours);
          existing.itemCount += 1;
        } else {
          existingBundles.set(key, {
            projectId: si.project_id,
            week: si.scheduled_week,
            totalHours: Number(si.scheduled_hours),
            itemCount: 1,
          });
        }
      }

      for (const [, bundle] of existingBundles) {
        const proj = projectMap.get(bundle.projectId);
        const dl = resolveDeadline(proj || {});
        blocks.push({
          id: `forecast-${Date.now()}-${blockIdx++}`,
          project_id: bundle.projectId,
          project_name: proj?.project_name || bundle.projectId,
          bundle_description: `Plán — ${bundle.itemCount} položek`,
          week: bundle.week,
          estimated_hours: Math.round(bundle.totalHours),
          tpv_item_count: bundle.itemCount,
          confidence: "high",
          source: "existing_plan",
          deadline: dl.date,
          deadline_source: dl.source,
          is_forecast: true,
        });
      }
    }

    // ─── TYPE 2: inbox_item — bundle per project (group all inbox items for same project) ───
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

      // Distribute this project's inbox hours across weeks
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

      // Estimate total hours: sum TPV pocet, or price / 500, or 40h fallback
      const projTpv = tpvItems.filter(t => t.project_id === proj.project_id);
      const tpvHours = projTpv.reduce((s, t) => s + (Number(t.pocet) || 0), 0);
      let estimatedHours = tpvHours > 0
        ? tpvHours
        : (proj.prodejni_cena ? Math.round(Number(proj.prodejni_cena) / 500) : 0);
      if (estimatedHours <= 0) estimatedHours = 40;

      const confidence = tpvHours > 0 ? "medium" : "low";
      const tpvCount = projTpv.length || 1;

      // Distribute across weeks
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

    console.log(`Forecast generated: ${blocks.length} blocks (${blocks.filter(b => b.source === "existing_plan").length} real, ${blocks.filter(b => b.source === "inbox_item").length} inbox, ${blocks.filter(b => b.source === "project_estimate").length} AI)`);

    return new Response(JSON.stringify({ blocks, weekKeys, weekUsage }), {
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
