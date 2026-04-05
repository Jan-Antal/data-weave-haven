import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ZipReader, BlobReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.34/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You extract line items from Czech furniture price offers.

EXACT FILE STRUCTURE:
Each item has TWO parts spanning multiple rows:
  ROW 1 (main row): | Kód | Název | Rozměr | Cena |
  ROW 2+ (spec rows): | (empty) | specification text | (empty) | (empty) |
  
Example:
  K01 | Pracovní deska | 3200×650×20mm | 48500
      | Keramica Bianco matt, hrana ABS 2mm černá
      | Lepení, montáž included
  K02 | Dvířka | 400×720mm | 8200
      | MDF lakovaný bílý mat RAL9003, závěsy Blum

Between items there are GROUP HEADER rows like:
  T01 | Kuchyň | | (no price → skip as item)

EXTRACTION RULES:
1. item_name = Kód from ROW 1 (K01, K02, D-01, etc.)
2. nazev = Název from ROW 1 (short name, no dimensions)
3. rozmer = Rozměr from ROW 1 (dimensions only, e.g. "3200×650×20mm")
4. cena = price from ROW 1 (unit price in CZK, number only)
5. pocet = quantity if present, default 1
6. jednotka = unit (ks, m², bm), default "ks"
7. popis_short = nazev + rozmer in one line
   Example: "Pracovní deska 3200×650×20mm"
8. popis_full = ALL specification rows concatenated after the main row
   Example: "Keramica Bianco matt, hrana ABS 2mm černá. Lepení, montáž included."
   Include group context: "[Kuchyň] Pracovní deska 3200×650×20mm. Keramica Bianco..."

SKIP: Group header rows (T01, T02 etc. with no price), totals, empty rows.

Return ONLY valid JSON, no markdown:
[{
  "item_name": "K01",
  "nazev": "Pracovní deska",
  "popis_short": "Pracovní deska 3200×650×20mm",
  "popis_full": "[Kuchyň] Pracovní deska 3200×650×20mm. Keramica Bianco matt, hrana ABS 2mm černá.",
  "cena": 48500,
  "pocet": 1,
  "jednotka": "ks"
}]`;

function normalizeWhitespace(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseWorksheetRows(xml: string, sharedStrings: string[]): { rowNum: number; text: string }[] {
  function colToIndex(col: string): number {
    let idx = 0;
    for (let i = 0; i < col.length; i++) idx = idx * 26 + (col.charCodeAt(i) - 64);
    return idx - 1;
  }

  const rows: { rowNum: number; text: string }[] = [];

  for (const rm of xml.matchAll(/<row[^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNum = parseInt(rm[1], 10);
    const rowCells: [number, string][] = [];
    let maxCol = -1;

    for (const cm of rm[2].matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[1];
      const body = cm[2];
      const refMatch = attrs.match(/r="([A-Z]+)\d+"/);
      if (!refMatch) continue;

      const typeMatch = attrs.match(/t="([^"]*)"/);
      const cellType = typeMatch ? typeMatch[1] : "";
      const valueMatch = body.match(/<v>([\s\S]*?)<\/v>/);
      let value = valueMatch ? valueMatch[1] : "";

      if (cellType === "s") {
        const idx = parseInt(value, 10);
        value = idx >= 0 && idx < sharedStrings.length ? sharedStrings[idx] : value;
      } else if (cellType === "inlineStr") {
        const inlineMatch = body.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        if (inlineMatch) value = inlineMatch[1];
      }

      value = normalizeWhitespace(
        value
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"'),
      );

      const colIdx = colToIndex(refMatch[1]);
      maxCol = Math.max(maxCol, colIdx);
      rowCells.push([colIdx, value]);
    }

    if (rowCells.length === 0) continue;

    const cells = Array.from({ length: maxCol + 1 }, () => "");
    for (const [colIdx, value] of rowCells) cells[colIdx] = value;

    const text = normalizeWhitespace(cells.filter(Boolean).join(" | "));
    if (!text) continue;
    rows.push({ rowNum, text });
  }

  return rows;
}

async function parseXlsxToText(bytes: Uint8Array): Promise<string> {
  const blob = new Blob([bytes]);
  const reader = new ZipReader(new BlobReader(blob));
  const entries = await reader.getEntries();

  const readEntry = async (name: string): Promise<string | null> => {
    const entry = entries.find((candidate) => candidate.filename === name);
    if (!entry || !entry.getData) return null;
    return await entry.getData(new TextWriter());
  };

  const ssXml = await readEntry("xl/sharedStrings.xml");
  const sharedStrings: string[] = [];
  if (ssXml) {
    for (const si of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const parts: string[] = [];
      for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) {
        parts.push(
          t[1]
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"'),
        );
      }
      sharedStrings.push(normalizeWhitespace(parts.join("")));
    }
  }

  const sheetEntries = entries
    .filter((entry) => /^xl\/worksheets\/[^/]+\.xml$/i.test(entry.filename))
    .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));

  if (sheetEntries.length === 0) {
    await reader.close();
    return "[Could not read workbook worksheets]";
  }

  const worksheetDump: string[] = [];

  for (const sheetEntry of sheetEntries) {
    if (!sheetEntry.getData) continue;
    const xml = await sheetEntry.getData(new TextWriter());
    const rows = parseWorksheetRows(xml, sharedStrings);
    const sheetName = sheetEntry.filename.replace("xl/worksheets/", "").replace(/\.xml$/i, "");

    worksheetDump.push(`\n=== Sheet: ${sheetName} ===`);
    // Send ALL rows — no truncation. Claude needs the full picture.
    for (const row of rows) worksheetDump.push(`R${row.rowNum}: ${row.text}`);
  }

  await reader.close();

  const text = [
    "IMPORTANT: In Excel price offers, each priced item (with a code like T01, K01) is on one row.",
    "The FOLLOWING rows below it contain technical details: materials, hardware, finishes, electrical, dimensions.",
    "You MUST read ALL rows between two item codes and merge the technical details into the popis field of the preceding item.",
    "Do NOT just use the item header row — look at the detail rows below it for Materiál, Korpus, Dvířka, Vybavení, Elektrika, etc.",
    "",
    "FULL WORKSHEET DATA:",
    ...worksheetDump,
  ].join("\n");

  return text;
}

function buildClaudeContent(isPdf: boolean, fileBase64: string, mimeType: string, excelText?: string): any[] {
  if (isPdf) {
    return [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: fileBase64 },
      },
      { type: "text", text: "Extract all priced line items. For each item combine the main row (Kód, Název, Rozměr, Cena) with ALL following specification rows into popis_full. Skip group headers without prices." },
    ];
  }

  return [
    {
      type: "text",
      text: `Below is the COMPLETE content of a Czech furniture price offer Excel spreadsheet. Extract all priced line items. For each item combine the main row (Kód, Název, Rozměr, Cena) with ALL following specification rows into popis_full. Skip group headers without prices.\n\n${excelText}`,
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
      max_tokens: 8192,
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
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isPdf = mimeType === "application/pdf";
    let excelText: string | undefined;

    if (!isPdf) {
      const bytes = Uint8Array.from(atob(fileBase64), (char) => char.charCodeAt(0));
      try {
        excelText = await parseXlsxToText(bytes);
      } catch (error) {
        console.warn("XLSX parse failed, sending raw:", error);
        excelText = `[Binary file, ${bytes.length} bytes — could not parse]`;
      }
    }

    const content = buildClaudeContent(isPdf, fileBase64, mimeType, excelText);
    const items = await callClaude(content);

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
