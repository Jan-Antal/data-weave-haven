import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Check if today is a Czech public holiday via Nager.Date API */
async function isCzechPublicHoliday(dateStr: string, year: number): Promise<boolean> {
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/CZ`);
    if (!res.ok) return false;
    const holidays = await res.json();
    return holidays.some((h: { date: string }) => h.date === dateStr);
  } catch {
    return false;
  }
}

/** Check if today falls within a company holiday (from production capacity settings) */
async function isCompanyHoliday(supabase: any, dateStr: string): Promise<boolean> {
  const { data } = await supabase
    .from("company_holidays")
    .select("start_date, end_date")
    .lte("start_date", dateStr)
    .gte("end_date", dateStr);
  return (data && data.length > 0);
}

/** Check if today's capacity is 0 (holiday override in production_capacity) */
async function isZeroCapacityDay(supabase: any, weekKey: string, dayOfWeek: number): Promise<boolean> {
  // Check if the week has capacity_hours = 0 or a holiday_name set
  const { data } = await supabase
    .from("production_capacity")
    .select("capacity_hours, holiday_name, company_holiday_name")
    .eq("week_start", weekKey)
    .limit(1)
    .maybeSingle();

  if (!data) return false;
  // If the entire week has 0 capacity, skip
  if (Number(data.capacity_hours) === 0) return true;
  // If it has a holiday name, it's a reduced week but not necessarily today — 
  // the company_holidays check above handles specific dates
  return false;
}

function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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

    const year = now.getFullYear();
    const todayStr = toLocalDateStr(now);

    // Check Czech public holidays and company holidays in parallel
    const [publicHoliday, companyHoliday] = await Promise.all([
      isCzechPublicHoliday(todayStr, year),
      isCompanyHoliday(supabase, todayStr),
    ]);

    if (publicHoliday) {
      return new Response(JSON.stringify({ message: "Czech public holiday, skipping" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (companyHoliday) {
      return new Response(JSON.stringify({ message: "Company holiday, skipping" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dayIndex = dayOfWeek - 1; // 0=Mon...4=Fri

    // Calculate week_key (ISO week start date)
    const d = new Date(now);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    const weekKey = toLocalDateStr(d);

    // Check if the week has zero capacity (fully blocked)
    const zeroCapacity = await isZeroCapacityDay(supabase, weekKey, dayOfWeek);
    if (zeroCapacity) {
      return new Response(JSON.stringify({ message: "Zero capacity week, skipping" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // If at least one daylog exists for today, the day is considered logged
    const { data: existingLogs } = await supabase
      .from("production_daily_logs")
      .select("bundle_id")
      .eq("week_key", weekKey)
      .eq("day_index", dayIndex)
      .limit(1);

    if (existingLogs && existingLogs.length > 0) {
      return new Response(JSON.stringify({ message: "Daylog exists for today, skipping" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
