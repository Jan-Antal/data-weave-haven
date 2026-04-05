import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ZipReader, BlobReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.34/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You extract line items from Czech furniture price offers (cenová nabídka).
Return ONLY a valid JSON array, no markdown, no explanation.

Example output:
[{"item_name":"T01","nazev":"Kuchyňská linka","popis":"Materiál: Korpus LTD Egger W1000 ST9 | Dvířka a viditelné části: Polyrey G120 TCH | Akustická záda: EchoBoard24 204 | Vybavení: nábytkové kování | Elektrika: Čipový zámek SAFE-O-TRONIC LS LS300 | Rozměr: 5920×700×2650","cena":258397,"pocet":1}]

Field definitions:
- item_name = short code exactly as in the document (T01, K01, D-01, etc.). If no code exists, create one from first letter + number (max 10 chars).
- nazev = SHORT item name, what the item IS (e.g. "Kuchyňská linka", "Ostrůvek", "TV stěna", "Skříň rohová", "Pracovní deska", "Postel"). This is the human-readable name WITHOUT dimensions, materials, or specs. Max 40 chars.
- popis = complete TECHNICAL description. Do NOT repeat nazev. Include labelled details like "Materiál: ... | Vybavení: ... | Elektrika: ... | Rozměr: ...". Combine ALL technical information from multiple rows that belong to the same item.
- cena = unit price in CZK (if EUR, multiply by 25). NOT total — divide by quantity if needed.
- pocet = quantity, default 1.

CRITICAL rules:
- In Excel workbooks, the priced item is often on one row and its technical details (materials, hardware, finishes, dimensions, electrical) are in the FOLLOWING rows below it. You MUST merge those following rows into the same item's popis field.
- Look at ALL rows between two item codes — everything between them belongs to the first item.
- popis must contain materials (Materiál, Korpus, Dvířka, LTD, MDF, dýha, lak, polyrey, egger), hardware (kování, Blum, Hettich, Häfele, pojezdy, panty), equipment (vybavení, zámky, úchyty), electrical (elektrika, zámek, SAFE-O-TRONIC), finishes (povrch, hrana, čalounění), and dimensions.
- nazev must NEVER contain dimensions or materials.
- popis must NEVER be just a repeat of the item name or just dimensions.
- Skip totals, subtotals, section headers, transport, montáž, and notes.
- Include ALL priced line items, nothing missing.`;

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
      { type: "text", text: "Extract all line items from this price offer. Return only the JSON array." },
    ];
  }

  return [
    {
      type: "text",
      text: `Below is the COMPLETE content of a Czech furniture price offer Excel spreadsheet. Technical details (materials, hardware, finishes, electrical) are stored in rows BELOW each priced item. You must use ALL of those detail rows when building the popis field. Return ONLY the JSON array.\n\n${excelText}`,
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
