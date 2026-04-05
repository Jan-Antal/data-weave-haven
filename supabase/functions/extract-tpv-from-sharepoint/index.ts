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
Return ONLY a valid JSON array, no markdown, no explanation:
[{"item_name":"T01","popis":"full description","cena":12500.00,"pocet":1}]
Rules:
- item_name = short code from the document (T01, K01, D-01, etc.). If no code, use short name (max 10 chars).
- popis = full item description including material details, dimensions, hardware specs. Merge sub-rows into parent.
- cena = unit price in CZK (if EUR, multiply by 25). NOT total — divide by quantity if needed.
- pocet = quantity, default 1
- Skip totals, subtotals, section headers, notes
- Include ALL line items with prices, nothing missing`;

// ---- XLSX parser ----
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
    for (const si of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const tParts: string[] = [];
      for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) {
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

  for (const rm of sheetXml.matchAll(/<row[^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNum = parseInt(rm[1]);
    const rowCells: [number, string][] = [];
    for (const cm of rm[2].matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[1], body = cm[2];
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

// ---- SharePoint helpers ----
async function getAccessToken(): Promise<string> {
  const clientSecret = Deno.env.get("SHAREPOINT_CLIENT_SECRET");
  if (!clientSecret) throw new Error("SHAREPOINT_CLIENT_SECRET is not configured");
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "client_credentials", client_id: CLIENT_ID,
      client_secret: clientSecret, scope: "https://graph.microsoft.com/.default",
    }),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Token error [${res.status}]: ${t}`); }
  return (await res.json()).access_token;
}

async function getDriveId(token: string): Promise<string> {
  const siteRes = await fetch(`${GRAPH}/sites/${SITE_HOST}:${SITE_PATH}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!siteRes.ok) { const t = await siteRes.text(); throw new Error(`Site error [${siteRes.status}]: ${t}`); }
  const site = await siteRes.json();
  const drivesRes = await fetch(`${GRAPH}/sites/${site.id}/drives`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!drivesRes.ok) { const t = await drivesRes.text(); throw new Error(`Drives error [${drivesRes.status}]: ${t}`); }
  const drives = await drivesRes.json();
  const drive = drives.value.find((d: any) => d.name === "Shared Documents" || d.name === "Documents") ?? drives.value[0];
  if (!drive) throw new Error("No drive found");
  return drive.id;
}

async function listFilesInFolder(token: string, driveId: string, folderPath: string) {
  const url = `${GRAPH}/drives/${driveId}/root:/${folderPath}:/children?$select=id,name,size,file,@microsoft.graph.downloadUrl&$top=200`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) { await res.text(); return []; }
  if (!res.ok) { const t = await res.text(); throw new Error(`List error [${res.status}]: ${t}`); }
  const json = await res.json();
  const IMAGE_EXT = /\.(jpg|jpeg|png|gif|bmp|tiff|tif|webp|svg|heic|heif)$/i;
  return (json.value ?? [])
    .filter((f: any) => f.file && !IMAGE_EXT.test(f.name))
    .map((f: any) => ({ itemId: f.id, name: f.name, size: f.size, downloadUrl: f["@microsoft.graph.downloadUrl"] ?? null }));
}

function isCenovaNabidka(name: string): boolean {
  const normalized = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("cenov")) return true;
  if (/(\b|[-_])cn(\b|[-_.])/i.test(name)) return true;
  return false;
}

// ---- Claude API call ----
async function callClaude(isPdf: boolean, fileBase64: string, excelText?: string): Promise<any[]> {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

  const userContent: any[] = isPdf
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } },
        { type: "text", text: "Extract all line items from this price offer. Return only the JSON array." },
      ]
    : [
        { type: "text", text: `Below is tab-separated content of a Czech furniture price offer spreadsheet.\nExtract all priced line items. Return ONLY the JSON array.\n\n${excelText}` },
      ];

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
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("Claude API error:", response.status, err);
    throw new Error(`Claude API error [${response.status}]`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? "";
  try { return JSON.parse(text); } catch {
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { projectId, action, fileItemId } = await req.json();

    if (!projectId) {
      return new Response(JSON.stringify({ error: "Missing projectId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getAccessToken();
    const driveId = await getDriveId(token);

    if (action === "search") {
      const allFiles: any[] = [];
      const cnFiles = await listFilesInFolder(token, driveId, `${LIB_ROOT}/${projectId}/Cenova-nabidka`);
      for (const f of cnFiles) allFiles.push({ ...f, source: "cn_folder" });

      const rootFiles = await listFilesInFolder(token, driveId, `${LIB_ROOT}/${projectId}`);
      const seenIds = new Set(allFiles.map((f: any) => f.itemId));
      for (const f of rootFiles) { if (!seenIds.has(f.itemId)) allFiles.push({ ...f, source: "root" }); }

      const autoMatches = allFiles.filter((f: any) => isCenovaNabidka(f.name) || f.source === "cn_folder");

      return new Response(JSON.stringify({ autoMatches, allFiles, totalFiles: allFiles.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "extract") {
      if (!fileItemId) {
        return new Response(JSON.stringify({ error: "Missing fileItemId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const itemRes = await fetch(`${GRAPH}/drives/${driveId}/items/${fileItemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!itemRes.ok) { const t = await itemRes.text(); throw new Error(`Item error [${itemRes.status}]: ${t}`); }
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
          headers: { Authorization: `Bearer ${token}` }, redirect: "follow",
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

      if (!isPdf) {
        try {
          excelText = await parseXlsxToText(bytes);
          console.log("Parsed XLSX preview:", excelText.substring(0, 300));
        } catch (e) {
          console.warn("XLSX parse failed:", e);
          excelText = `[Binary Excel file: ${fileName}, ${bytes.length} bytes]`;
        }
      }

      console.log(`Extracting ${fileName} (${bytes.length} bytes, isPdf: ${isPdf})`);
      const items = await callClaude(isPdf, fileBase64, excelText);

      return new Response(JSON.stringify({ items, fileName }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-tpv-from-sharepoint error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
