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

  const drivesRes = await fetch(
    `${GRAPH}/sites/${siteId}/drives`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!drivesRes.ok) {
    const t = await drivesRes.text();
    throw new Error(`Drives error ${drivesRes.status}: ${t}`);
  }
  const drives = await drivesRes.json();
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

async function deleteFile(
  token: string,
  driveId: string,
  projectId: string,
  category: string,
  fileName: string
) {
  const path = folderPath(projectId, category);
  const encodedFileName = encodeURIComponent(fileName);
  const itemUrl = `${GRAPH}/drives/${driveId}/root:/${path}/${encodedFileName}`;
  console.log("[delete] Resolving item:", itemUrl);
  const itemRes = await fetch(itemUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!itemRes.ok) {
    const t = await itemRes.text();
    throw new Error(`Delete resolve error ${itemRes.status}: ${t}`);
  }
  const item = await itemRes.json();
  const itemId = item.id;
  console.log("[delete] Deleting itemId:", itemId);
  const delRes = await fetch(`${GRAPH}/drives/${driveId}/items/${itemId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!delRes.ok && delRes.status !== 204) {
    const t = await delRes.text();
    throw new Error(`Delete error ${delRes.status}: ${t}`);
  }
  await delRes.text().catch(() => {});
  return { success: true };
}

async function archiveProjectFolder(
  token: string,
  driveId: string,
  projectId: string
) {
  // Ensure _Archiv folder exists
  await ensureFolder(token, driveId, `${LIB_ROOT}/_Archiv`);

  // Try to get the project folder
  const folderUrl = `${GRAPH}/drives/${driveId}/root:/${LIB_ROOT}/${projectId}`;
  console.log("[archive] Resolving project folder:", folderUrl);
  const folderRes = await fetch(folderUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (folderRes.status === 404) {
    await folderRes.text();
    console.log("[archive] No project folder found, nothing to archive");
    return { success: true, archived: false };
  }
  if (!folderRes.ok) {
    const t = await folderRes.text();
    throw new Error(`Archive resolve error ${folderRes.status}: ${t}`);
  }
  const folder = await folderRes.json();
  const folderId = folder.id;

  // Move folder to _Archiv
  const moveRes = await fetch(`${GRAPH}/drives/${driveId}/items/${folderId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parentReference: {
        path: `/drives/${driveId}/root:/${LIB_ROOT}/_Archiv`,
      },
      name: projectId,
    }),
  });
  if (!moveRes.ok) {
    const t = await moveRes.text();
    throw new Error(`Archive move error ${moveRes.status}: ${t}`);
  }
  await moveRes.json();
  console.log("[archive] Successfully archived", projectId);
  return { success: true, archived: true };
}

async function listFiles(
  token: string,
  driveId: string,
  projectId: string,
  category: string
) {
  const path = folderPath(projectId, category);
  const url = `${GRAPH}/drives/${driveId}/root:/${path}:/children?$select=id,name,size,lastModifiedDateTime,webUrl,file,@microsoft.graph.downloadUrl&$expand=thumbnails`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) {
    await res.text();
    return [];
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`List error ${res.status}: ${t}`);
  }
  const json = await res.json();
  return (json.value ?? [])
    .filter((f: any) => f.file) // only files, not subfolders
    .map((f: any) => ({
      itemId: f.id,
      name: f.name,
      size: f.size,
      lastModified: f.lastModifiedDateTime,
      downloadUrl: f["@microsoft.graph.downloadUrl"] ?? null,
      webUrl: f.webUrl ?? null,
      thumbnailUrl: f.thumbnails?.[0]?.medium?.url ?? null,
      largeThumbUrl: f.thumbnails?.[0]?.large?.url ?? null,
    }));
}

