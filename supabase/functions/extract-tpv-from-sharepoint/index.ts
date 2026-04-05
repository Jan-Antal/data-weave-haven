import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

      // Get file info + download URL
      const itemRes = await fetch(`${GRAPH}/drives/${driveId}/items/${fileItemId}?$select=name,size,@microsoft.graph.downloadUrl`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!itemRes.ok) { const t = await itemRes.text(); throw new Error(`Item error [${itemRes.status}]: ${t}`); }
      const item = await itemRes.json();
      const downloadUrl = item["@microsoft.graph.downloadUrl"];
      const fileName = item.name;

      if (!downloadUrl) throw new Error("No download URL available");

      // Download file content
      const fileRes = await fetch(downloadUrl);
      if (!fileRes.ok) throw new Error(`Download failed [${fileRes.status}]`);
      const fileBuffer = await fileRes.arrayBuffer();
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

      const SYSTEM_PROMPT = `You are extracting line items from a price offer (cenová nabídka) for a furniture/interior design company.

Extract ALL line items and return ONLY valid JSON array, no other text:

[
  {
    "item_name": "short item code or name, max 50 chars",
    "popis": "full description of the item",
    "cena": 12500.00,
    "pocet": 2
  }
]

Rules:
- cena = unit price (NOT total). If only total given, divide by quantity.
- pocet = quantity (default 1 if not specified)
- Skip subtotals, headers, totals rows
- item_name should be a short code or abbreviation
- All prices in CZK (convert EUR × 25 if needed)
- Return ONLY the JSON array, no markdown fences, no explanation`;

      let userContent: any[];

      if (isPdf) {
        // PDFs can be sent as image_url with base64
        userContent = [
          {
            type: "image_url",
            image_url: { url: `data:application/pdf;base64,${base64}` },
          },
          {
            type: "text",
            text: "Extract all line items from this price offer document. Return ONLY the JSON array.",
          },
        ];
      } else {
        // Excel files: parse to CSV-like text using a simple binary reader
        // Since Gemini doesn't accept Excel MIME types, we extract text content
        let textContent: string;
        try {
          textContent = parseXlsxToText(bytes);
        } catch (e) {
          console.warn("XLSX parse failed, sending raw base64 as text hint:", e);
          textContent = `[Binary Excel file: ${fileName}, ${bytes.length} bytes. Could not parse locally.]`;
        }
        
        userContent = [
          {
            type: "text",
            text: `This is the content of an Excel price offer file "${fileName}":\n\n${textContent}\n\nExtract all line items from this price offer. Return ONLY the JSON array.`,
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
