import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ZipReader, BlobReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.34/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Unified CN extraction prompt ─────────────────────────────────────────────

const CN_SYSTEM_PROMPT = `Jsi expert na extrakci dat z českých cenových nabídek (CN) na nábytek.

Vstup je tabulka (buď text z Excelu, nebo PDF). Extrahuj VŠECHNY řádkové položky nábytku.

Pro každou položku vrať:
- kod_prvku: kód prvku přesně jak je v dokumentu (např. T01, K01, D-01, SK01, S1 atd.)
- nazev: krátký název prvku (max 40 znaků, BEZ rozměrů a materiálů)
- popis: KOMPLETNÍ technický popis — materiály, kování, povrchové úpravy, barvy, typ dřeva, ABS hrany, úchytky, mechanismy. BEZ rozměrů (šířka, výška, hloubka, mm, cm). Spoj VŠECHNY řádky popisu které k položce patří do jednoho textu.
- cena: jednotková cena v CZK (pouze číslo)
- pocet: počet kusů (výchozí 1)

PRAVIDLA:
- Pokud má položka kód ale NEMÁ cenu, je to pravděpodobně pokračování popisu předchozí položky — přidej text do popis předchozí.
- PŘESKOČ: součty, mezisoučty, DPH, dopravu, montáž, manipulaci, odvoz, záhlaví místností (Ložnice, Koupelna atd.), záhlaví sekcí bez ceny.
- Pole popis je NEJDŮLEŽITĚJŠÍ — musí obsahovat všechny technické specifikace. Nikdy ho nevynechej ani nezkracuj.
- Vrať POUZE platný JSON pole, bez markdownu, bez vysvětlení.`;

// ─── XLSX helpers ─────────────────────────────────────────────────────────────

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const parts: string[] = [];
    for (const t of m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) {
      parts.push(t[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#13;/g, ''));
    }
    strings.push(parts.join(''));
  }
  return strings;
}

function parseWorksheetCells(xml: string, ss: string[]): (string | null)[][] {
  function colToIdx(col: string): number {
    let idx = 0;
    for (let i = 0; i < col.length; i++) idx = idx * 26 + (col.charCodeAt(i) - 64);
    return idx - 1;
  }

  const rows: (string | null)[][] = [];
  for (const rm of xml.matchAll(/<row[^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowIdx = parseInt(rm[1]) - 1;
    const cells: (string | null)[] = [];
    for (const cm of rm[2].matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[1], body = cm[2];
      const ref = attrs.match(/r="([A-Z]+)\d+"/);
      if (!ref) continue;
      const colIdx = colToIdx(ref[1]);
      const t = (attrs.match(/t="([^"]*)"/)||[])[1] || '';
      const v = (body.match(/<v>([\s\S]*?)<\/v>/)||[])[1] || null;
      let val = v;
      if (val && t === 's') {
        const i = parseInt(val);
        val = (i >= 0 && i < ss.length) ? ss[i] : val;
      } else if (val && t === '' && /^\d+$/.test(val)) {
        const i = parseInt(val);
        if (i >= 0 && i < ss.length && ss[i] && /[a-zA-ZáčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(ss[i])) {
          val = ss[i];
        }
      }
      while (cells.length <= colIdx) cells.push(null);
      cells[colIdx] = val?.trim() || null;
    }
    while (rows.length <= rowIdx) rows.push([]);
    rows[rowIdx] = cells;
  }
  return rows;
}

function cellsToTSV(rows: (string | null)[][]): string {
  const lines: string[] = [];
  for (const row of rows) {
    if (!row || row.every(c => !c)) continue;
    const cols = row.map(c => c ?? '');
    lines.push(cols.join('\t'));
  }
  return lines.join('\n');
}

// ─── AI extraction via Lovable AI Gateway ─────────────────────────────────────

async function extractViaAI(text: string): Promise<any[]> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

  const toolDef = {
    type: "function",
    function: {
      name: "extract_cn_items",
      description: "Extract all furniture line items from a Czech price offer (cenová nabídka).",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                kod_prvku: { type: "string", description: "Item code (e.g. T01, K01, D-01)" },
                nazev: { type: "string", description: "Short item name, max 40 chars" },
                popis: { type: "string", description: "Complete technical description with materials, hardware, finishes, dimensions" },
                cena: { type: "number", description: "Unit price in CZK" },
                pocet: { type: "number", description: "Quantity, default 1" },
              },
              required: ["kod_prvku", "nazev", "popis", "cena", "pocet"],
              additionalProperties: false,
            },
          },
        },
        required: ["items"],
        additionalProperties: false,
      },
    },
  };

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: CN_SYSTEM_PROMPT },
        { role: "user", content: `Zde je obsah cenové nabídky:\n\n${text}` },
      ],
      tools: [toolDef],
      tool_choice: { type: "function", function: { name: "extract_cn_items" } },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("Lovable AI error:", response.status, err);
    if (response.status === 429) throw new Error("AI rate limit exceeded, try again later");
    if (response.status === 402) throw new Error("AI credits exhausted");
    throw new Error(`AI extraction error [${response.status}]`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    const parsed = JSON.parse(toolCall.function.arguments);
    return parsed.items || [];
  }

  // Fallback: try parsing content as JSON
  const content = data.choices?.[0]?.message?.content ?? "";
  try {
    const items = JSON.parse(content);
    return Array.isArray(items) ? items : items.items || [];
  } catch {
    const match = content.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  }
}

// ─── XLSX extraction (AI-powered) ─────────────────────────────────────────────

async function extractFromXLSX(buffer: ArrayBuffer): Promise<any[]> {
  const zipReader = new ZipReader(new BlobReader(new Blob([buffer])));
  const entries = await zipReader.getEntries();
  let ssXml = '', wsXml = '';
  for (const e of entries) {
    if (e.filename === 'xl/sharedStrings.xml') ssXml = await e.getData!(new TextWriter());
    if (e.filename === 'xl/worksheets/sheet1.xml') wsXml = await e.getData!(new TextWriter());
  }
  await zipReader.close();
  const ss = parseSharedStrings(ssXml);
  const rows = parseWorksheetCells(wsXml, ss);
  const tsv = cellsToTSV(rows);

  console.log(`XLSX parsed: ${rows.length} rows, TSV length: ${tsv.length} chars`);

  return await extractViaAI(tsv);
}

// ─── PDF extraction (Claude — best for visual documents) ──────────────────────

async function extractFromPDF(fileBase64: string): Promise<any[]> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "pdfs-2024-09-25",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: CN_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } },
          { type: "text", text: "Extrahuj všechny oceněné položky nábytku. Pro každou položku spoj hlavní řádek (Kód, Název, Rozměr, Cena) se VŠEMI následujícími řádky specifikací do pole popis. Přeskoč záhlaví sekcí bez cen." },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("Claude API error:", response.status, err);
    throw new Error(`Claude API error [${response.status}]: ${err}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "";

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  }
}

// ─── HTTP HANDLER ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileBase64, mimeType } = await req.json();

    if (!fileBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: "Missing fileBase64 or mimeType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isPdf = mimeType === "application/pdf";
    let items: any[];

    if (isPdf) {
      console.log("Extracting from PDF via Claude API");
      items = await extractFromPDF(fileBase64);
    } else {
      console.log("Extracting from XLSX via Lovable AI (Gemini)");
      const bytes = Uint8Array.from(atob(fileBase64), (char) => char.charCodeAt(0));
      items = await extractFromXLSX(bytes.buffer);
    }

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-tpv error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