async function ensureFolder(
  token: string,
  driveId: string,
  folderPathStr: string
) {
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
    if (!res.ok && res.status !== 409) {
      const t = await res.text();
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
    itemId: item.id,
    name: item.name,
    size: item.size,
    downloadUrl: item["@microsoft.graph.downloadUrl"] ?? null,
    webUrl: item.webUrl ?? null,
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
  const encodedFileName = encodeURIComponent(fileName);
  const url = `${GRAPH}/drives/${driveId}/root:/${path}/${encodedFileName}`;
  console.log("[download] Fetching item metadata:", url);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const responseText = await res.text();
  console.log("[download] Graph API status:", res.status, "body:", responseText);
  if (!res.ok) {
    throw new Error(`Download URL error ${res.status}: ${responseText}`);
  }
  const item = JSON.parse(responseText);
  const downloadUrl = item["@microsoft.graph.downloadUrl"] ?? null;
  console.log("[download] downloadUrl found:", !!downloadUrl);
  return {
    name: item.name,
    downloadUrl,
    webUrl: item.webUrl ?? null,
  };
}

async function getPreviewUrl(
  token: string,
  driveId: string,
  itemId: string
) {
  // Get preview embed URL
  const previewRes = await fetch(
    `${GRAPH}/drives/${driveId}/items/${itemId}/preview`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );
  if (!previewRes.ok) {
    const t = await previewRes.text();
    throw new Error(`Preview error ${previewRes.status}: ${t}`);
  }
  const preview = await previewRes.json();

  // Also get item info for webUrl
  const itemRes = await fetch(
    `${GRAPH}/drives/${driveId}/items/${itemId}?$select=name,webUrl,@microsoft.graph.downloadUrl`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  let webUrl = null;
  let downloadUrl = null;
  let name = "";
  if (itemRes.ok) {
    const item = await itemRes.json();
    webUrl = item.webUrl ?? null;
    downloadUrl = item["@microsoft.graph.downloadUrl"] ?? null;
    name = item.name ?? "";
  } else {
    await itemRes.text();
  }

  return {
    previewUrl: preview.getUrl ?? null,
    webUrl,
    downloadUrl,
    name,
  };
}

async function renameProjectFolder(
  token: string,
  driveId: string,
  oldProjectId: string,
  newProjectId: string
): Promise<{ success: boolean; folderNotFound?: boolean }> {
  // Check if old folder exists
  const oldFolderUrl = `${GRAPH}/drives/${driveId}/root:/${LIB_ROOT}/${oldProjectId}`;
  console.log("[rename] Checking old folder:", oldFolderUrl);
  const oldRes = await fetch(oldFolderUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (oldRes.status === 404) {
    await oldRes.text();
    console.log("[rename] Old folder not found, skip rename");
    return { success: true, folderNotFound: true };
  }
  if (!oldRes.ok) {
    const t = await oldRes.text();
    throw new Error(`Rename resolve error ${oldRes.status}: ${t}`);
  }
  const oldFolder = await oldRes.json();
  const folderId = oldFolder.id;

  // Check if target folder already exists
  const newFolderUrl = `${GRAPH}/drives/${driveId}/root:/${LIB_ROOT}/${newProjectId}`;
  const newRes = await fetch(newFolderUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (newRes.ok) {
    await newRes.json();
    throw new Error("TARGET_EXISTS");
  }
  await newRes.text().catch(() => {});

  // Rename folder
  console.log("[rename] Renaming folder", folderId, "from", oldProjectId, "to", newProjectId);
  const patchRes = await fetch(`${GRAPH}/drives/${driveId}/items/${folderId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: newProjectId }),
  });
  if (!patchRes.ok) {
    const t = await patchRes.text();
    throw new Error(`Rename error ${patchRes.status}: ${t}`);
  }
  await patchRes.json();
  console.log("[rename] Successfully renamed to", newProjectId);
  return { success: true };
}

const CATEGORIES = ["Cenova-nabidka", "Smlouva", "Zadani", "Vykresy", "Dokumentace", "Dodaci-list", "Fotky"];

// ---------- move file between folders ----------

async function moveFile(
  token: string,
  driveId: string,
  projectId: string,
  sourceCategory: string,
  destCategory: string,
  fileName: string
) {
  // Get the source file's item ID
  const sourcePath = folderPath(projectId, sourceCategory);
  const encodedFileName = encodeURIComponent(fileName);
  const itemUrl = `${GRAPH}/drives/${driveId}/root:/${sourcePath}/${encodedFileName}`;
  const itemRes = await fetch(itemUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!itemRes.ok) {
    const t = await itemRes.text();
    throw new Error(`Move resolve error ${itemRes.status}: ${t}`);
  }
  const item = await itemRes.json();
  const itemId = item.id;

  // Ensure destination folder exists
  const destPath = folderPath(projectId, destCategory);
  await ensureFolder(token, driveId, destPath);

  // Get destination folder ID
  const destFolderUrl = `${GRAPH}/drives/${driveId}/root:/${destPath}`;
  const destRes = await fetch(destFolderUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!destRes.ok) {
    const t = await destRes.text();
    throw new Error(`Move dest resolve error ${destRes.status}: ${t}`);
  }
  const destFolder = await destRes.json();
  const destFolderId = destFolder.id;

  // Move the file via PATCH
  const moveRes = await fetch(`${GRAPH}/drives/${driveId}/items/${itemId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parentReference: { id: destFolderId },
      name: fileName,
    }),
  });
  if (!moveRes.ok) {
    const t = await moveRes.text();
    throw new Error(`Move error ${moveRes.status}: ${t}`);
  }
  const movedItem = await moveRes.json();
  return {
    success: true,
    itemId: movedItem.id,
    name: movedItem.name,
    size: movedItem.size,
    downloadUrl: movedItem["@microsoft.graph.downloadUrl"] ?? null,
    webUrl: movedItem.webUrl ?? null,
  };
}

async function countFilesForProjects(
  token: string,
  driveId: string,
  projectIds: string[]
) {
  const counts: Record<string, number> = {};
  await Promise.all(
    projectIds.map(async (pid) => {
      let total = 0;
      await Promise.all(
        CATEGORIES.map(async (cat) => {
          const path = folderPath(pid, cat);
          const url = `${GRAPH}/drives/${driveId}/root:/${path}:/children?$select=id,file&$top=999`;
          try {
            const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
              const json = await res.json();
              total += (json.value ?? []).filter((f: any) => f.file).length;
            } else {
              await res.text();
            }
          } catch {
            // ignore
          }
        })
      );
      counts[pid] = total;
    })
  );
  return { counts };
}

// ---------- handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
    const { action, projectId, projectIds, category, fileName, fileContent, itemId } = body;

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Missing required field: action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Preview only needs itemId
    if (action === "preview") {
      if (!itemId) {
        return new Response(
          JSON.stringify({ error: "Missing itemId for preview" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const accessToken = await getAccessToken();
      const driveId = await getDriveId(accessToken);
      const result = await getPreviewUrl(accessToken, driveId, itemId);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Move file between folders
    if (action === "move") {
      const { sourceCategory, destCategory } = body;
      if (!projectId || !sourceCategory || !destCategory || !fileName) {
        return new Response(
          JSON.stringify({ error: "Missing projectId, sourceCategory, destCategory, or fileName for move" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const accessToken = await getAccessToken();
      const driveId = await getDriveId(accessToken);
      const result = await moveFile(accessToken, driveId, projectId, sourceCategory, destCategory, fileName);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete file action
    if (action === "delete") {
      if (!projectId || !category || !fileName) {
        return new Response(
          JSON.stringify({ error: "Missing projectId, category, or fileName for delete" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const accessToken = await getAccessToken();
      const driveId = await getDriveId(accessToken);
      const result = await deleteFile(accessToken, driveId, projectId, category, fileName);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Archive project folder action
    if (action === "archive") {
      if (!projectId) {
        return new Response(
          JSON.stringify({ error: "Missing projectId for archive" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const accessToken = await getAccessToken();
      const driveId = await getDriveId(accessToken);
      const result = await archiveProjectFolder(accessToken, driveId, projectId);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rename project folder action
    if (action === "rename") {
      const { oldProjectId, newProjectId } = body;
      if (!oldProjectId || !newProjectId) {
        return new Response(
          JSON.stringify({ error: "Missing oldProjectId or newProjectId for rename" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const accessToken = await getAccessToken();
      const driveId = await getDriveId(accessToken);
      try {
        const result = await renameProjectFolder(accessToken, driveId, oldProjectId, newProjectId);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        if (err.message === "TARGET_EXISTS") {
          return new Response(
            JSON.stringify({ error: "TARGET_EXISTS" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw err;
      }
    }

    // Create upload session for chunked upload (large files)
    if (action === "create_upload_session") {
      const { fileName: sessionFileName, fileSize } = body;
      if (!projectId || !category || !sessionFileName) {
        return new Response(
          JSON.stringify({ error: "Missing projectId, category, or fileName for create_upload_session" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const accessToken = await getAccessToken();
      const driveId = await getDriveId(accessToken);
      const path = folderPath(projectId, category);
      await ensureFolder(accessToken, driveId, path);
      
      const sessionUrl = `${GRAPH}/drives/${driveId}/root:/${path}/${sessionFileName}:/createUploadSession`;
      const sessionRes = await fetch(sessionUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          item: {
            "@microsoft.graph.conflictBehavior": "rename",
            name: sessionFileName,
          },
        }),
      });
      if (!sessionRes.ok) {
        const t = await sessionRes.text();
        throw new Error(`Upload session error ${sessionRes.status}: ${t}`);
      }
      const sessionData = await sessionRes.json();
      return new Response(JSON.stringify({ uploadUrl: sessionData.uploadUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Count action — accepts projectIds array
    if (action === "count") {
      if (!projectIds || !Array.isArray(projectIds) || projectIds.length === 0) {
        return new Response(
          JSON.stringify({ error: "Missing projectIds array for count" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const accessToken = await getAccessToken();
      const driveId = await getDriveId(accessToken);
      const result = await countFilesForProjects(accessToken, driveId, projectIds);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!projectId || !category) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: projectId, category" }),
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
        console.log("[download] Request:", { projectId, category, fileName });
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
      JSON.stringify({ error: "Document operation failed. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
