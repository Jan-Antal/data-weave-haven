// Backup export edge function
// Modes:
//   - "sharepoint": exports all tables as JSON files into /Backups/{YYYY-MM-DD}/ on SharePoint, applies retention
//   - "download":   returns a single ZIP (base64) with all table JSONs for direct browser download
//
// Auth:
//   - Cron calls must include { secret: BACKUP_CRON_SECRET } in body
//   - Manual UI calls must be from authenticated owner/admin user (JWT)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// SharePoint config (same as upload-to-sharepoint)
const TENANT_ID = "596710ac-cabd-4bd2-8360-f7252eef3064";
const CLIENT_ID = "eb6c5989-f35c-4e41-b094-363f4e74383e";
const DRIVE_ID =
  "b!nWFFEmSztUKdoK72rP5i2rD3XX2R01hJq7P-m4XyliUqLerVNbvjR78yOFIOzc6X";
const BACKUP_ROOT = "Backups";

// Tables to back up (everything important; skip pure backup snapshots and auth-managed tables)
const TABLES = [
  "projects",
  "project_stages",
  "project_plan_hours",
  "project_status_options",
  "tpv_items",
  "tpv_material",
  "tpv_preparation",
  "tpv_status_options",
  "production_schedule",
  "production_inbox",
  "production_expedice",
  "production_daily_logs",
  "production_capacity",
  "production_capacity_employees",
  "production_quality_checks",
  "production_quality_defects",
  "production_hours_log",
  "production_settings",
  "ami_employees",
  "ami_absences",
  "company_holidays",
  "people",
  "position_catalogue",
  "profiles",
  "user_roles",
  "user_preferences",
  "user_achievements",
  "notifications",
  "data_log",
  "feedback",
  "exchange_rates",
  "overhead_projects",
  "cost_breakdown_presets",
  "custom_column_definitions",
  "column_labels",
  "formula_config",
  "sharepoint_document_cache",
];

const PAGE_SIZE = 1000;

async function getSharePointToken(): Promise<string> {
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
    throw new Error(`SP token request failed [${res.status}]: ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token as string;
}

// deno-lint-ignore no-explicit-any
async function exportTable(
  supabase: any,
  tableName: string,
): Promise<{ rows: unknown[]; count: number; error?: string }> {
  const allRows: unknown[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      return { rows: allRows, count: allRows.length, error: error.message };
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return { rows: allRows, count: allRows.length };
}

async function uploadToSharePoint(
  token: string,
  folderPath: string,
  fileName: string,
  content: Uint8Array,
  mimeType: string,
) {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${folderPath}/${fileName}:/content`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": mimeType,
    },
    body: content,
  });
  if (!res.ok) {
    throw new Error(`SP upload ${fileName} failed [${res.status}]: ${await res.text()}`);
  }
  return await res.json();
}

async function listSharePointFolder(token: string, folderPath: string) {
  const url =
    `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${folderPath}:/children?$top=999`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return [] as Array<{ name: string; id: string }>;
  if (!res.ok) {
    throw new Error(`SP list ${folderPath} failed [${res.status}]: ${await res.text()}`);
  }
  const data = await res.json();
  return (data.value || []) as Array<{ name: string; id: string }>;
}

async function deleteSharePointItem(token: string, itemId: string) {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${itemId}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    console.error(`SP delete ${itemId} failed [${res.status}]: ${await res.text()}`);
  }
}

/**
 * Retention rules:
 *  - Daily backups (folder name = YYYY-MM-DD) older than 90 days are deleted,
 *    UNLESS the date is the 1st of any month — then it is kept up to 365 days
 *    as a "monthly snapshot".
 */
