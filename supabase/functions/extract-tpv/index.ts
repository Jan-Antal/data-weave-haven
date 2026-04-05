import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ZipReader, BlobReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.34/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You extract line items from Czech furniture price offers (cenová nabídka).
Return ONLY a valid JSON array, no markdown, no explanation.

Example output:
[{"item_name":"T01","nazev":"Kuchyňská linka","popis_short":"5920×700×2650 | LTD Egger W1000 ST9 | Blum","popis_full":"Materiál: Korpus LTD Egger W1000 ST9 | Dvířka a viditelné části: Polyrey G120 TCH | Akustická záda: EchoBoard24 204 | Vybavení: nábytkové kování | Elektrika: Čipový zámek SAFE-O-TRONIC LS LS300 | Rozměr: 5920×700×2650","cena":258397,"pocet":1}]

Field definitions:
- item_name = short code exactly as in the document (T01, K01, D-01, etc.). If no code exists, create one from first letter + number (max 10 chars).
- nazev = SHORT item name, what the item IS (e.g. "Kuchyňská linka", "Ostrůvek", "TV stěna", "Skříň rohová", "Pracovní deska", "Postel"). This is the human-readable name WITHOUT dimensions, materials, or specs. Max 40 chars.
- popis_short = concise TECHNICAL description for the description column. Do NOT repeat nazev. Prefer dimensions + 1-2 key technical specs (material, hardware, equipment, finish).
- popis_full = complete TECHNICAL description for the description column. Do NOT repeat nazev. Prefer labelled details like "Materiál: ... | Vybavení: ... | Elektrika: ...".
- cena = unit price in CZK (if EUR, multiply by 25). NOT total — divide by quantity if needed.
- pocet = quantity, default 1.

