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

    // 1. Fetch data
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

    // 3. Calculate existing usage per week
    const weekUsage: Record<string, number> = {};
    for (const wk of weekKeys) weekUsage[wk] = 0;
    for (const si of scheduleItems) {
      if (si.status !== "cancelled" && weekUsage[si.scheduled_week] !== undefined) {
        weekUsage[si.scheduled_week] = (weekUsage[si.scheduled_week] || 0) + Number(si.scheduled_hours);
      }
    }

    // Helper: find first week with enough capacity, starting from startIdx
    function findAvailableWeek(hours: number, usage: Record<string, number>, startIdx = 0): string {
      for (let i = startIdx; i < weekKeys.length; i++) {
        const remaining = capacity - (usage[weekKeys[i]] || 0);
        if (remaining >= Math.min(hours, 1)) return weekKeys[i];
      }
      return weekKeys[weekKeys.length - 1]; // fallback to last week
    }

    // Helper: find week working backwards from deadline
    function findWeekBeforeDeadline(hours: number, deadlineStr: string, usage: Record<string, number>): string {
      const deadline = new Date(deadlineStr);
      // Find the last week that starts before the deadline
      let targetIdx = 0;
      for (let i = weekKeys.length - 1; i >= 0; i--) {
        if (new Date(weekKeys[i]) <= deadline) {
          targetIdx = i;
          break;
        }
      }
      // Work backwards from deadline to find capacity
      for (let i = targetIdx; i >= 0; i--) {
        const remaining = capacity - (usage[weekKeys[i]] || 0);
        if (remaining >= Math.min(hours, 1)) return weekKeys[i];
      }
      // Fallback: find any available week forward
      return findAvailableWeek(hours, usage);
    }

    const blocks: any[] = [];
    let blockIdx = 0;
    // Track usage for scheduling (copy so we can accumulate)
    const trackUsage = { ...weekUsage };

    // ─── TYPE 1: existing_plan (only in from_scratch mode) ───
    if (mode === "from_scratch") {
      for (const si of scheduleItems) {
        if (si.status === "cancelled") continue;
        const proj = projects.find(p => p.project_id === si.project_id);
        blocks.push({
          id: `forecast-${Date.now()}-${blockIdx++}`,
          project_id: si.project_id,
          project_name: proj?.project_name || si.project_id,
          bundle_description: si.item_name,
          week: si.scheduled_week,
          estimated_hours: Number(si.scheduled_hours),
          confidence: "high",
          source: "existing_plan",
          is_forecast: true,
        });
      }
    }

    // ─── TYPE 2: inbox_item ───
    // All pending inbox items → schedule into first available week
    for (const item of inboxItems) {
      const hours = Number(item.estimated_hours) || 8;
      const week = findAvailableWeek(hours, trackUsage);
      trackUsage[week] = (trackUsage[week] || 0) + hours;

      const proj = projects.find(p => p.project_id === item.project_id);
      blocks.push({
        id: `forecast-${Date.now()}-${blockIdx++}`,
        project_id: item.project_id,
        project_name: proj?.project_name || item.project_id,
        bundle_description: item.item_name,
        week,
        estimated_hours: hours,
        confidence: "high",
        source: "inbox_item",
        is_forecast: true,
      });
    }

    // ─── TYPE 3: project_estimate ───
    // Projects with NO production_schedule bundles at all (completely unplanned)
    const projectsWithSchedule = new Set(scheduleItems.map(s => s.project_id));
    const projectsWithInbox = new Set(inboxItems.map(i => i.project_id));

    for (const proj of projects) {
      if (projectsWithSchedule.has(proj.project_id)) continue;
      if (projectsWithInbox.has(proj.project_id)) continue;

      // Resolve deadline
      const deadlineStr = proj.expedice || proj.montaz || proj.predani || proj.datum_smluvni;

      // Estimate hours from TPV or price proxy
      const projTpv = tpvItems.filter(t => t.project_id === proj.project_id);
      const tpvHours = projTpv.reduce((s, t) => s + (Number(t.pocet) || 0), 0);
      const tpvCost = projTpv.reduce((s, t) => s + (Number(t.cena) || 0), 0);
      let estimatedHours = tpvHours > 0 ? tpvHours : (proj.prodejni_cena ? Math.round(Number(proj.prodejni_cena) / 500) : 0);
      if (estimatedHours <= 0) estimatedHours = 40; // minimum fallback

      const confidence = tpvHours > 0 ? "medium" : "low";

      // Place working backwards from deadline, or forward from current week
      let week: string;
      if (deadlineStr) {
        week = findWeekBeforeDeadline(estimatedHours, deadlineStr, trackUsage);
      } else {
        week = findAvailableWeek(estimatedHours, trackUsage);
      }
      trackUsage[week] = (trackUsage[week] || 0) + estimatedHours;

      // Split large estimates across weeks if needed
      if (estimatedHours > capacity * 0.5) {
        const parts = Math.ceil(estimatedHours / (capacity * 0.4));
        const hoursPerPart = Math.round(estimatedHours / parts);
        for (let p = 0; p < parts; p++) {
          const partHours = p === parts - 1 ? estimatedHours - hoursPerPart * (parts - 1) : hoursPerPart;
          const partWeek = findAvailableWeek(partHours, trackUsage, 0);
          trackUsage[partWeek] = (trackUsage[partWeek] || 0) + partHours;
          blocks.push({
            id: `forecast-${Date.now()}-${blockIdx++}`,
            project_id: proj.project_id,
            project_name: proj.project_name,
            bundle_description: `~Výroba — etapa ${p + 1}/${parts}`,
            week: partWeek,
            estimated_hours: partHours,
            confidence,
            source: "project_estimate",
            is_forecast: true,
          });
        }
      } else {
        blocks.push({
          id: `forecast-${Date.now()}-${blockIdx++}`,
          project_id: proj.project_id,
          project_name: proj.project_name,
          bundle_description: `~Výroba — odhad`,
          week,
          estimated_hours: estimatedHours,
          confidence,
          source: "project_estimate",
          is_forecast: true,
        });
      }
    }

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
