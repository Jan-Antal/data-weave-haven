import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ZipReader, BlobReader, TextWriter } from "https://deno.land/x/zipjs@v2.7.34/index.js";

// XLSX parser: unzips xlsx, reads shared strings + sheet XML, outputs structured tab-separated text
// Preserves column positions so AI sees proper table structure
async function parseXlsxToTextAsync(bytes: Uint8Array): Promise<string> {
  const blob = new Blob([bytes]);
  const reader = new ZipReader(new BlobReader(blob));
  const entries = await reader.getEntries();

  const readEntry = async (name: string): Promise<string | null> => {
    const entry = entries.find(e => e.filename === name);
    if (!entry || !entry.getData) return null;
    return await entry.getData(new TextWriter());
  };

  // Read shared strings (handles <si> with multiple <t> fragments)
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

  // Read sheet1
  const sheetXml = await readEntry("xl/worksheets/sheet1.xml");
  if (!sheetXml) {
    await reader.close();
    return "[Could not read sheet1]";
  }

  // Helper: convert column letters to 0-based index (A=0, B=1, ..., AA=26, etc.)
  function colToIndex(col: string): number {
    let idx = 0;
    for (let i = 0; i < col.length; i++) {
      idx = idx * 26 + (col.charCodeAt(i) - 64);
    }
    return idx - 1;
  }

  const rows: Map<number, string[]> = new Map();
  let maxCol = 0;

  const rowMatches = sheetXml.matchAll(/<row[^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g);
  for (const rm of rowMatches) {
    const rowNum = parseInt(rm[1]);
    const cells: string[] = [];
    // Parse each <c> element individually
    const cellMatches = rm[2].matchAll(/<c\s([^>]*)>([\s\S]*?)<\/c>/g);
    
    const rowCells: [number, string][] = [];
    for (const cm of cellMatches) {
      const attrs = cm[1];
      const body = cm[2];
      
      // Extract r="XX" attribute for column reference
      const rMatch = attrs.match(/r="([A-Z]+)\d+"/);
      if (!rMatch) continue;
      const colRef = rMatch[1];
      
      // Extract t="s" or t="inlineStr" attribute for cell type
      const tMatch = attrs.match(/t="([^"]*)"/);
      const cellType = tMatch ? tMatch[1] : "";
      
      // Extract value
      const valMatch = body.match(/<v>([\s\S]*?)<\/v>/);
      let val = valMatch ? valMatch[1] : "";
      
      if (cellType === "s") {
        const idx = parseInt(val);
        val = (idx >= 0 && idx < sharedStrings.length) ? sharedStrings[idx] : val;
      } else if (cellType === "inlineStr") {
        const isMatch = body.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        if (isMatch) val = isMatch[1];
      }
      
      const colIdx = colToIndex(colRef);
      if (colIdx > maxCol) maxCol = colIdx;
      rowCells.push([colIdx, val.trim()]);
    }

    if (rowCells.length > 0) {
      // Build sparse row array
      const arr: string[] = new Array(maxCol + 1).fill("");
      for (const [ci, v] of rowCells) arr[ci] = v;
      rows.set(rowNum, arr);
    }
  }

  await reader.close();

  // Normalize all rows to same width and output
  const sortedKeys = [...rows.keys()].sort((a, b) => a - b);
  const finalWidth = maxCol + 1;
  const lines: string[] = [];
  
  for (const key of sortedKeys.slice(0, 250)) {
    const row = rows.get(key)!;
    // Pad to full width
    while (row.length < finalWidth) row.push("");
    const line = row.join("\t");
    if (line.trim()) lines.push(line);
  }

  return lines.join("\n");
}

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

