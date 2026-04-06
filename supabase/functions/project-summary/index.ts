import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You generate project status summaries for AMI Interior, a Czech furniture manufacturer. Output must be plain text formatted for Slack. No markdown, no HTML, no bold (**text**), no headers. Use only: emojis, newlines, and plain text.

ESCALATION RULES — determine level from data:
- CRITICAL: project past deadline OR 0h worked with deadline < 7 days
- WARNING: deadline < 14 days AND progress < 50% OR tempo too slow to finish
- OK: everything on track

OUTPUT FORMAT — always exactly this structure:

[emoji] [project_id] · [project_name]
PM: [name] · Termín: [date] · [days] dní [do termínu / PO TERMÍNE X dní]

📋 TPV: [count] položek · [value] Kč
⏱ Odpracované: [worked]h z [planned]h ([pct]%)
[if tempo known AND weeks_active >= 4]: 📉 Tempo: [h/week]h/týden · [weeks_remaining] týdnů práce zbývá
[if schedule_total_hours < plan_hours * 0.8]: 📦 Naplánováno ve výrobě: [schedule_total_hours]h z [plan_hours]h ([schedule_pct]%)

[blank line]
[ONE sentence: plain assessment of situation. No fluff.]
[if WARNING or CRITICAL: "Riziko: [specific risk in one sentence.]"]
[if WARNING or CRITICAL: "Akce: [one concrete action.]"]

EMOJI for first line:
✅ = OK
⚠️ = WARNING
🔴 = CRITICAL

Rules:
- Czech language throughout
- Dates format: D.M.YYYY
- Numbers: use spaces as thousands separator (2 800 000)
- If TPV 100% covered: "TPV kompletní" not the percentage
- If worked = 0: "výroba nezačala"
- tempo = worked_hours / weeks_since_first_work (use first_work_date, NOT schedule start)
- weeks_remaining = (planned - worked) / tempo
- If weeks_active < 4: do NOT show tempo or linear projection — say "příliš brzy na odhad tempa"
- If schedule_total_hours is much less than plan_hours, mention that production covers only a fraction
- Never mention "Alfred" or "AI" in the output
- Maximum 8 lines total`;

async function buildProjectData(supabase: ReturnType<typeof createClient>, projectId: string): Promise<string | null> {
  // Find project by partial match
  let { data: projects } = await supabase
    .from("projects")
    .select("project_id, project_name, status, pm, konstrukter, datum_smluvni, prodejni_cena, klient, hodiny_tpv, percent_tpv, currency")
    .is("deleted_at", null)
    .eq("is_test", false)
    .ilike("project_name", `%${projectId}%`)
    .limit(5);

  if (!projects || projects.length === 0) {
    const { data: byId } = await supabase
      .from("projects")
      .select("project_id, project_name, status, pm, konstrukter, datum_smluvni, prodejni_cena, klient, hodiny_tpv, percent_tpv, currency")
      .is("deleted_at", null)
      .eq("is_test", false)
      .ilike("project_id", `%${projectId}%`)
      .limit(5);
    
    if (!byId || byId.length === 0) return null;
    projects = byId;
  }

  const p = projects![0];

  // Parallel data fetch
  const [tpvRes, schedRes, planRes, actualRes] = await Promise.all([
    supabase.from("tpv_items").select("id, cena, pocet").eq("project_id", p.project_id).is("deleted_at", null),
    supabase.from("production_schedule").select("status, scheduled_hours, completed_at, scheduled_week").eq("project_id", p.project_id),
    supabase.from("project_plan_hours").select("hodiny_plan").eq("project_id", p.project_id).single(),
    supabase.rpc("get_hours_by_project"),
  ]);

  const tpvItems = tpvRes.data || [];
  const tpvCount = tpvItems.length;
  const tpvValue = tpvItems.reduce((s, i) => s + (i.cena || 0) * (i.pocet || 1), 0);

  const schedItems = schedRes.data || [];
  const schedByStatus: Record<string, number> = {};
  let scheduleTotalHours = 0;
  let scheduleCompletedHours = 0;
  for (const s of schedItems) {
    schedByStatus[s.status] = (schedByStatus[s.status] || 0) + 1;
    scheduleTotalHours += Number(s.scheduled_hours || 0);
    if (s.status === "completed" || s.completed_at) {
      scheduleCompletedHours += Number(s.scheduled_hours || 0);
    }
  }

  const planH = planRes.data?.hodiny_plan || 0;
  const actualAll = (actualRes.data || []) as { ami_project_id: string; total_hodiny: number; min_datum: string; max_datum: string }[];
  const projectActual = actualAll.find(a => a.ami_project_id === p.project_id);
  const actualH = Number(projectActual?.total_hodiny || 0);
  const firstWorkDate = projectActual?.min_datum || null;

  // Tempo from real work start
  let weeksActive = 0;
  if (firstWorkDate) {
    const start = new Date(firstWorkDate);
    const now = new Date();
    weeksActive = Math.max(1, Math.round((now.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  }

  const today = new Date().toISOString().slice(0, 10);
  const overdue = p.datum_smluvni && p.datum_smluvni < today && p.status !== "Dokončeno" && p.status !== "Fakturace";
  let daysToDeadline: number | null = null;
  if (p.datum_smluvni) {
    daysToDeadline = Math.round((new Date(p.datum_smluvni).getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000));
  }

  return `PROJECT DATA:
project_id: ${p.project_id}
project_name: ${p.project_name}
status: ${p.status || "–"}
pm: ${p.pm || "–"}
konstrukter: ${p.konstrukter || "–"}
klient: ${p.klient || "–"}
datum_smluvni: ${p.datum_smluvni || "neurčen"}
overdue: ${overdue ? "YES" : "NO"}
days_to_deadline: ${daysToDeadline !== null ? daysToDeadline : "unknown"}
prodejni_cena: ${p.prodejni_cena || 0} ${p.currency || "CZK"}
tpv_count: ${tpvCount}
tpv_total_value: ${Math.round(tpvValue)}
percent_tpv: ${p.percent_tpv ?? 0}%
plan_hours: ${planH}
actual_hours: ${Math.round(actualH)}
progress_pct: ${planH > 0 ? Math.round((actualH / planH) * 100) : 0}%
first_work_date: ${firstWorkDate || "none"}
weeks_active: ${weeksActive}
tempo_h_per_week: ${weeksActive >= 4 && actualH > 0 ? Math.round(actualH / weeksActive) : "too_early"}
schedule_total_hours: ${Math.round(scheduleTotalHours)}
schedule_completed_hours: ${Math.round(scheduleCompletedHours)}
schedule_completed: ${schedByStatus.completed || 0}
schedule_in_progress: ${schedByStatus.in_progress || 0}
schedule_scheduled: ${schedByStatus.scheduled || 0}
schedule_paused: ${schedByStatus.paused || 0}
today: ${today}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { projectQuery } = await req.json();
    if (!projectQuery || typeof projectQuery !== "string" || projectQuery.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Zadej název nebo ID projektu." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const projectData = await buildProjectData(supabase, projectQuery.trim());
    if (!projectData) {
      return new Response(JSON.stringify({ error: `Projekt "${projectQuery}" nebyl nalezen.` }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Generate a project status summary from the following data:\n\n${projectData}` },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Chyba AI služby" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const summary = result.choices?.[0]?.message?.content || "Nepodařilo se vygenerovat summary.";

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("project-summary error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Neznámá chyba" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
