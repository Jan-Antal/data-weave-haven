import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get current date info
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return new Response(JSON.stringify({ message: "Weekend, skipping" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dayIndex = dayOfWeek - 1; // 0=Mon...4=Fri

    // Calculate week_key (ISO week start date)
    const d = new Date(now);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    const weekKey = d.toISOString().split("T")[0];

    // Get all scheduled items for this week
    const { data: scheduleItems } = await supabase
      .from("production_schedule")
      .select("id, project_id")
      .eq("scheduled_week", weekKey)
      .in("status", ["scheduled", "in_progress"]);

    if (!scheduleItems || scheduleItems.length === 0) {
      return new Response(JSON.stringify({ message: "No scheduled items" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get existing logs for today
    const bundleIds = scheduleItems.map((s: any) => s.id);
    const { data: existingLogs } = await supabase
      .from("production_daily_logs")
      .select("bundle_id")
      .eq("week_key", weekKey)
      .eq("day_index", dayIndex)
      .in("bundle_id", bundleIds);

    const loggedBundles = new Set((existingLogs || []).map((l: any) => l.bundle_id));
    const missingItems = scheduleItems.filter((s: any) => !loggedBundles.has(s.id));

    if (missingItems.length === 0) {
      return new Response(JSON.stringify({ message: "All logs filled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get unique project IDs with missing logs
    const missingProjectIds = [...new Set(missingItems.map((s: any) => s.project_id))];

    // Get project names
    const { data: projects } = await supabase
      .from("projects")
      .select("project_id, project_name")
      .in("project_id", missingProjectIds);

    const projectMap = new Map((projects || []).map((p: any) => [p.project_id, p.project_name]));

    // Get target users: admin, owner, vyroba roles
    const { data: roleUsers } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["owner", "admin", "vyroba"]);

    const targetUserIds = [...new Set((roleUsers || []).map((r: any) => r.user_id))];

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ message: "No target users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check notification preferences
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("user_id, notification_prefs")
      .in("user_id", targetUserIds);

    const prefsMap = new Map((prefs || []).map((p: any) => [p.user_id, p.notification_prefs]));
    const enabledUsers = targetUserIds.filter((uid: string) => {
      const up = prefsMap.get(uid);
      return !up || up.daylog_missing !== false;
    });

    if (enabledUsers.length === 0) {
      return new Response(JSON.stringify({ message: "All users disabled daylog notifications" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create notifications
    const projectNames = missingProjectIds
      .map((pid: string) => projectMap.get(pid) || pid)
      .slice(0, 3)
      .join(", ");

    const suffix = missingProjectIds.length > 3 ? ` a ${missingProjectIds.length - 3} dalších` : "";

    const rows = enabledUsers.map((userId: string) => ({
      user_id: userId,
      type: "daylog_missing",
      title: "Chybějící denní log",
      body: `Projekty bez záznamu: ${projectNames}${suffix}`,
      actor_name: "Systém",
      actor_initials: "SY",
      read: false,
    }));

    await supabase.from("notifications").insert(rows);

    return new Response(
      JSON.stringify({
        message: `Sent ${rows.length} notifications for ${missingProjectIds.length} projects`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
