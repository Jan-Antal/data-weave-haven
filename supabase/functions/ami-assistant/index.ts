import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Jsi AMI Asistent — inteligentní pomocník pro aplikaci AMI Project Info, interní systém pro správu projektů výroby nábytku na zakázku.

Máš přístup k aktuálním projektovým datům (viz sekce PROJEKTOVÁ DATA níže). Umíš odpovědět na otázky o stavu projektů, termínech, hodinách, pokrytí TPV, výrobě atd.

Hlavní sekce aplikace:
- **Přehled projektů** — tabulka všech projektů s filtry, vyhledáváním a řazením
- **Detail projektu** — popup s informacemi, etapami, TPV položkami a dokumenty
- **TPV Status** — seznam položek (Kód Prvku, Popis, hodiny)
- **Plán výroby** — plánování výrobních kapacit po týdnech
- **Výroba** — sledování průběhu výroby, denní logy
- **Nastavení** (⚙ ikona): správa uživatelů, osob, kurzovního lístku, statusů

Když se uživatel ptá na konkrétní projekt:
- Najdi ho v datech podle názvu nebo ID (i částečná shoda)
- Uveď status, PM, termín, hodiny (plán vs skutečnost), stav TPV a výroby
- Pokud je projekt po termínu nebo má nízké pokrytí, upozorni

Když se ptá obecně ("co hoří?", "jak jsme na tom?"):
- Vyhodnoť projekty po termínu, s nízkým progress, pozastavené
- Shrň celkový stav portfolia

PRAVIDLA:
- Odpovídej česky, přátelským tónem (tykání)
- Odpovědi max 3-5 vět, stručné a konkrétní
- Nepoužívej markdown formátování — pouze čistý text, emoji střídmě
- Čísla zaokrouhluj, procenta uváděj
- Pokud data nemáš nebo dotaz je mimo aplikaci: "Toto je nápověda pro AMI aplikaci. Mohu ti pomoci s projekty nebo ovládáním."`;

// deno-lint-ignore no-explicit-any
async function buildProjectContext(supabase: any): Promise<string> {
  const [projectsRes, tpvRes, scheduleRes, planRes, actualRes] = await Promise.all([
    supabase
      .from("projects")
      .select("project_id, project_name, status, pm, konstrukter, datum_smluvni, prodejni_cena, klient, hodiny_tpv, percent_tpv, currency")
      .is("deleted_at", null)
      .eq("is_test", false)
      .limit(50),
    supabase
      .from("tpv_items")
      .select("project_id")
      .is("deleted_at", null),
    supabase
      .from("production_schedule")
      .select("project_id, status"),
    supabase
      .from("project_plan_hours")
      .select("project_id, hodiny_plan"),
    supabase.rpc("get_hours_by_project"),
  ]);

  const projects = projectsRes.data || [];
  if (projects.length === 0) return "\n=== PROJEKTOVÁ DATA ===\nŽádné aktivní projekty.\n";

  // TPV counts per project
  const tpvMap = new Map<string, number>();
  for (const t of tpvRes.data || []) {
    tpvMap.set(t.project_id, (tpvMap.get(t.project_id) || 0) + 1);
  }

  // Schedule counts per project
  const schedMap = new Map<string, Record<string, number>>();
  for (const s of scheduleRes.data || []) {
    if (!schedMap.has(s.project_id)) schedMap.set(s.project_id, {});
    const m = schedMap.get(s.project_id)!;
    m[s.status] = (m[s.status] || 0) + 1;
  }

  // Plan hours
  const planMap = new Map<string, number>();
  for (const p of planRes.data || []) {
    planMap.set(p.project_id, p.hodiny_plan);
  }

  // Actual hours
  const actualMap = new Map<string, number>();
  for (const a of (actualRes.data || []) as { ami_project_id: string; total_hodiny: number }[]) {
    actualMap.set(a.ami_project_id, Number(a.total_hodiny));
  }

  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = ["\n=== PROJEKTOVÁ DATA (dnes: " + today + ") ==="];

  for (const p of projects) {
    const tpvCount = tpvMap.get(p.project_id) || 0;
    const sched = schedMap.get(p.project_id) || {};
    const planH = planMap.get(p.project_id) || 0;
    const actualH = actualMap.get(p.project_id) || 0;
    const pct = planH > 0 ? Math.round((actualH / planH) * 100) : null;

    const overdue = p.datum_smluvni && p.datum_smluvni < today && p.status !== "Dokončeno" && p.status !== "Fakturace";

    let line = `Projekt ${p.project_id} "${p.project_name}":`;
    line += ` Status: ${p.status || "–"}, PM: ${p.pm || "–"}, Konstruktér: ${p.konstrukter || "–"}`;
    if (p.klient) line += `, Klient: ${p.klient}`;
    if (p.datum_smluvni) line += `, Smluvní termín: ${p.datum_smluvni}`;
    if (overdue) line += ` ⚠️ PO TERMÍNU`;
    line += `, TPV: ${tpvCount} položek (${p.percent_tpv ?? 0}% pokrytí)`;

    const schedParts: string[] = [];
    if (sched.completed) schedParts.push(`${sched.completed} hotovo`);
    if (sched.scheduled || sched.in_progress) schedParts.push(`${(sched.scheduled || 0) + (sched.in_progress || 0)} naplánováno`);
    if (sched.paused) schedParts.push(`${sched.paused} pozastaveno`);
    if (schedParts.length) line += `, Výroba: ${schedParts.join(", ")}`;

    if (planH > 0) {
      line += `, Hodiny: plán ${planH}h, skutečnost ${Math.round(actualH)}h (${pct}%)`;
    }
    if (p.prodejni_cena) {
      line += `, Cena: ${Math.round(p.prodejni_cena).toLocaleString()} ${p.currency || "CZK"}`;
    }

    lines.push(line);
  }

  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, feedbackMode, feedbackMessage, userId, userEmail } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Handle feedback submission
    if (feedbackMode && feedbackMessage) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();

      await supabase.from("feedback").insert({
        user_id: userId,
        user_email: userEmail || "",
        user_name: profile?.full_name || "",
        message: feedbackMessage,
      });

      return new Response(JSON.stringify({ success: true, type: "feedback" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build project context from DB
    const projectContext = await buildProjectContext(supabase);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + projectContext },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Příliš mnoho požadavků, zkus to za chvíli." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Nedostatek kreditů pro AI asistenta." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Chyba AI služby" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ami-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Neznámá chyba" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
