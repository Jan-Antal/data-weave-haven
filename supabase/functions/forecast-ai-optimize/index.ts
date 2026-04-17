// AI Optimizer for forecast: takes deterministic baseline blocks + capacity context,
// asks Lovable AI to re-balance for better flow (less context-switching, deadline respect, smoothed load).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InputBlock {
  id: string;
  project_id: string;
  project_name: string;
  week: string;
  estimated_hours: number;
  deadline?: string | null;
  source: string;
  bundle_description?: string;
}

interface CapacityWeek {
  week: string;
  capacity: number;
  used: number; // already used by REAL schedule (not forecast)
}

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "propose_schedule",
    description: "Return an optimized schedule of forecast blocks with reasoning per block.",
    parameters: {
      type: "object",
      properties: {
        blocks: {
          type: "array",
          description: "Optimized blocks. Each input block must appear exactly once. Hours must sum per project to the same totals as input. Weeks may be changed.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Original block id from input" },
              week: { type: "string", description: "ISO Monday date YYYY-MM-DD" },
              hours: { type: "number", description: "Hours allocated to this block (may differ from input if you split/merge across same project)" },
              reasoning: { type: "string", description: "Short Czech reasoning (max 120 chars) explaining the placement" },
            },
            required: ["id", "week", "hours", "reasoning"],
            additionalProperties: false,
          },
        },
        warnings: {
          type: "array",
          items: { type: "string" },
          description: "Czech warnings about deadlines that cannot be met or capacity overruns.",
        },
        summary: { type: "string", description: "1-2 sentence Czech summary of optimization choices." },
      },
      required: ["blocks", "warnings", "summary"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { blocks, capacity } = await req.json() as { blocks: InputBlock[]; capacity: CapacityWeek[] };
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return new Response(JSON.stringify({ blocks: [], warnings: [], summary: "Žádné bloky k optimalizaci." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pick model based on portfolio size
    const model = blocks.length > 50 ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview";

    const systemPrompt = `Jsi expert na plánování výroby. Optimalizuj rozvrh výrobních bloků pro lepší flow.

PRAVIDLA (priorita seshora dolů):
1. NEPŘEKROČIT týdenní kapacitu (capacity - used = volné hodiny v týdnu)
2. RESPEKTOVAT deadline — projekt musí být dokončen před uvedeným datem (nebo co nejblíže pokud nejde)
3. PREFEROVAT dokončení projektu v co nejmenším počtu týdnů (méně přepínání kontextu)
4. VYHLADIT zatížení — vyvarovat se prázdných týdnů následovaných přetíženými
5. PRIORITIZOVAT projekty s nejbližším deadline

VÝSTUP:
- Každý vstupní block.id musí být v outputu PRÁVĚ JEDNOU
- Součet hours per project_id musí zůstat stejný (můžeš přesouvat mezi týdny stejného projektu)
- reasoning: česky, krátké (max 120 znaků), proč jsi blok umístil do daného týdne`;

    const userPayload = {
      blocks: blocks.map(b => ({
        id: b.id,
        project_id: b.project_id,
        project_name: b.project_name,
        current_week: b.week,
        hours: b.estimated_hours,
        deadline: b.deadline,
        source: b.source,
      })),
      capacity_weeks: capacity.map(c => ({
        week: c.week,
        free_hours: Math.max(0, c.capacity - c.used),
        total_capacity: c.capacity,
      })),
    };

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Optimalizuj tento rozvrh:\n\n${JSON.stringify(userPayload, null, 2)}` },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "propose_schedule" } },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "rate_limit", message: "AI překročila limit, zkus později." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "payment_required", message: "Vyčerpané AI kredity." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "ai_error", message: `AI selhala (${response.status})` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "no_tool_call", message: "AI nevrátila strukturovaný plán." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool args:", toolCall.function.arguments);
      return new Response(JSON.stringify({ error: "parse_error", message: "AI vrátila neplatný JSON." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Merge AI output back into original blocks (preserve all metadata)
    const blockMap = new Map(blocks.map(b => [b.id, b]));
    const optimized = (parsed.blocks || []).map((aiBlock: any) => {
      const original = blockMap.get(aiBlock.id);
      if (!original) return null;
      return {
        ...original,
        week: aiBlock.week || original.week,
        estimated_hours: Math.round(Number(aiBlock.hours) || original.estimated_hours),
        ai_reasoning: String(aiBlock.reasoning || ""),
      };
    }).filter(Boolean);

    // Sanity check — if AI dropped blocks, append originals as fallback
    const seenIds = new Set(optimized.map((b: any) => b.id));
    for (const orig of blocks) {
      if (!seenIds.has(orig.id)) {
        optimized.push({ ...orig, ai_reasoning: "Ponecháno z deterministického návrhu (AI vynechala)." });
      }
    }

    return new Response(JSON.stringify({
      blocks: optimized,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      summary: String(parsed.summary || ""),
      model_used: model,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("forecast-ai-optimize error:", err);
    return new Response(JSON.stringify({ error: "internal", message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