async function applyRetention(token: string) {
  const folders = await listSharePointFolder(token, BACKUP_ROOT);
  const now = new Date();
  const deleted: string[] = [];

  for (const f of folders) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.name);
    if (!m) continue;
    const folderDate = new Date(`${f.name}T00:00:00Z`);
    if (isNaN(folderDate.getTime())) continue;

    const ageDays = (now.getTime() - folderDate.getTime()) / 86400000;
    const isFirstOfMonth = m[3] === "01";
    const maxAge = isFirstOfMonth ? 365 : 90;

    if (ageDays > maxAge) {
      await deleteSharePointItem(token, f.id);
      deleted.push(f.name);
    }
  }
  return deleted;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const mode: "sharepoint" | "download" = body.mode ?? "sharepoint";
    const trigger: string = body.trigger ?? "manual";
    const providedSecret: string | undefined = body.secret;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CRON_SECRET = Deno.env.get("BACKUP_CRON_SECRET");

    // ----- Auth -----
    const isCronCall = trigger === "cron";
    if (isCronCall) {
      if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
        return new Response(JSON.stringify({ error: "Invalid cron secret" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Manual call → must be authenticated owner/admin
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = userData.user.id;

      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: roles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const allowed = (roles || []).some(
        (r: { role: string }) => r.role === "owner" || r.role === "admin",
      );
      if (!allowed) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ----- Export all tables (service role bypasses RLS) -----
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Sync cron secret into app_config (idempotent) so pg_cron can read it.
    if (CRON_SECRET) {
      try {
        await adminClient.from("app_config").upsert(
          { key: "backup_cron_secret", value: CRON_SECRET, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      } catch (e) {
        console.error("app_config sync failed:", e);
      }
    }

    const exportedAt = new Date().toISOString();
    const datePart = exportedAt.slice(0, 10); // YYYY-MM-DD

    const manifest: {
      exported_at: string;
      mode: string;
      trigger: string;
      tables: Array<{ name: string; rows: number; bytes: number; error?: string }>;
      total_rows: number;
      total_bytes: number;
    } = {
      exported_at: exportedAt,
      mode,
      trigger,
      tables: [],
      total_rows: 0,
      total_bytes: 0,
    };

    const tableFiles: Array<{ name: string; content: string }> = [];

    for (const table of TABLES) {
      const { rows, count, error } = await exportTable(adminClient, table);
      const json = JSON.stringify(
        { exported_at: exportedAt, table, row_count: count, rows },
        null,
        2,
      );
      const bytes = new TextEncoder().encode(json).byteLength;
      manifest.tables.push({ name: table, rows: count, bytes, error });
      manifest.total_rows += count;
      manifest.total_bytes += bytes;
      tableFiles.push({ name: `${table}.json`, content: json });
    }

    const manifestJson = JSON.stringify(manifest, null, 2);

    // ----- DOWNLOAD MODE -----
    if (mode === "download") {
      const zip = new JSZip();
      zip.file("_manifest.json", manifestJson);
      for (const f of tableFiles) zip.file(f.name, f.content);
      const zipBytes = await zip.generateAsync({ type: "uint8array" });
      // base64 encode
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < zipBytes.length; i += chunk) {
        binary += String.fromCharCode(
          ...zipBytes.subarray(i, i + chunk),
        );
      }
      const base64 = btoa(binary);
      return new Response(
        JSON.stringify({
          success: true,
          mode: "download",
          filename: `am-interior-backup-${exportedAt.replace(/[:.]/g, "-")}.zip`,
          size_bytes: zipBytes.length,
          total_rows: manifest.total_rows,
          zip_base64: base64,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ----- SHAREPOINT MODE -----
    const spToken = await getSharePointToken();
    const folderPath = `${BACKUP_ROOT}/${datePart}`;

    // Upload manifest first
    await uploadToSharePoint(
      spToken,
      folderPath,
      "_manifest.json",
      new TextEncoder().encode(manifestJson),
      "application/json",
    );
    // Upload each table
    for (const f of tableFiles) {
      await uploadToSharePoint(
        spToken,
        folderPath,
        f.name,
        new TextEncoder().encode(f.content),
        "application/json",
      );
    }

    // Apply retention
    let retentionDeleted: string[] = [];
    try {
      retentionDeleted = await applyRetention(spToken);
    } catch (e) {
      console.error("Retention error:", e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: "sharepoint",
        folder: folderPath,
        tables: manifest.tables.length,
        total_rows: manifest.total_rows,
        total_bytes: manifest.total_bytes,
        retention_deleted: retentionDeleted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("backup-export error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
