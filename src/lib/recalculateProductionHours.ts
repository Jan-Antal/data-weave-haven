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

    // Get TPV items for this project — source of truth
    const { data: tpvItems } = await supabaseClient
      .from("tpv_items")
      .select("item_name, item_type, cena, pocet, status")
      .eq("project_id", proj.project_id)
      .neq("status", "Zrušeno");

    if (!tpvItems?.length) continue;

    // Schedule items (current + future weeks only)
    const { data: schedItems } = await supabaseClient
      .from("production_schedule").select("id, item_code, scheduled_czk, scheduled_hours, scheduled_week")
      .eq("project_id", proj.project_id).in("status", ["scheduled", "in_progress"])
      .gte("scheduled_week", weekKey);

    for (const item of schedItems || []) {
      const tpv = tpvItems.find((t: any) => t.item_name === item.item_code);
      if (!tpv) continue;

      const correctCzk = (Number(tpv.cena) || 0) * (Number(tpv.pocet) || 1);
      const correctHours = correctCzk > 0
        ? Math.floor((correctCzk * (1 - marze) * prodPct) / hourlyRate)
        : 0;

      if (correctCzk !== Number(item.scheduled_czk) || correctHours !== Number(item.scheduled_hours)) {
        await supabaseClient.from("production_schedule").update({ scheduled_hours: correctHours, scheduled_czk: correctCzk }).eq("id", item.id);
        updated++;
      }
    }

    // Inbox items (pending)
    const { data: inboxItems } = await supabaseClient
      .from("production_inbox").select("id, item_code, estimated_czk, estimated_hours")
      .eq("project_id", proj.project_id).eq("status", "pending");

    for (const item of inboxItems || []) {
      const tpv = tpvItems.find((t: any) => t.item_name === item.item_code);
      if (!tpv) continue;

      const correctCzk = (Number(tpv.cena) || 0) * (Number(tpv.pocet) || 1);
      const correctHours = correctCzk > 0
        ? Math.floor((correctCzk * (1 - marze) * prodPct) / hourlyRate)
        : 0;

      if (correctCzk !== Number(item.estimated_czk) || correctHours !== Number(item.estimated_hours)) {
        await supabaseClient.from("production_inbox").update({ estimated_hours: correctHours, estimated_czk: correctCzk }).eq("id", item.id);
        updated++;
      }
    }
  }

  return updated;
}
