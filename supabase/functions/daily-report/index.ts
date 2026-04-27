// Edge function: daily-report
// Wraps SQL function public.get_daily_report(report_date) and groups rows
// into a project -> bundle -> logs structure with per-bundle weekly_goal_pct.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Local-date helper (Europe/Prague). Avoid toISOString to prevent UTC T-1 drift.
function todayPragueIso(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

interface ReportRow {
  row_kind: "plan" | "log";
  bundle_id: string;
  project_id: string;
  project_name: string | null;
  stage_id: string | null;
  bundle_label: string | null;
  bundle_display_label: string | null;
  scheduled_week: string | null;
  scheduled_hours: number | null;
  phase: string | null;
  percent: number | null;
  weekly_goal_pct: number | null;
  is_on_track: boolean | null;
  note_text: string | null;
  total_plan_hours: number | null;
  logged_at: string | null;
  log_day_date: string | null;
  bundle_split_part: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth: validate JWT in code (verify_jwt = false on the function).
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Parse date param (?date=YYYY-MM-DD), default = today (Europe/Prague).
  let reportDate = todayPragueIso();
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("date");
    if (q) {
      if (!isValidIsoDate(q)) {
        return jsonResponse(
          { error: "Invalid date format, expected YYYY-MM-DD" },
          400,
        );
      }
      reportDate = q;
    } else if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.date) {
        if (!isValidIsoDate(body.date)) {
          return jsonResponse(
            { error: "Invalid date format, expected YYYY-MM-DD" },
            400,
          );
        }
        reportDate = body.date;
      }
    }
  } catch (_) {
    // ignore — fall back to today
  }

  // Run RPC with service role for full read access.
  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data, error } = await adminClient.rpc("get_daily_report", {
    report_date: reportDate,
  });

  if (error) {
    console.error("daily-report rpc error", error);
    return jsonResponse({ error: error.message }, 500);
  }

  const rows = (data ?? []) as ReportRow[];

  // Group: project -> bundle -> logs
  type LogEntry = {
    phase: string | null;
    percent: number | null;
    is_on_track: boolean | null;
    note_text: string | null;
    logged_at: string | null;
    log_day_date: string | null;
  };
  type BundleEntry = {
    bundle_id: string;
    bundle_label: string | null;
    bundle_display_label: string | null;
    bundle_split_part: string | null;
    scheduled_week: string | null;
    scheduled_hours: number;
    weekly_goal_pct: number;
    logs: LogEntry[];
  };
  type ProjectEntry = {
    project_id: string;
    project_name: string | null;
    total_plan_hours: number;
    bundles: BundleEntry[];
  };

  const projects = new Map<string, ProjectEntry>();
  const bundleIndex = new Map<string, BundleEntry>(); // key: project_id::bundle_id

  // First pass: plan rows seed bundles with goal %.
  for (const r of rows) {
    if (!projects.has(r.project_id)) {
      projects.set(r.project_id, {
        project_id: r.project_id,
        project_name: r.project_name,
        total_plan_hours: Number(r.total_plan_hours ?? 0),
        bundles: [],
      });
    }
    if (r.row_kind === "plan") {
      const key = `${r.project_id}::${r.bundle_id}`;
      const bundle: BundleEntry = {
        bundle_id: r.bundle_id,
        bundle_label: r.bundle_label,
        bundle_display_label: r.bundle_display_label,
        bundle_split_part: r.bundle_split_part,
        scheduled_week: r.scheduled_week,
        scheduled_hours: Number(r.scheduled_hours ?? 0),
        weekly_goal_pct: Number(r.weekly_goal_pct ?? 0),
        logs: [],
      };
      bundleIndex.set(key, bundle);
      projects.get(r.project_id)!.bundles.push(bundle);
    }
  }

  // Second pass: attach logs to their bundles (match by bundle_id).
  for (const r of rows) {
    if (r.row_kind !== "log") continue;
    const key = `${r.project_id}::${r.bundle_id}`;
    let bundle = bundleIndex.get(key);
    if (!bundle) {
      // Log without a matching plan row in this week — create stub bundle.
      bundle = {
        bundle_id: r.bundle_id,
        bundle_label: r.bundle_label,
        bundle_display_label: r.bundle_display_label,
        bundle_split_part: r.bundle_split_part,
        scheduled_week: null,
        scheduled_hours: 0,
        weekly_goal_pct: Number(r.weekly_goal_pct ?? 0),
        logs: [],
      };
      bundleIndex.set(key, bundle);
      if (!projects.has(r.project_id)) {
        projects.set(r.project_id, {
          project_id: r.project_id,
          project_name: r.project_name,
          total_plan_hours: Number(r.total_plan_hours ?? 0),
          bundles: [],
        });
      }
      projects.get(r.project_id)!.bundles.push(bundle);
    }
    bundle.logs.push({
      phase: r.phase,
      percent: r.percent,
      is_on_track: r.is_on_track,
      note_text: r.note_text,
      logged_at: r.logged_at,
      log_day_date: r.log_day_date,
    });
  }

  const by_project = Array.from(projects.values()).sort((a, b) =>
    (a.project_name ?? a.project_id).localeCompare(
      b.project_name ?? b.project_id,
    ),
  );

  return jsonResponse({
    report_date: reportDate,
    rows,
    by_project,
  });
});
