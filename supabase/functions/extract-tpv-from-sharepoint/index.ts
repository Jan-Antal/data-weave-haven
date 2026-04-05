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
    .map((f: any) => ({
      itemId: f.id,
      name: f.name,
      size: f.size,
      downloadUrl: f["@microsoft.graph.downloadUrl"] ?? null,
    }));
}

const CN_FOLDER = "Cenova-nabidka";

function isCenovaNabidka(name: string): boolean {
  const lower = name.toLowerCase();
  const normalized = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("cenov")) return true;
  if (/(\b|[-_])cn(\b|[-_.])/i.test(name)) return true;
  return false;
}

function getMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".csv")) return "text/csv";
  return "application/octet-stream";
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

    // Action: search
    if (action === "search") {
      const allFiles: any[] = [];
      const cnPath = `${LIB_ROOT}/${projectId}/${CN_FOLDER}`;
      const cnFiles = await listFilesInFolder(token, driveId, cnPath);
      for (const f of cnFiles) allFiles.push({ ...f, source: "cn_folder" });

      const rootPath = `${LIB_ROOT}/${projectId}`;
      const rootFiles = await listFilesInFolder(token, driveId, rootPath);
      const seenIds = new Set(allFiles.map((f: any) => f.itemId));
      for (const f of rootFiles) {
        if (!seenIds.has(f.itemId)) allFiles.push({ ...f, source: "root" });
      }

      const autoMatches = allFiles.filter((f: any) => isCenovaNabidka(f.name) || f.source === "cn_folder");

      return new Response(JSON.stringify({ autoMatches, allFiles, totalFiles: allFiles.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: extract — download file, convert to base64, call extract-tpv
    if (action === "extract") {
      if (!fileItemId) {
        return new Response(JSON.stringify({ error: "Missing fileItemId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get file metadata
      const itemRes = await fetch(`${GRAPH}/drives/${driveId}/items/${fileItemId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!itemRes.ok) { const t = await itemRes.text(); throw new Error(`Item error [${itemRes.status}]: ${t}`); }
      const item = await itemRes.json();
      const downloadUrl = item["@microsoft.graph.downloadUrl"];
      const fileName = item.name;

      // Download file
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

      // Convert to base64
      const bytes = new Uint8Array(fileBuffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const fileBase64 = btoa(binary);
      const mimeType = getMimeType(fileName);

      console.log(`Extracting ${fileName} (${bytes.length} bytes, mime: ${mimeType})`);

      // Call extract-tpv function directly via Anthropic Claude API
      const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
      if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
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
          system: `You extract line items from Czech furniture price offers (cenová nabídka).
Return ONLY a valid JSON array, no markdown, no explanation:
[{"item_name":"T01","popis":"full description","cena":12500.00,"pocet":1}]
Rules:
- item_name = short code from the document (T01, K01, D-01, etc.). If no code, use short name (max 10 chars).
- popis = full item description including material details, dimensions, hardware specs. Merge sub-rows into parent.
- cena = unit price in CZK (if EUR, multiply by 25). NOT total — divide by quantity if needed.
- pocet = quantity, default 1
- Skip totals, subtotals, section headers, notes
- Include ALL line items with prices, nothing missing`,
          messages: [{
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: fileBase64,
                },
              },
              {
                type: "text",
                text: "Extract all line items from this price offer. Return only the JSON array.",
              },
            ],
          }],
        }),
      });

      if (!aiRes.ok) {
        const errText = await aiRes.text();
        console.error("Claude API error:", aiRes.status, errText);
        throw new Error(`Claude API error [${aiRes.status}]`);
      }

      const aiData = await aiRes.json();
      const rawText = aiData.content?.[0]?.text ?? "";

      let items;
      try {
        items = JSON.parse(rawText);
      } catch {
        const match = rawText.match(/\[[\s\S]*\]/);
        items = match ? JSON.parse(match[0]) : [];
      }

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
