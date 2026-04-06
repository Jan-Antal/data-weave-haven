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

// ─── Excel extraction (XLSX → TSV → AI) ──────────────────────────────────────

async function extractFromExcel(fileBuffer: ArrayBuffer, fileName: string): Promise<any[]> {
  const zipReader = new ZipReader(new BlobReader(new Blob([fileBuffer])));
  const entries = await zipReader.getEntries();
  let ssXml = '';
  const sheetEntries: { name: string; entry: typeof entries[0] }[] = [];
  for (const e of entries) {
    if (e.filename === 'xl/sharedStrings.xml') ssXml = await e.getData!(new TextWriter());
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(e.filename)) {
      sheetEntries.push({ name: e.filename, entry: e });
    }
  }
  sheetEntries.sort((a, b) => {
    const na = parseInt(a.name.match(/sheet(\d+)/)?.[1] || '0');
    const nb = parseInt(b.name.match(/sheet(\d+)/)?.[1] || '0');
    return na - nb;
  });

  const ss = parseSharedStrings(ssXml);
  const tsvParts: string[] = [];
  for (const { name, entry } of sheetEntries) {
    const xml = await entry.getData!(new TextWriter());
    const rows = parseWorksheetCells(xml, ss);
    const tsv = cellsToTSV(rows);
    if (tsv.trim().length > 0) {
      tsvParts.push(`=== List ${name.match(/sheet(\d+)/)?.[1] || '?'} ===\n${tsv}`);
    }
    console.log(`XLSX ${fileName} ${name}: ${rows.length} rows, TSV ${tsv.length} chars`);
  }
  await zipReader.close();

  const combined = tsvParts.join('\n\n');
  console.log(`XLSX ${fileName} total: ${sheetEntries.length} sheets, combined TSV ${combined.length} chars`);

  return await extractViaAI(combined);
}

// ─── PDF extraction (Claude — best for visual documents) ──────────────────────

async function extractFromPDF(fileBuffer: ArrayBuffer, fileName: string): Promise<any[]> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const bytes = new Uint8Array(fileBuffer);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const fileBase64 = btoa(binary);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
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

// ─── SharePoint / Graph helpers ───────────────────────────────────────────────

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

// ─── HTTP HANDLER ─────────────────────────────────────────────────────────────

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

      const isPdf = fileName.toLowerCase().endsWith(".pdf");
      let items: any[];

      if (isPdf) {
        console.log(`Extracting PDF ${fileName} (${fileBuffer.byteLength} bytes) via Claude`);
        items = await extractFromPDF(fileBuffer, fileName);
      } else {
        console.log(`Extracting Excel ${fileName} (${fileBuffer.byteLength} bytes) via Lovable AI`);
        items = await extractFromExcel(fileBuffer, fileName);
      }

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
