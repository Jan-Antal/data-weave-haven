import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ZipReader, BlobReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.34/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You extract line items from Czech furniture price offers (cenová nabídka).
Return ONLY a valid JSON array, no markdown, no explanation:
[{"item_name":"T01","nazev":"Kuchyňská linka","popis":"full description with materials, dimensions, hardware","cena":12500.00,"pocet":1}]
Rules:
- item_name = short code from the document (T01, K01, D-01, etc.). If no code, generate a short code (max 10 chars).
- nazev = short item name / title (e.g. "Kuchyňská linka", "Skříň rohová", "Pracovní deska"). Max 50 chars.
- popis = full item description including material details, dimensions, hardware specs. Merge sub-rows into parent.
- cena = unit price in CZK (if EUR, multiply by 25). NOT total — divide by quantity if needed.
- pocet = quantity, default 1
- Skip totals, subtotals, section headers, notes
- Include ALL line items with prices, nothing missing`;

// Parse XLSX to tab-separated text for non-PDF files
async function parseXlsxToText(bytes: Uint8Array): Promise<string> {
  const blob = new Blob([bytes]);
  const reader = new ZipReader(new BlobReader(blob));
  const entries = await reader.getEntries();

  const readEntry = async (name: string): Promise<string | null> => {
    const entry = entries.find(e => e.filename === name);
    if (!entry || !entry.getData) return null;
    return await entry.getData(new TextWriter());
  };

  const ssXml = await readEntry("xl/sharedStrings.xml");
  const sharedStrings: string[] = [];
  if (ssXml) {
    const siMatches = ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g);
    for (const si of siMatches) {
      const tParts: string[] = [];
      const tMatches = si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g);
      for (const t of tMatches) {
        tParts.push(t[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'));
      }
      sharedStrings.push(tParts.join(""));
    }
  }

  const sheetXml = await readEntry("xl/worksheets/sheet1.xml");
  if (!sheetXml) { await reader.close(); return "[Could not read sheet1]"; }

  function colToIndex(col: string): number {
    let idx = 0;
    for (let i = 0; i < col.length; i++) idx = idx * 26 + (col.charCodeAt(i) - 64);
    return idx - 1;
  }

  const rows: Map<number, string[]> = new Map();
  let maxCol = 0;

  const rowMatches = sheetXml.matchAll(/<row[^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g);
  for (const rm of rowMatches) {
    const rowNum = parseInt(rm[1]);
    const cellMatches = rm[2].matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>/g);
    const rowCells: [number, string][] = [];
    for (const cm of cellMatches) {
      const attrs = cm[1];
      const body = cm[2];
      const rMatch = attrs.match(/r="([A-Z]+)\d+"/);
      if (!rMatch) continue;
      const tMatch = attrs.match(/t="([^"]*)"/);
      const cellType = tMatch ? tMatch[1] : "";
      const valMatch = body.match(/<v>([\s\S]*?)<\/v>/);
      let val = valMatch ? valMatch[1] : "";
      if (cellType === "s") {
        const idx = parseInt(val);
        val = (idx >= 0 && idx < sharedStrings.length) ? sharedStrings[idx] : val;
      } else if (cellType === "inlineStr") {
        const isMatch = body.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        if (isMatch) val = isMatch[1];
      }
      const colIdx = colToIndex(rMatch[1]);
      if (colIdx > maxCol) maxCol = colIdx;
      rowCells.push([colIdx, val.trim()]);
    }
    if (rowCells.length > 0) {
      const arr: string[] = new Array(maxCol + 1).fill("");
      for (const [ci, v] of rowCells) arr[ci] = v;
      rows.set(rowNum, arr);
    }
  }

  await reader.close();

  const sortedKeys = [...rows.keys()].sort((a, b) => a - b);
  const finalWidth = maxCol + 1;
  const lines: string[] = [];
  for (const key of sortedKeys.slice(0, 250)) {
    const row = rows.get(key)!;
    while (row.length < finalWidth) row.push("");
    const line = row.join("\t");
    if (line.trim()) lines.push(line);
  }
  return lines.join("\n");
}

// Build Claude message content based on file type
function buildClaudeContent(isPdf: boolean, fileBase64: string, mimeType: string, excelText?: string): any[] {
  if (isPdf) {
    return [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: fileBase64 },
      },
      { type: "text", text: "Extract all line items from this price offer. Return only the JSON array." },
    ];
  }
  // Excel/other: send as text
  return [
    {
      type: "text",
      text: `Below is the tab-separated content of a Czech furniture price offer spreadsheet.\nExtract all priced line items. Return ONLY the JSON array.\n\n${excelText}`,
    },
  ];
}

async function callClaude(content: any[]): Promise<any[]> {
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
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fileBase64, mimeType } = await req.json();

    if (!fileBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: "Missing fileBase64 or mimeType" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isPdf = mimeType === "application/pdf";
    let excelText: string | undefined;

    if (!isPdf) {
      // Parse Excel to text
      const bytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
      try {
        excelText = await parseXlsxToText(bytes);
      } catch (e) {
        console.warn("XLSX parse failed, sending raw:", e);
        excelText = `[Binary file, ${bytes.length} bytes — could not parse]`;
      }
    }

    const content = buildClaudeContent(isPdf, fileBase64, mimeType, excelText);
    const items = await callClaude(content);

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("extract-tpv error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
