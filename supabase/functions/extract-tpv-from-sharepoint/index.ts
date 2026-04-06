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

Field definitions:
- item_name = short code exactly as in the document (T01, K01, D-01, etc.)
- nazev = SHORT item name (max 40 chars, no dimensions/materials)
- popis = complete TECHNICAL description with materials, hardware, finishes, dimensions
- cena = unit price in CZK (number only)
- pocet = quantity, default 1

SKIP: totals, subtotals, section headers, transport, montáž.
Return ONLY valid JSON array.`;

// ─── SHARED STRINGS ───────────────────────────────────────────────────────────

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

// ─── WORKSHEET CELLS ──────────────────────────────────────────────────────────

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

// ─── CN PARSER ────────────────────────────────────────────────────────────────

const ITEM_CODE_RE = /^[A-Z]\d{2}$/;

const STOP_TEXTS = [
  'celkem součet', 'celkem bez dph', 'cena celkem včetně dph', 'dph',
  'doprava - nákladní', 'doprava', 'montáž a přesun', 'montáž',
  'manipulace', 'odvoz a likvidace', 'odvoz',
  'jiné náklady', 'cenová nabídka platí',
  'platební podmínky', 'technologická doba', 'součástí cenové nabídky nejsou'
];

const ROOM_LABELS = new Set([
  'Dětský pokoj 1', 'Dětský pokoj 2', 'Dětský pokoj 3',
  'Ložnice', 'Chodba', 'Koupelna', 'Kuchyň', 'Obývací pokoj',
  'Pracovna', 'Předsíň', 'Jídelna', 'Šatna', 'Technická místnost',
]);

function parseCN(rows: (string | null)[][]): any[] {
  const items: any[] = [];
  let cur: any = null;
  let collecting = true;

  for (const cells of rows) {
    const kod = cells[0]?.trim() ?? '';
    const nazev_popis = cells[1]?.trim() ?? '';
    const rozmer = cells[2]?.trim() ?? '';
    const pocet = cells[3] ? parseFloat(cells[3].replace(/\s/g, '').replace(',', '.')) || null : null;
    const jcena = cells[4] ? parseFloat(cells[4].replace(/\s/g, '').replace(',', '.')) || null : null;
    const ccena = cells[5] ? parseFloat(cells[5].replace(/\s/g, '').replace(',', '.')) || null : null;

    if (ITEM_CODE_RE.test(kod)) {
      if (cur && !jcena && pocet === null) {
        if (nazev_popis) cur._popis.push(nazev_popis);
        continue;
      }
      if (cur) items.push(finalize(cur));
      cur = { kod_prvku: kod, nazev: nazev_popis, rozmer, pocet, jcena, ccena, _popis: [] };
      collecting = true;
    } else if (cur && collecting && !kod && nazev_popis) {
      const t = nazev_popis.toLowerCase();
      if (STOP_TEXTS.some(s => t.includes(s))) {
        collecting = false;
      } else if (!ROOM_LABELS.has(nazev_popis)) {
        cur._popis.push(nazev_popis);
      }
    }
  }
  if (cur) items.push(finalize(cur));
  return items;
}

function finalize(cur: any) {
  const popis = cur._popis.join(' ');
  return {
    item_name: cur.kod_prvku,
    nazev: cur.nazev,
    popis: [cur.rozmer, popis].filter(Boolean).join(' '),
    cena: cur.jcena ?? 0,
    pocet: cur.pocet ?? 1,
    jednotka: 'ks',
  };
}

// ─── XLSX EXTRACTION (deterministic) ──────────────────────────────────────────

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
  return parseCN(rows);
}

// ─── PDF EXTRACTION (Anthropic Files API) ─────────────────────────────────────

async function extractFromPDF(fileBuffer: ArrayBuffer, fileName: string): Promise<any[]> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const commonHeaders = {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "files-api-2025-04-14",
  };

  // Step 1: Upload file
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer], { type: "application/pdf" }), fileName);

  const uploadRes = await fetch("https://api.anthropic.com/v1/files", {
    method: "POST",
    headers: commonHeaders,
    body: formData,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Anthropic Files upload error [${uploadRes.status}]: ${err}`);
  }

  const { id: fileId } = await uploadRes.json();
  console.log(`Uploaded PDF ${fileName} to Anthropic Files API, id=${fileId}`);

  try {
    // Step 2: Send to Claude
    const msgRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { ...commonHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "file", file_id: fileId } },
            { type: "text", text: "Extract all priced line items from this price offer. For each item combine the main row (Kód, Název, Rozměr, Cena) with ALL following specification rows into popis. Skip group headers without prices. Return only the JSON array." },
          ],
        }],
      }),
    });

    if (!msgRes.ok) {
      const err = await msgRes.text();
      throw new Error(`Claude API error [${msgRes.status}]: ${err}`);
    }

    const data = await msgRes.json();
    const text = data.content?.[0]?.text ?? "";

    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      return match ? JSON.parse(match[0]) : [];
    }
  } finally {
    // Step 3: Cleanup
    try {
      await fetch(`https://api.anthropic.com/v1/files/${fileId}`, {
        method: "DELETE",
        headers: commonHeaders,
      });
    } catch (e) {
      console.warn("Failed to delete Anthropic file:", e);
    }
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
        console.log(`Extracting PDF ${fileName} (${fileBuffer.byteLength} bytes) via Anthropic Files API`);
        items = await extractFromPDF(fileBuffer, fileName);
      } else {
        console.log(`Extracting XLSX ${fileName} (${fileBuffer.byteLength} bytes) deterministically`);
        items = await extractFromXLSX(fileBuffer);
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