CRITICAL rules:
- In Excel workbooks, the priced item is often on one row and its technical details are in the following rows. You MUST merge those following rows into the same item.
- If rows below the item contain materials, hardware, finishes, equipment, or electrical details, popis_full MUST use them.
- Since nazev is a separate field, popis_short and popis_full must NOT be just a duplicate of the item title.
- nazev must NEVER contain dimensions like "5920×700×2650".
- If technical details exist, popis_short must not be only dimensions.
- Skip totals, subtotals, section headers, transport, montáž, and notes.
- Include ALL priced line items, nothing missing.`;

type ParsedRow = {
  rowNum: number;
  cells: string[];
  text: string;
};

type ItemContext = {
  header: string;
  dimension: string | null;
  detailLines: string[];
  contextLines: string[];
};

const ITEM_CODE_RE = /^[A-Z]{1,3}-?\d{1,3}[A-Z]?$/i;
const DIMENSION_RE = /\d{2,5}\s*[x×*]\s*\d{2,5}(?:\s*[x×*\/]\s*\d{2,5})?/i;
const DETAIL_HINT_RE = /(materi|korpus|dvíř|dv[ií]řk|viditeln|akust|z[áa]da|vybaven|kov[aá]n|elektr|z[aá]mek|úchyt|uchyt|pant|pojezd|zásuv|zasuv|blum|hettich|h[aä]fele|egger|polyrey|lamino|ltd|mdf|d[ýy]h|lak|sklo|nerez|čaloun|caloun|povrch|hrana|safe-o-tronic)/i;

function normalizeWhitespace(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeDimension(text: string | null): string | null {
  if (!text) return null;
  return normalizeWhitespace(text.replace(/\*/g, "×").replace(/\s*×\s*/g, "×").replace(/\s*\/\s*/g, "/"));
}

function limitText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function parseNumericCell(cell: string): number | null {
  const cleaned = cell.replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!cleaned || !/\d/.test(cleaned)) return null;
  const normalized = cleaned.includes(",") && cleaned.includes(".")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function extractPrimaryCode(cells: string[]): string | null {
  for (const cell of cells.slice(0, 3)) {
    const text = normalizeWhitespace(cell);
    if (!text) continue;
    if (ITEM_CODE_RE.test(text)) return text.toUpperCase();
    const match = text.match(/^([A-Z]{1,3}-?\d{1,3}[A-Z]?)\b/i);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

function looksLikeTechnicalDetail(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  return DETAIL_HINT_RE.test(normalized) || /^(materi[aá]l|vybaven[íi]|elektrika|korpus|dvířka|akustick[aá] z[aá]da|povrch|hrana)\s*:/i.test(normalized);
}

function looksLikeItemRow(row: ParsedRow): boolean {
  const code = extractPrimaryCode(row.cells);
  if (!code) return false;
  if (looksLikeTechnicalDetail(row.text)) return false;
  const nonEmpty = row.cells.filter((cell) => normalizeWhitespace(cell).length > 0);
  const hasDimension = DIMENSION_RE.test(row.text);
  const hasPrice = nonEmpty.some((cell) => {
    const value = parseNumericCell(cell);
    return value !== null && value >= 1000;
  });
  return hasPrice || hasDimension || nonEmpty.length >= 3;
}

function parseWorksheetRows(xml: string, sharedStrings: string[]): ParsedRow[] {
  function colToIndex(col: string): number {
    let idx = 0;
    for (let i = 0; i < col.length; i++) idx = idx * 26 + (col.charCodeAt(i) - 64);
    return idx - 1;
  }

  const rows: ParsedRow[] = [];

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
    rows.push({ rowNum, cells, text });
  }

  return rows;
}

function mergeItemContext(target: Record<string, ItemContext>, code: string, incoming: ItemContext) {
  const existing = target[code];
  if (!existing) {
    target[code] = {
      header: incoming.header,
      dimension: incoming.dimension,
      detailLines: uniqueStrings(incoming.detailLines),
      contextLines: uniqueStrings(incoming.contextLines),
    };
    return;
  }

  existing.header = existing.header || incoming.header;
  existing.dimension = existing.dimension || incoming.dimension;
  existing.detailLines = uniqueStrings([...existing.detailLines, ...incoming.detailLines]);
  existing.contextLines = uniqueStrings([...existing.contextLines, ...incoming.contextLines]);
}

function collectItemContexts(rows: ParsedRow[]): Record<string, ItemContext> {
  const contexts: Record<string, ItemContext> = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const code = extractPrimaryCode(row.cells);
    if (!code || !looksLikeItemRow(row)) continue;

    const detailLines: string[] = [];
    const contextLines: string[] = [];

    for (let j = i + 1; j < rows.length && j <= i + 10; j++) {
      const next = rows[j];
      if (looksLikeItemRow(next)) break;
      if (!next.text || next.text === row.text) continue;
      contextLines.push(next.text);
      if (looksLikeTechnicalDetail(next.text)) detailLines.push(next.text);
    }

    mergeItemContext(contexts, code, {
      header: row.text,
      dimension: normalizeDimension(row.text.match(DIMENSION_RE)?.[0] ?? null),
      detailLines,
      contextLines,
    });
  }

  return contexts;
}

function stripCategoryPrefix(line: string): string {
  return normalizeWhitespace(line.replace(/^(materi[aá]l|vybaven[íi]|elektrika|korpus|dvířka(?: a viditelné části)?|akustick[aá] z[aá]da|povrch|hrana|rozměr)\s*:\s*/i, ""));
}

function pickTechnicalLines(context: ItemContext): string[] {
  const source = context.detailLines.length > 0
    ? context.detailLines
    : context.contextLines.filter((line) => looksLikeTechnicalDetail(line) || line.length > 18);
  return uniqueStrings(source).slice(0, 6);
}

function buildDescriptionsFromContext(context: ItemContext) {
  const dimension = context.dimension;
  const technicalLines = pickTechnicalLines(context);

  const fullParts = [...technicalLines];
  if (dimension && !fullParts.some((line) => DIMENSION_RE.test(line))) fullParts.push(`Rozměr: ${dimension}`);

  const shortParts = [
    dimension,
    ...technicalLines.map(stripCategoryPrefix).filter(Boolean).slice(0, 2),
  ].filter(Boolean) as string[];

  return {
    popis_short: limitText(normalizeWhitespace(shortParts.join(" | ")), 140),
    popis_full: limitText(normalizeWhitespace(fullParts.join(" | ")), 500),
  };
}

async function parseXlsxToText(bytes: Uint8Array): Promise<{ text: string; contexts: Record<string, ItemContext> }> {
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
    return { text: "[Could not read workbook worksheets]", contexts: {} };
  }

  const contexts: Record<string, ItemContext> = {};
  const worksheetDump: string[] = [];

  for (const sheetEntry of sheetEntries) {
    if (!sheetEntry.getData) continue;
    const xml = await sheetEntry.getData(new TextWriter());
    const rows = parseWorksheetRows(xml, sharedStrings);
    const sheetName = sheetEntry.filename.replace("xl/worksheets/", "").replace(/\.xml$/i, "");

    worksheetDump.push(`Sheet ${sheetName}`);
    for (const row of rows.slice(0, 350)) worksheetDump.push(`R${row.rowNum}: ${row.text}`);

    const sheetContexts = collectItemContexts(rows);
    for (const [code, context] of Object.entries(sheetContexts)) mergeItemContext(contexts, code, context);
  }

  await reader.close();

  const contextLines: string[] = [];
  for (const [code, context] of Object.entries(contexts)) {
    contextLines.push(`Item ${code}`);
    contextLines.push(`Header: ${context.header}`);
    const technicalLines = pickTechnicalLines(context);
    if (technicalLines.length > 0) {
      contextLines.push("Technical rows:");
      for (const line of technicalLines) contextLines.push(`- ${line}`);
    }
    if (context.dimension) contextLines.push(`Detected dimension: ${context.dimension}`);
    contextLines.push("");
  }

  const text = [
    "IMPORTANT: In Excel offers, the priced item is often on one row and its technical details are in the following rows.",
    "Use the ITEM CONTEXTS first. If technical rows exist, use them for popis_short and popis_full instead of repeating the title.",
    "",
    "ITEM CONTEXTS:",
    ...contextLines.slice(0, 1200),
    "WORKSHEET DUMP:",
    ...worksheetDump.slice(0, 1200),
  ].join("\n");

  return { text, contexts };
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
      text: `Below is structured workbook context from a Czech furniture price offer spreadsheet. Technical details are often stored in following rows under each priced item. Use those rows for popis_short and popis_full. Return ONLY the JSON array.\n\n${excelText}`,
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

function enrichExtractedItems(items: any[], contexts: Record<string, ItemContext>): any[] {
  return items.map((item) => {
    const code = normalizeWhitespace(String(item?.item_name ?? "")).toUpperCase();
    const context = contexts[code];
    if (!context) {
      return {
        ...item,
        popis_short: item?.popis_short || item?.popis || "",
        popis_full: item?.popis_full || item?.popis || "",
      };
    }

    const technicalLines = pickTechnicalLines(context);
    if (technicalLines.length === 0) {
      return {
        ...item,
        popis_short: item?.popis_short || item?.popis || "",
        popis_full: item?.popis_full || item?.popis || "",
      };
    }

    const fallback = buildDescriptionsFromContext(context);
    return {
      ...item,
      popis_short: fallback.popis_short || item?.popis_short || item?.popis || "",
      popis_full: fallback.popis_full || item?.popis_full || item?.popis || "",
    };
  });
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
    let itemContexts: Record<string, ItemContext> = {};

    if (!isPdf) {
      const bytes = Uint8Array.from(atob(fileBase64), (char) => char.charCodeAt(0));
      try {
        const parsed = await parseXlsxToText(bytes);
        excelText = parsed.text;
        itemContexts = parsed.contexts;
      } catch (error) {
        console.warn("XLSX parse failed, sending raw:", error);
        excelText = `[Binary file, ${bytes.length} bytes — could not parse]`;
      }
    }

    const content = buildClaudeContent(isPdf, fileBase64, mimeType, excelText);
    const rawItems = await callClaude(content);
    const items = enrichExtractedItems(rawItems, itemContexts);

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
