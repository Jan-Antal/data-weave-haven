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

function getAnthropicHeaders(): Record<string, string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured");
  return {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "anthropic-beta": "files-api-2025-04-14",
  };
}

async function uploadToAnthropic(fileBuffer: ArrayBuffer, fileName: string): Promise<string> {
  const headers = getAnthropicHeaders();
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), fileName);

  const res = await fetch("https://api.anthropic.com/v1/files", {
    method: "POST",
    headers: {
      "x-api-key": headers["x-api-key"],
      "anthropic-version": headers["anthropic-version"],
      "anthropic-beta": headers["anthropic-beta"],
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic Files upload error [${res.status}]: ${err}`);
  }

  const { id } = await res.json();
  console.log(`Uploaded ${fileName} to Anthropic Files API, id=${id}`);
  return id;
}

async function deleteFromAnthropic(fileId: string): Promise<void> {
  try {
    const headers = getAnthropicHeaders();
    await fetch(`https://api.anthropic.com/v1/files/${fileId}`, {
      method: "DELETE",
      headers: {
        "x-api-key": headers["x-api-key"],
        "anthropic-version": headers["anthropic-version"],
        "anthropic-beta": headers["anthropic-beta"],
      },
    });
    console.log(`Deleted file ${fileId} from Anthropic`);
  } catch (e) {
    console.warn("Failed to delete Anthropic file:", e);
  }
}

function parseJsonFromResponse(data: any): any[] {
  const textParts = (data.content ?? [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");

  try {
    return JSON.parse(textParts);
  } catch {
    const match = textParts.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  }
}

// ─── Excel extraction (Files API + code_execution tool) ───────────────────────

async function extractFromExcel(fileBuffer: ArrayBuffer, fileName: string): Promise<any[]> {
  const headers = getAnthropicHeaders();
  const fileId = await uploadToAnthropic(fileBuffer, fileName);

  try {
    const msgRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16384,
        tools: [{ type: "code_execution_20250522", name: "code_execution" }],
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "file", file_id: fileId },
              title: fileName,
            },
            {
              type: "text",
              text: `This is an Excel price offer (cenová nabídka). Use code execution to read it with pandas/openpyxl, then extract all priced line items. Return ONLY the JSON array as specified in the system prompt.`,
            },
          ],
        }],
      }),
    });

    if (!msgRes.ok) {
      const err = await msgRes.text();
      throw new Error(`Claude API error [${msgRes.status}]: ${err}`);
    }

    const data = await msgRes.json();
    return parseJsonFromResponse(data);
  } finally {
    await deleteFromAnthropic(fileId);
  }
}

// ─── PDF extraction (Files API + document type) ──────────────────────────────

async function extractFromPDF(fileBuffer: ArrayBuffer, fileName: string): Promise<any[]> {
  const headers = getAnthropicHeaders();
  const fileId = await uploadToAnthropic(fileBuffer, fileName);

  try {
    const msgRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "file", file_id: fileId },
            },
            {
              type: "text",
              text: "Extract all priced line items from this price offer. For each item combine the main row (Kód, Název, Rozměr, Cena) with ALL following specification rows into popis. Skip group headers without prices. Return only the JSON array.",
            },
          ],
        }],
      }),
    });

    if (!msgRes.ok) {
      const err = await msgRes.text();
      throw new Error(`Claude API error [${msgRes.status}]: ${err}`);
    }

    const data = await msgRes.json();
    return parseJsonFromResponse(data);
  } finally {
    await deleteFromAnthropic(fileId);
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
        console.log(`Extracting PDF ${fileName} (${fileBuffer.byteLength} bytes) via Files API`);
        items = await extractFromPDF(fileBuffer, fileName);
      } else {
        console.log(`Extracting Excel ${fileName} (${fileBuffer.byteLength} bytes) via Files API + code_execution`);
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
