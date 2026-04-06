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

const SYSTEM_PROMPT = `You receive pre-parsed furniture line items. Convert them to a JSON array exactly as-is.

Return ONLY a valid JSON array, no markdown, no explanation.

Fields (map exactly):
- item_name: the code before the first "|" (e.g. "T01")
- nazev: the text after the first "|" and before "| počet:"
- pocet: the number after "počet:"
- cena: the number after "cena:" before "Kč"
- popis: ALL text after "popis:" — copy it exactly, do not shorten

Return every item. Do not skip any.`;

// ─── XLSX → structured item list ─────────────────────────────────────────────

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
      }
      while (cells.length <= colIdx) cells.push(null);
      cells[colIdx] = val?.trim() || null;
    }
    while (rows.length <= rowIdx) rows.push([]);
    rows[rowIdx] = cells;
  }
  return rows;
}

const ITEM_CODE_RE = /^[A-Z]\d{2,3}$/;
const STOP_TEXTS = ['celkem součet', 'celkem bez dph', 'cena celkem', 'doprava', 'montáž', 'manipulace', 'odvoz', 'jiné náklady', 'cenová nabídka platí', 'platební podmínky', 'technologická doba'];

function isStopText(text: string): boolean {
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return STOP_TEXTS.some(s => t.includes(s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
}

interface ParsedItem {
  kod: string;
  nazev: string;
  pocet: number | null;
  cena: number | null;
  popis: string;
}

async function parseXlsxItems(buffer: ArrayBuffer): Promise<ParsedItem[]> {
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

  console.log('Total rows parsed:', rows.length);
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const r = rows[i];
    if (r && (r[0] || r[1])) {
      console.log(`Row ${i}: col0="${r[0]}" col1="${r[1]?.substring(0,50)}" col3="${r[3]}" col4="${r[4]}"`);
    }
  }

  const items: ParsedItem[] = [];
  let current: ParsedItem | null = null;
  let collecting = true;

  for (const row of rows) {
    const col0 = row[0]?.trim() ?? '';
    const col1 = row[1]?.trim() ?? '';
    const col3 = row[3];
    const col4 = row[4];

    if (ITEM_CODE_RE.test(col0)) {
      const hasCena = col4 !== null && col4 !== '';
      if (current && !hasCena && !col3) {
        if (col1) current.popis += (current.popis ? ' ' : '') + col1;
        continue;
      }
      if (current) items.push(current);
      current = {
        kod: col0,
        nazev: col1,
        pocet: col3 ? parseFloat(col3) : null,
        cena: col4 ? parseFloat(col4) : null,
        popis: '',
      };
      collecting = true;
    } else if (current && collecting) {
      if (!col0 && col1) {
        if (isStopText(col1)) { collecting = false; continue; }
        current.popis += (current.popis ? ' ' : '') + col1;
      }
    }
  }
  if (current) items.push(current);

  console.log('Parsed items sample:', JSON.stringify(items.slice(0, 3)));

  return items.filter(i => i.cena !== null);
}

// ─── Excel extraction (XLSX → direct mapping, no AI needed) ──────────────────

async function extractFromExcel(fileBuffer: ArrayBuffer, fileName: string): Promise<any[]> {
  const parsedItems = await parseXlsxItems(fileBuffer);
  console.log(`Pre-parsed ${parsedItems.length} items from ${fileName}`);

  return parsedItems.map(i => ({
    item_name: i.kod,
    nazev: i.nazev,
    popis: i.popis,
    cena: i.cena,
    pocet: i.pocet ?? 1,
  }));
}

// ─── PDF extraction (Files API) ──────────────────────────────────────────────

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
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } },
          { type: "text", text: "Extract all priced line items. For each item combine the main row (Kód, Název, Rozměr, Cena) with ALL following specification rows into popis. Skip group headers without prices." },
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
        console.log(`Extracting Excel ${fileName} (${fileBuffer.byteLength} bytes) via XLSX→TSV→Claude`);
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
