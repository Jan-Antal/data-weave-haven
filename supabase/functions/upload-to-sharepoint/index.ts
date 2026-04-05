import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TENANT_ID = "596710ac-cabd-4bd2-8360-f7252eef3064";
const CLIENT_ID = "eb6c5989-f35c-4e41-b094-363f4e74383e";
const DRIVE_ID = "b!nWFFEmSztUKdoK72rP5i2rD3XX2R01hJq7P-m4XyliUqLerVNbvjR78yOFIOzc6X";

async function getAccessToken(): Promise<string> {
  const clientSecret = Deno.env.get("SHAREPOINT_CLIENT_SECRET");
  if (!clientSecret) throw new Error("SHAREPOINT_CLIENT_SECRET is not configured");

  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(tokenUrl, { method: "POST", body });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Token request failed [${res.status}]: ${t}`);
  }
  const data = await res.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { projectId, fileBase64, fileName, mimeType } = await req.json();

    if (!projectId || !fileBase64 || !fileName) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = fileName.split(".").pop()?.toLowerCase() || "pdf";
    const spFileName = `Cenová nabídka.${ext}`;

    const token = await getAccessToken();

    // Decode base64 to binary
    const binaryStr = atob(fileBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/AMI-Project-Info-App-Data/${projectId}/${spFileName}:/content`;

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": mimeType || "application/octet-stream",
      },
      body: bytes,
    });

    if (!uploadRes.ok) {
      const t = await uploadRes.text();
      console.error("SharePoint upload failed:", uploadRes.status, t);
      return new Response(JSON.stringify({ error: `Upload failed [${uploadRes.status}]` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await uploadRes.json();

    return new Response(JSON.stringify({ success: true, webUrl: result.webUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("upload-to-sharepoint error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