async function getAccessToken(): Promise<string> {
  const clientSecret = Deno.env.get("SHAREPOINT_CLIENT_SECRET");
  if (!clientSecret) throw new Error("SHAREPOINT_CLIENT_SECRET is not configured");
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(url, { method: "POST", body });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Token error [${res.status}]: ${t}`);
  }
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

// List files in a specific folder path
async function listFilesInFolder(token: string, driveId: string, folderPath: string) {
  const url = `${GRAPH}/drives/${driveId}/root:/${folderPath}:/children?$select=id,name,size,file,@microsoft.graph.downloadUrl&$top=200`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) { await res.text(); return []; }
  if (!res.ok) { const t = await res.text(); throw new Error(`List error [${res.status}]: ${t}`); }
  const json = await res.json();
  const IMAGE_EXT = /\.(jpg|jpeg|png|gif|bmp|tiff|tif|webp|svg|heic|heif)$/i;
  return (json.value ?? [])
    .filter((f: any) => f.file && !IMAGE_EXT.test(f.name))
    .map((f: any) => ({
      itemId: f.id,
      name: f.name,
      size: f.size,
      downloadUrl: f["@microsoft.graph.downloadUrl"] ?? null,
    }));
}

// The CN folder name used in SharePoint (matches CATEGORY_FOLDER_MAP)
const CN_FOLDER = "Cenova-nabidka";

// Check if a file name looks like a cenová nabídka
function isCenovaNabidka(name: string): boolean {
  const lower = name.toLowerCase();
  const normalized = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Match: cenov*, CN_, CN-, CN., -CN_, -CN-
  if (normalized.includes("cenov")) return true;
  if (/(\b|[-_])cn(\b|[-_.])/i.test(name)) return true;
  return false;
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

    // Action: search — find cenová nabídka files
    if (action === "search") {
      const allFiles: any[] = [];

      // 1. Look in the dedicated Cenova-nabidka folder
      const cnPath = `${LIB_ROOT}/${projectId}/${CN_FOLDER}`;
      const cnFiles = await listFilesInFolder(token, driveId, cnPath);
      for (const f of cnFiles) allFiles.push({ ...f, source: "cn_folder" });

      // 2. Also check root project folder
      const rootPath = `${LIB_ROOT}/${projectId}`;
      const rootFiles = await listFilesInFolder(token, driveId, rootPath);
      const seenIds = new Set(allFiles.map((f: any) => f.itemId));
      for (const f of rootFiles) {
        if (!seenIds.has(f.itemId)) allFiles.push({ ...f, source: "root" });
      }

      // Auto-match: files that look like cenová nabídka
      const autoMatches = allFiles.filter((f: any) => isCenovaNabidka(f.name) || f.source === "cn_folder");

      return new Response(JSON.stringify({
        autoMatches,
        allFiles,
        totalFiles: allFiles.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: extract — download file and send to AI
    if (action === "extract") {
      if (!fileItemId) {
        return new Response(JSON.stringify({ error: "Missing fileItemId" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get file info
      const itemRes = await fetch(`${GRAPH}/drives/${driveId}/items/${fileItemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!itemRes.ok) { const t = await itemRes.text(); throw new Error(`Item error [${itemRes.status}]: ${t}`); }
      const item = await itemRes.json();
      const downloadUrl = item["@microsoft.graph.downloadUrl"];
      const fileName = item.name;

      // Download file content - try downloadUrl first, fallback to /content endpoint
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

      // Convert to base64 in chunks to avoid stack overflow on large files
      let base64 = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        base64 += String.fromCharCode(...chunk);
      }
      base64 = btoa(base64);

      const isPdf = fileName.toLowerCase().endsWith(".pdf");
      const isExcel = /\.(xlsx?|xls)$/i.test(fileName);

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

      const SYSTEM_PROMPT = `You are extracting line items from a Czech furniture/interior design price offer (cenová nabídka).

The document typically has this structure:
- Item code (e.g. T01, T02, K01, S01, D01...) in one column
- Item name (e.g. "Kuchyň", "Ostrůvek", "TV stěna", "Šatní skříň") next to the code
- Sometimes dimensions (e.g. 5920*700*2650)
- Quantity (e.g. "1 ks")
- Unit price (e.g. "á 258,397 Kč")
- Total price
- Below each main item there may be material descriptions, hardware details etc. — these are the DESCRIPTION, not separate items.

Extract ONLY the main priced line items. Return a JSON array:

[
  {
    "item_name": "T01",
    "popis": "Kuchyň 5920*700*2650 — nepohledové části DTDL Egger W960 SM bílá, pohledové boky+dvířka DTDL W1200 ST9 Porcelánově bílá...",
    "cena": 258397,
    "pocet": 1
  }
]

Rules:
- item_name = the SHORT CODE (T01, T02, K01, S01, D01, etc.). If no code exists, use a short name (max 10 chars).
- popis = the item NAME + key material/specification details merged into one description string. Include dimensions if present.
- cena = UNIT price in CZK (NOT total). If price is in EUR, multiply by 25.
- pocet = quantity (default 1)
- SKIP: subtotals, totals, headers, notes like "Součástí CN nejsou spotřebiče"
- SKIP: rows that are just material descriptions without their own price — merge them into the parent item's popis
- Return ONLY the JSON array, no markdown, no explanation`;

      let userContent: any[];

      if (isPdf) {
        userContent = [
          {
            type: "image_url",
            image_url: { url: `data:application/pdf;base64,${base64}` },
          },
          {
            type: "text",
            text: "Extract all priced line items from this Czech furniture price offer (cenová nabídka). Each item has a code like T01, K01, etc. Return ONLY the JSON array.",
          },
        ];
      } else {
        let textContent: string;
        try {
          textContent = await parseXlsxToTextAsync(bytes);
        } catch (e) {
          console.warn("XLSX parse failed:", e);
          textContent = `[Binary Excel file: ${fileName}, ${bytes.length} bytes. Could not parse locally.]`;
        }

        console.log("Parsed XLSX preview (first 500 chars):", textContent.substring(0, 500));
        
        userContent = [
          {
            type: "text",
            text: `Below is the tab-separated content of a Czech furniture price offer Excel file "${fileName}".
Each row is tab-separated. Look for the pattern: CODE (T01, K01...) | NAME | DIMENSIONS | QTY | UNIT PRICE | TOTAL PRICE.
Rows without a price that follow a priced item are material/specification details — merge them into that item's description.

${textContent}

Extract all priced line items. Return ONLY the JSON array.`,
          },
        ];
      }

      console.log(`Extracting from ${fileName} (${bytes.length} bytes, isPdf: ${isPdf})`);

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
        }),
      });

      if (!aiRes.ok) {
        const t = await aiRes.text();
        console.error("AI error:", aiRes.status, t);
        throw new Error(aiRes.status === 429 ? "Příliš mnoho požadavků" : "Chyba AI služby");
      }

      const aiData = await aiRes.json();
      const rawText = aiData.choices?.[0]?.message?.content || "[]";
      let cleaned = rawText.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      }

      let items;
      try {
        items = JSON.parse(cleaned);
      } catch {
        console.error("Failed to parse AI response:", cleaned);
        return new Response(JSON.stringify({ error: "AI vrátilo neplatný formát", raw: cleaned }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ items, fileName }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-tpv-from-sharepoint error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
