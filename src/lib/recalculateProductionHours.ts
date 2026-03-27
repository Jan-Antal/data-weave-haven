import type { SupabaseClient } from "@supabase/supabase-js";
import { computePlanHours, type PlanHoursResult } from "./computePlanHours";
import { createNotification, getUserIdsByRole } from "./createNotification";

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

  const [
    { data: projectsData },
    { data: settingsData },
    { data: presetsData },
    { data: exchangeRatesData },
  ] = await Promise.all([
    supabaseClient
      .from("projects")
      .select("project_id, project_name, marze, cost_production_pct, cost_preset_id, prodejni_cena, currency, created_at, plan_use_project_price"),
    supabaseClient
      .from("production_settings")
      .select("hourly_rate")
      .limit(1)
      .single(),
    supabaseClient
      .from("cost_breakdown_presets")
      .select("id, is_default, production_pct"),
    supabaseClient
      .from("exchange_rates")
      .select("year, eur_czk")
      .order("year"),
  ]);

  const hourlyRate = Number(settingsData?.hourly_rate) || 550;
  const presets = presetsData || [];
  const exchangeRates = (exchangeRatesData || []) as Array<{ year: number; eur_czk: number }>;
  const projects = (projectsData || []).filter((p: any) =>
    projectIds === "all" || projectIds.includes(p.project_id)
  );

  let updated = 0;
  const projectResults: Array<{ project_id: string; result: PlanHoursResult }> = [];
  const allItemHours: Array<{ id: string; hodiny_plan: number; hodiny_source: string }> = [];

  for (const proj of projects) {
    const preset = proj.cost_preset_id
      ? presets.find((p: any) => p.id === proj.cost_preset_id)
      : presets.find((p: any) => p.is_default) || presets[0];

    // Get TPV items for this project
    const { data: tpvItems } = await supabaseClient
      .from("tpv_items")
      .select("id, item_name, item_type, cena, pocet, status")
      .eq("project_id", proj.project_id)
      .is("deleted_at", null);

    const result = computePlanHours({
      tpvItems: tpvItems || [],
      project: proj,
      preset,
      hourlyRate,
      exchangeRates,
    });

    projectResults.push({ project_id: proj.project_id, result });
    allItemHours.push(...result.item_hours);

    if (!tpvItems?.length && result.hodiny_plan === 0) continue;

    // Update schedule items (current + future weeks only)
    const { data: schedItems } = await supabaseClient
      .from("production_schedule")
      .select("id, item_code, scheduled_czk, scheduled_hours, scheduled_week")
      .eq("project_id", proj.project_id)
      .in("status", ["scheduled", "in_progress"])
      .gte("scheduled_week", weekKey);

    for (const item of schedItems || []) {
      const tpv = (tpvItems || []).find((t: any) => t.item_name === item.item_code);
      if (!tpv) continue;

      const correctCzk = (Number(tpv.cena) || 0) * (Number(tpv.pocet) || 1);
      const correctHours =
        correctCzk > 0
          ? Math.floor((correctCzk * (1 - result.marze_used) * result.prodpct_used) / hourlyRate)
          : 0;

      if (
        correctCzk !== Number(item.scheduled_czk) ||
        correctHours !== Number(item.scheduled_hours)
      ) {
        await supabaseClient
          .from("production_schedule")
          .update({ scheduled_hours: correctHours, scheduled_czk: correctCzk })
          .eq("id", item.id);
        updated++;
      }
    }

    // Update inbox items (pending)
    const { data: inboxItems } = await supabaseClient
      .from("production_inbox")
      .select("id, item_code, estimated_czk, estimated_hours")
      .eq("project_id", proj.project_id)
      .eq("status", "pending");

    for (const item of inboxItems || []) {
      const tpv = (tpvItems || []).find((t: any) => t.item_name === item.item_code);
      if (!tpv) continue;

      const correctCzk = (Number(tpv.cena) || 0) * (Number(tpv.pocet) || 1);
      const correctHours =
        correctCzk > 0
          ? Math.floor((correctCzk * (1 - result.marze_used) * result.prodpct_used) / hourlyRate)
          : 0;

      if (
        correctCzk !== Number(item.estimated_czk) ||
        correctHours !== Number(item.estimated_hours)
      ) {
        await supabaseClient
          .from("production_inbox")
          .update({ estimated_hours: correctHours, estimated_czk: correctCzk })
          .eq("id", item.id);
        updated++;
      }
    }
  }

  // Batch upsert to project_plan_hours
  if (projectResults.length > 0) {
    const batchSize = 50;
    for (let i = 0; i < projectResults.length; i += batchSize) {
      const batch = projectResults.slice(i, i + batchSize);
      await supabaseClient.from("project_plan_hours").upsert(
        batch.map((r) => {
          const proj = projects.find((p: any) => p.project_id === r.project_id);
          return {
            project_id: r.project_id,
            tpv_hours: r.result.tpv_hours,
            project_hours: r.result.project_hours,
            hodiny_plan: r.result.hodiny_plan,
            source: r.result.source,
            warning_low_tpv: r.result.warning_low_tpv,
            force_project_price: proj?.plan_use_project_price ?? false,
            marze_used: r.result.marze_used,
            prodpct_used: r.result.prodpct_used,
            eur_rate_used: r.result.eur_rate_used,
            recalculated_at: new Date().toISOString(),
          };
        }),
        { onConflict: "project_id" }
      );
    }

    // Check for over-plan projects (>100%) and notify admin/owner
    try {
      // Get total scheduled hours per project from production_schedule
      const overPlanProjectIds = projectResults
        .filter((r) => r.result.hodiny_plan > 0)
        .map((r) => r.project_id);

      if (overPlanProjectIds.length > 0) {
        const { data: schedData } = await supabaseClient
          .from("production_schedule")
          .select("project_id, scheduled_hours")
          .in("project_id", overPlanProjectIds)
          .in("status", ["scheduled", "in_progress", "completed"]);

        const hoursByProject: Record<string, number> = {};
        for (const s of schedData || []) {
          hoursByProject[s.project_id] = (hoursByProject[s.project_id] || 0) + Number(s.scheduled_hours);
        }

        const adminIds = await getUserIdsByRole(supabaseClient, ["owner", "admin"]);
        for (const r of projectResults) {
          if (r.result.hodiny_plan <= 0) continue;
          const usedHours = hoursByProject[r.project_id] || 0;
          const pct = Math.round((usedHours / r.result.hodiny_plan) * 100);
          if (pct > 100) {
            await createNotification(supabaseClient, {
              userIds: adminIds,
              type: "warning",
              title: "Překročení plánu hodin",
              body: `${r.project_id} — ${pct}% čerpání`,
              projectId: r.project_id,
              linkContext: { tab: "plan-vyroby", project_id: r.project_id },
              batchKey: `over-plan-${r.project_id}`,
            });
          }
        }
      }
    } catch { /* silent */ }
  }

  // Batch update tpv_items.hodiny_plan
  if (allItemHours.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < allItemHours.length; i += batchSize) {
      const batch = allItemHours.slice(i, i + batchSize);
      for (const item of batch) {
        await supabaseClient
          .from("tpv_items")
          .update({ hodiny_plan: item.hodiny_plan, hodiny_source: item.hodiny_source })
          .eq("id", item.id);
      }
    }
  }

  return updated;
}
