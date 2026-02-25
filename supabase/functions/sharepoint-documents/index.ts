import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TENANT_ID = Deno.env.get("SHAREPOINT_TENANT_ID")!;
const CLIENT_ID = Deno.env.get("SHAREPOINT_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("SHAREPOINT_CLIENT_SECRET")!;
const SITE_HOST = "amincz.sharepoint.com";
const SITE_PATH = "/sites/AMI-Project-Info";
const LIB_ROOT = "AMI-Project-Info-App-Data";
const GRAPH = "https://graph.microsoft.com/v1.0";

// ---------- helpers ----------

async function getAccessToken(): Promise<string> {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token error ${res.status}: ${text}`);
  }
  const json = await res.json();
  return json.access_token as string;
}

async function getDriveId(token: string): Promise<string> {
  // Resolve site
  const siteRes = await fetch(
    `${GRAPH}/sites/${SITE_HOST}:${SITE_PATH}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!siteRes.ok) {
    const t = await siteRes.text();
    throw new Error(`Site resolve error ${siteRes.status}: ${t}`);
  }
  const site = await siteRes.json();
  const siteId = site.id;

  // Get default drive (Shared Documents)
  const drivesRes = await fetch(
    `${GRAPH}/sites/${siteId}/drives`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!drivesRes.ok) {
    const t = await drivesRes.text();
    throw new Error(`Drives error ${drivesRes.status}: ${t}`);
  }
  const drives = await drivesRes.json();
  // "Documents" is the default document library display name
  const drive =
    drives.value.find((d: any) => d.name === "Shared Documents" || d.name === "Documents") ??
    drives.value[0];
  if (!drive) throw new Error("No drive found on site");
  return drive.id as string;
}

function folderPath(projectId: string, category: string) {
  return `${LIB_ROOT}/${projectId}/${category}`;
}

// ---------- actions ----------

async function listFiles(
  token: string,
  driveId: string,
  projectId: string,
  category: string
) {
  const path = folderPath(projectId, category);
  const url = `${GRAPH}/drives/${driveId}/root:/${path}:/children?$select=name,size,lastModifiedDateTime,@microsoft.graph.downloadUrl`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) {
    // Folder doesn't exist yet — return empty
    await res.text();
    return [];
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`List error ${res.status}: ${t}`);
  }
  const json = await res.json();
  return (json.value ?? []).map((f: any) => ({
    name: f.name,
    size: f.size,
    lastModified: f.lastModifiedDateTime,
    downloadUrl: f["@microsoft.graph.downloadUrl"] ?? null,
  }));
}

async function ensureFolder(
  token: string,
  driveId: string,
  folderPathStr: string
) {
  // Try creating each segment; Graph supports nested creation via children
  const segments = folderPathStr.split("/");
  let currentPath = "";
  for (const seg of segments) {
    const parentUrl = currentPath
      ? `${GRAPH}/drives/${driveId}/root:/${currentPath}:/children`
      : `${GRAPH}/drives/${driveId}/root/children`;
    currentPath = currentPath ? `${currentPath}/${seg}` : seg;

    const res = await fetch(parentUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: seg,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });
    // 409 = already exists, which is fine
    if (!res.ok && res.status !== 409) {
      const t = await res.text();
      // If it's a nameAlreadyExists error, skip
      if (!t.includes("nameAlreadyExists")) {
        throw new Error(`Folder create error ${res.status}: ${t}`);
      }
    }
    await res.text().catch(() => {});
  }
}

async function uploadFile(
  token: string,
  driveId: string,
  projectId: string,
  category: string,
  fileName: string,
  fileContentBase64: string
) {
  const path = folderPath(projectId, category);
  await ensureFolder(token, driveId, path);

  const bytes = Uint8Array.from(atob(fileContentBase64), (c) => c.charCodeAt(0));

  const url = `${GRAPH}/drives/${driveId}/root:/${path}/${fileName}:/content`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Upload error ${res.status}: ${t}`);
  }
  const item = await res.json();
  return {
    name: item.name,
    size: item.size,
    downloadUrl: item["@microsoft.graph.downloadUrl"] ?? null,
  };
}

async function getDownloadUrl(
  token: string,
  driveId: string,
  projectId: string,
  category: string,
  fileName: string
) {
  const path = folderPath(projectId, category);
  const url = `${GRAPH}/drives/${driveId}/root:/${path}/${fileName}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Download URL error ${res.status}: ${t}`);
  }
  const item = await res.json();
  return {
    name: item.name,
    downloadUrl: item["@microsoft.graph.downloadUrl"] ?? null,
  };
}

// ---------- handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, projectId, category, fileName, fileContent } = body;

    if (!action || !projectId || !category) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: action, projectId, category" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = await getAccessToken();
    const driveId = await getDriveId(accessToken);

    let result: unknown;

    switch (action) {
      case "list":
        result = await listFiles(accessToken, driveId, projectId, category);
        break;

      case "upload":
        if (!fileName || !fileContent) {
          return new Response(
            JSON.stringify({ error: "Missing fileName or fileContent for upload" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await uploadFile(accessToken, driveId, projectId, category, fileName, fileContent);
        break;

      case "download":
        if (!fileName) {
          return new Response(
            JSON.stringify({ error: "Missing fileName for download" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await getDownloadUrl(accessToken, driveId, projectId, category, fileName);
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("SharePoint error:", err);
    return new Response(
      JSON.stringify({ error: err.message ?? "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
