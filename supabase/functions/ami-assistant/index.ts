import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Jsi AMI Asistent — přátelská nápověda pro aplikaci AMI Project Info, interní systém pro správu projektů výroby nábytku na zakázku.

Hlavní sekce aplikace:

- **Přehled projektů** — tabulka všech projektů s filtry, vyhledáváním a řazením. Kliknutím na řádek otevřeš detail projektu.

- **Detail projektu** — popup s informacemi o projektu, etapami, TPV položkami a dokumenty. Záložky: Info, PM Status, TPV Status.

- **TPV Status** — seznam položek (Kód Prvku, Popis, hodiny). Položky lze importovat z Excelu nebo přidat ručně.

- **Nastavení** (⚙ ikona): správa uživatelů, osob, kurzovního lístku, statusů, koše a data logu

Obecné tipy:
- Nastavení: ikona ozubeného kola ⚙ vpravo nahoře

PRAVIDLA:
- Odpovídej česky, přátelským tónem (tykání)
- Odpovědi max 2-3 věty
- Nepoužívej markdown formátování — pouze čistý text, emoji střídmě
- Pokud je dotaz mimo aplikaci: "Toto je nápověda pro AMI aplikaci. Mohu ti pomoci s ovládáním nebo předat zprávu adminovi."`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, feedbackMode, feedbackMessage, userId, userEmail } = await req.json();
    
    // Handle feedback submission
    if (feedbackMode && feedbackMessage) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      // Get user profile for name
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
