import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { mode, weeklyCapacityHours } = await req.json();

    // 1. Fetch active projects with milestone dates
    const { data: projects } = await sb
      .from("projects")
      .select("project_id, project_name, status, expedice, montaz, predani, datum_smluvni, prodejni_cena")
      .is("deleted_at", null)
      .not("status", "in", '("Fakturace","Dokončeno")');

    // 2. Fetch TPV items with hours/costs
    const { data: tpvItems } = await sb
      .from("tpv_items")
      .select("project_id, item_name, item_type, pocet, cena, status")
      .is("deleted_at", null);

    // 3. Fetch existing schedule
    const { data: scheduleItems } = await sb
      .from("production_schedule")
      .select("id, project_id, item_name, item_code, scheduled_week, scheduled_hours, scheduled_czk, status")
      .in("status", ["scheduled", "in_progress", "completed", "paused"]);

    // 4. Fetch inbox items
    const { data: inboxItems } = await sb
      .from("production_inbox")
      .select("id, project_id, item_name, item_code, estimated_hours, estimated_czk, status")
      .eq("status", "pending");

    // 5. Build context for AI
    const today = new Date();
    const currentWeekKey = (() => {
      const d = new Date(today);
      const day = d.getDay();
      d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
      return d.toISOString().slice(0, 10);
    })();

    // Generate next 16 week keys
    const weekKeys: string[] = [];
    const baseMonday = new Date(currentWeekKey);
    for (let i = 0; i < 16; i++) {
      const d = new Date(baseMonday);
      d.setDate(baseMonday.getDate() + i * 7);
      weekKeys.push(d.toISOString().slice(0, 10));
    }

    // Calculate existing usage per week
    const weekUsage: Record<string, number> = {};
    for (const wk of weekKeys) weekUsage[wk] = 0;
    for (const si of (scheduleItems || [])) {
      if (si.status !== "cancelled" && weekUsage[si.scheduled_week] !== undefined) {
        weekUsage[si.scheduled_week] = (weekUsage[si.scheduled_week] || 0) + si.scheduled_hours;
      }
    }

    // Build project summaries with source categorization
    const projectSummaries = (projects || []).map(p => {
      const deadline = p.expedice || p.montaz || p.predani || p.datum_smluvni || "none";
      const tpv = (tpvItems || []).filter(t => t.project_id === p.project_id);
      const totalTpvHours = tpv.reduce((s, t) => s + (t.pocet || 0), 0);
      const totalTpvCost = tpv.reduce((s, t) => s + (t.cena || 0), 0);
      const scheduled = (scheduleItems || []).filter(s => s.project_id === p.project_id && s.status !== "cancelled");
      const scheduledHours = scheduled.reduce((s, i) => s + i.scheduled_hours, 0);
      const inbox = (inboxItems || []).filter(i => i.project_id === p.project_id);
      const inboxHours = inbox.reduce((s, i) => s + i.estimated_hours, 0);

      // Estimate hours if TPV incomplete: use project price / 500
      const estimatedProjectHours = totalTpvHours > 0 
        ? totalTpvHours 
        : (p.prodejni_cena ? Math.round(p.prodejni_cena / 500) : 0);

      const hasScheduledBundles = scheduled.length > 0;
      const hasInboxItems = inbox.length > 0;
      const hasNoPlanAtAll = !hasScheduledBundles && !hasInboxItems;

      return {
        id: p.project_id,
        name: p.project_name,
        deadline,
        status: p.status,
        totalTpvHours,
        totalTpvCost,
        estimatedProjectHours,
        scheduledHours,
        inboxHours,
        price: p.prodejni_cena,
        inboxItemCount: inbox.length,
        scheduledItemCount: scheduled.length,
        hasScheduledBundles,
        hasInboxItems,
        hasNoPlanAtAll,
        // Tell AI which source type to use
        inboxItemNames: inbox.map(i => ({ name: i.item_name, hours: i.estimated_hours, id: i.id })),
      };
    });

    // Filter based on mode
    const relevantProjects = projectSummaries.filter(p => {
      if (mode === "from_scratch") return true;
      // respect_plan: include projects with inbox items OR projects with no plan at all
      return p.hasInboxItems || p.hasNoPlanAtAll;
    });

    const systemPrompt = `You are a production scheduling AI for a furniture manufacturing company.
You must return ONLY a valid JSON array of forecast blocks. No markdown, no explanation.

CRITICAL: There are THREE types of forecast blocks based on source:
1. "inbox_item" — items currently in the production inbox that need scheduling into weeks
2. "project_estimate" — projects that have deadlines but NO plan bundles yet; estimate production time based on deadline and estimated hours
3. "existing_plan" — ONLY used in "from_scratch" mode to represent where existing planned items would be rescheduled

Rules:
- Each block: { "project_id": string, "project_name": string, "bundle_description": string, "week": string (YYYY-MM-DD format), "estimated_hours": number, "confidence": "high"|"medium"|"low", "source": "inbox_item"|"project_estimate"|"existing_plan" }
- Respect weekly capacity of ${weeklyCapacityHours} hours per week
- Available weeks: ${JSON.stringify(weekKeys)}
- Schedule projects with earlier deadlines first, working backwards from deadline
- Split large projects across multiple weeks if needed
- For inbox_item: use the actual item names and hours from inbox
- For project_estimate: create descriptive bundles like "Výroba — etapa 1", use "~" prefix on description to indicate estimate
- Confidence: "high" for inbox items with exact hours, "medium" for projects with TPV data, "low" for projects estimated from price
${mode === "respect_plan" 
  ? `- Existing schedule usage per week: ${JSON.stringify(weekUsage)}
- Only schedule UNPLANNED items (inbox + no-plan projects). Do NOT reschedule existing planned items.
- Available capacity per week = ${weeklyCapacityHours} - existing_usage
- Use source "inbox_item" for inbox items, "project_estimate" for projects with no plan`
  : `- Ignore existing schedule. Reschedule ALL items optimally.
- Existing planned items become source "existing_plan"
- Inbox items become source "inbox_item"  
- Projects with no bundles become source "project_estimate"
- Total hours include existing + inbox + estimate hours`
}
- Return an empty array [] if there's nothing to schedule.`;

    const userPrompt = `Schedule the following projects into production weeks:

${JSON.stringify(relevantProjects, null, 2)}

Return ONLY a JSON array of forecast blocks.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Příliš mnoho požadavků, zkuste to znovu za chvíli." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Nedostatek kreditů. Doplňte kredity v nastavení." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResponse.text();
      console.error("AI gateway error:", status, t);
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let blocks;
    try {
      blocks = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", jsonStr);
      blocks = [];
    }

    const validSources = ["inbox_item", "project_estimate", "existing_plan"];
    const validBlocks = (Array.isArray(blocks) ? blocks : []).map((b: any, i: number) => ({
      id: `forecast-${Date.now()}-${i}`,
      project_id: b.project_id || "",
      project_name: b.project_name || "",
      bundle_description: b.bundle_description || "Forecast",
      week: b.week || weekKeys[0],
      estimated_hours: Number(b.estimated_hours) || 0,
      confidence: ["high", "medium", "low"].includes(b.confidence) ? b.confidence : "medium",
      source: validSources.includes(b.source) ? b.source : "project_estimate",
      is_forecast: true,
    }));

    return new Response(JSON.stringify({ blocks: validBlocks, weekKeys, weekUsage }), {
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
