import type { SupabaseClient } from "@supabase/supabase-js";

function getCurrentWeekKey(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), diff);
  return monday.toISOString().split("T")[0];
}

export async function recalculateProductionHours(
  supabaseClient: SupabaseClient,
  projectIds: string[] | "all",
  currentWeekKey?: string
): Promise<number> {
  const weekKey = currentWeekKey || getCurrentWeekKey();

  const [{ data: projectsData }, { data: settingsData }, { data: presetsData }] = await Promise.all([
    supabaseClient.from("projects").select("project_id, marze, cost_production_pct, cost_preset_id"),
    supabaseClient.from("production_settings").select("hourly_rate").limit(1).single(),
    supabaseClient.from("cost_breakdown_presets").select("id, is_default, production_pct"),
  ]);

  const hourlyRate = Number(settingsData?.hourly_rate) || 550;
  const presets = presetsData || [];
  const projects = (projectsData || []).filter((p: any) =>
    projectIds === "all" || projectIds.includes(p.project_id)
  );

  let updated = 0;

  for (const proj of projects) {
    const preset = proj.cost_preset_id
      ? presets.find((p: any) => p.id === proj.cost_preset_id)
      : presets.find((p: any) => p.is_default) || presets[0];
    const prodPct = proj.cost_production_pct != null
      ? Number(proj.cost_production_pct) / 100
      : (preset?.production_pct ?? 30) / 100;
    const marze = proj.marze ? Number(proj.marze) / 100 : 0;

    // Inbox items (pending)
    const { data: inboxItems } = await supabaseClient
      .from("production_inbox").select("id, estimated_czk, estimated_hours")
      .eq("project_id", proj.project_id).eq("status", "pending");

    for (const item of inboxItems || []) {
      const czk = Number(item.estimated_czk) || 0;
      const hours = czk > 0 ? Math.max(1, Math.round((czk * (1 - marze) * prodPct) / hourlyRate)) : 8;
      if (hours !== Number(item.estimated_hours)) {
        await supabaseClient.from("production_inbox").update({ estimated_hours: hours }).eq("id", item.id);
        updated++;
      }
    }

    // Schedule items (current + future weeks only)
    const { data: schedItems } = await supabaseClient
      .from("production_schedule").select("id, scheduled_czk, scheduled_hours, scheduled_week")
      .eq("project_id", proj.project_id).in("status", ["scheduled", "in_progress"])
      .gte("scheduled_week", weekKey);

    for (const item of schedItems || []) {
      const czk = Number(item.scheduled_czk) || 0;
      const hours = czk > 0 ? Math.max(1, Math.round((czk * (1 - marze) * prodPct) / hourlyRate)) : 8;
      if (hours !== Number(item.scheduled_hours)) {
        await supabaseClient.from("production_schedule").update({ scheduled_hours: hours }).eq("id", item.id);
        updated++;
      }
    }
  }

  return updated;
}
