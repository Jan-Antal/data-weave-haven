import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ZipReader, BlobReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.34/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TENANT_ID = "596710ac-cabd-4bd2-8360-f7252eef3064";
const CLIENT_ID = "eb6c5989-f35c-4e41-b094-363f4e74383e";
const GRAPH = "https://graph.microsoft.com/v1.0";
const LIB_ROOT = "AMI-Project-Info-App-Data";
const SITE_HOST = "amincz.sharepoint.com";
const SITE_PATH = "/sites/AMI-Project-Info";

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

async function getAccessToken(): Promise<string> {
  const clientSecret = Deno.env.get("SHAREPOINT_CLIENT_SECRET");
  if (!clientSecret) throw new Error("SHAREPOINT_CLIENT_SECRET is not configured");

  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token error [${res.status}]: ${text}`);
  }

  return (await res.json()).access_token;
}

async function getDriveId(token: string): Promise<string> {
  const siteRes = await fetch(`${GRAPH}/sites/${SITE_HOST}:${SITE_PATH}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!siteRes.ok) {
    const text = await siteRes.text();
    throw new Error(`Site error [${siteRes.status}]: ${text}`);
  }
  const site = await siteRes.json();

  const drivesRes = await fetch(`${GRAPH}/sites/${site.id}/drives`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!drivesRes.ok) {
    const text = await drivesRes.text();
    throw new Error(`Drives error [${drivesRes.status}]: ${text}`);
  }
  const drives = await drivesRes.json();
  const drive = drives.value.find((entry: any) => entry.name === "Shared Documents" || entry.name === "Documents") ?? drives.value[0];
  if (!drive) throw new Error("No drive found");
  return drive.id;
}

async function listFilesInFolder(token: string, driveId: string, folderPath: string) {
  const url = `${GRAPH}/drives/${driveId}/root:/${folderPath}:/children?$select=id,name,size,file,@microsoft.graph.downloadUrl&$top=200`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) {
    await res.text();
    return [];
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`List error [${res.status}]: ${text}`);
  }
  const json = await res.json();
  const IMAGE_EXT = /\.(jpg|jpeg|png|gif|bmp|tiff|tif|webp|svg|heic|heif)$/i;
  return (json.value ?? [])
    .filter((file: any) => file.file && !IMAGE_EXT.test(file.name))
    .map((file: any) => ({
      itemId: file.id,
      name: file.name,
      size: file.size,
      downloadUrl: file["@microsoft.graph.downloadUrl"] ?? null,
    }));
}

function isCenovaNabidka(name: string): boolean {
  const normalized = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("cenov")) return true;
  if (/(\b|[-_])cn(\b|[-_.])/i.test(name)) return true;
  return false;
}

function buildClaudeContent(isPdf: boolean, fileBase64: string, excelText?: string): any[] {
  if (isPdf) {
    return [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } },
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

async function callClaude(isPdf: boolean, fileBase64: string, excelText?: string): Promise<any[]> {
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
      messages: [{ role: "user", content: buildClaudeContent(isPdf, fileBase64, excelText) }],
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
    const { projectId, action, fileItemId } = await req.json();

    if (!projectId) {
      return new Response(JSON.stringify({ error: "Missing projectId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getAccessToken();
    const driveId = await getDriveId(token);

    if (action === "search") {
      const allFiles: any[] = [];
      const cnFiles = await listFilesInFolder(token, driveId, `${LIB_ROOT}/${projectId}/Cenova-nabidka`);
      for (const file of cnFiles) allFiles.push({ ...file, source: "cn_folder" });

      const rootFiles = await listFilesInFolder(token, driveId, `${LIB_ROOT}/${projectId}`);
      const seenIds = new Set(allFiles.map((file: any) => file.itemId));
      for (const file of rootFiles) {
        if (!seenIds.has(file.itemId)) allFiles.push({ ...file, source: "root" });
      }

      const autoMatches = allFiles.filter((file: any) => isCenovaNabidka(file.name) || file.source === "cn_folder");

      return new Response(JSON.stringify({ autoMatches, allFiles, totalFiles: allFiles.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "extract") {
      if (!fileItemId) {
        return new Response(JSON.stringify({ error: "Missing fileItemId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const itemRes = await fetch(`${GRAPH}/drives/${driveId}/items/${fileItemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!itemRes.ok) {
        const text = await itemRes.text();
        throw new Error(`Item error [${itemRes.status}]: ${text}`);
      }
      const item = await itemRes.json();
      const downloadUrl = item["@microsoft.graph.downloadUrl"];
      const fileName = item.name;

      let fileBuffer: ArrayBuffer;
      if (downloadUrl) {
        const fileRes = await fetch(downloadUrl);
        if (!fileRes.ok) throw new Error(`Download failed [${fileRes.status}]`);
        fileBuffer = await fileRes.arrayBuffer();
      } else {
        const contentRes = await fetch(`${GRAPH}/drives/${driveId}/items/${fileItemId}/content`, {
          headers: { Authorization: `Bearer ${token}` },
          redirect: "follow",
        });
        if (!contentRes.ok) throw new Error(`Content download failed [${contentRes.status}]`);
        fileBuffer = await contentRes.arrayBuffer();
      }

      const bytes = new Uint8Array(fileBuffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const fileBase64 = btoa(binary);

      const isPdf = fileName.toLowerCase().endsWith(".pdf");
      let excelText: string | undefined;
      let itemContexts: Record<string, ItemContext> = {};

      if (!isPdf) {
        try {
          const parsed = await parseXlsxToText(bytes);
          excelText = parsed.text;
          itemContexts = parsed.contexts;
          console.log("Parsed XLSX item contexts:", Object.keys(itemContexts).length);
        } catch (error) {
          console.warn("XLSX parse failed:", error);
          excelText = `[Binary Excel file: ${fileName}, ${bytes.length} bytes]`;
        }
      }

      console.log(`Extracting ${fileName} (${bytes.length} bytes, isPdf: ${isPdf})`);
      const rawItems = await callClaude(isPdf, fileBase64, excelText);
      const items = enrichExtractedItems(rawItems, itemContexts);

      return new Response(JSON.stringify({ items, fileName }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("extract-tpv-from-sharepoint error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
