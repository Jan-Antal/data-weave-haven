import type { SupabaseClient } from "@supabase/supabase-js";
import { computePlanHours, type PlanHoursResult } from "./computePlanHours";
import { createNotification, getUserIdsByRole } from "./createNotification";
import { loadFormulas, evaluateFormula, FORMULA_DEFAULTS } from "./formulaEngine";

function getCurrentWeekKey(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), diff);
  return monday.toISOString().split("T")[0];
}

export type RecalcProgress = (info: { phase: string; pct: number }) => void;

async function chunkedUpsert(
  supabaseClient: SupabaseClient,
  table: string,
  rows: any[],
  chunkSize = 500,
) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);

    // production_inbox / production_schedule updates are partial payloads keyed by id.
    // Using upsert here can silently fail on NOT NULL columns not included in the payload.
    if (table === "production_inbox" || table === "production_schedule") {
      const results = await Promise.all(
        chunk.map(async ({ id, ...changes }) => {
          const { error } = await supabaseClient.from(table).update(changes).eq("id", id);
          if (error) throw error;
        }),
      );
      await Promise.all(results);
      continue;
    }

    const { error } = await supabaseClient.from(table).upsert(chunk, { onConflict: "id" });
    if (error) throw error;
  }
}

export async function recalculateProductionHours(
  supabaseClient: SupabaseClient,
  projectIds: string[] | "all",
  currentWeekKey?: string,
  recalculateAll?: boolean,
  onProgress?: RecalcProgress,
): Promise<number> {
  const weekKey = currentWeekKey || getCurrentWeekKey();
  const formulas = await loadFormulas(supabaseClient);

  onProgress?.({ phase: "Načítám data...", pct: 2 });

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
      .select("hourly_rate, default_margin_pct")
      .limit(1)
      .single(),
    supabaseClient
      .from("cost_breakdown_presets")
      .select("id, is_default, production_pct, material_pct, overhead_pct"),
    supabaseClient
      .from("exchange_rates")
      .select("year, eur_czk")
      .order("year"),
  ]);

  const hourlyRate = Number(settingsData?.hourly_rate) || 550;
  const defaultMarginPct = Number((settingsData as any)?.default_margin_pct) || 15;
  const presets = presetsData || [];
  const exchangeRates = (exchangeRatesData || []) as Array<{ year: number; eur_czk: number }>;
  const projects = (projectsData || []).filter((p: any) =>
    projectIds === "all" || projectIds.includes(p.project_id)
  );
  const filteredProjectIds = projects.map((p: any) => p.project_id);

  if (filteredProjectIds.length === 0) return 0;

  // Bulk fetch tpv_items, schedule, inbox in parallel — chunk IN() lists to avoid URL length limits
  async function bulkFetchIn<T = any>(
    table: string,
    select: string,
    column: string,
    values: string[],
    extra?: (q: any) => any,
  ): Promise<T[]> {
    const chunkSize = 200;
    const out: T[] = [];
    for (let i = 0; i < values.length; i += chunkSize) {
      const slice = values.slice(i, i + chunkSize);
      let q = supabaseClient.from(table).select(select).in(column, slice);
      if (extra) q = extra(q);
      const { data, error } = await q;
      if (error) throw error;
      if (data) out.push(...(data as T[]));
    }
    return out;
  }

  const [allTpv, allSched, allInbox] = await Promise.all([
    bulkFetchIn<any>(
      "tpv_items",
      "id, item_code, nazev, cena, pocet, status, project_id",
      "project_id",
      filteredProjectIds,
      (q) => q.is("deleted_at", null),
    ),
    bulkFetchIn<any>(
      "production_schedule",
      "id, item_code, scheduled_czk, scheduled_hours, scheduled_week, split_part, split_total, split_group_id, project_id, status",
      "project_id",
      filteredProjectIds,
      (q) => q.in("status", ["scheduled", "in_progress", "completed"]),
    ),
    bulkFetchIn<any>(
      "production_inbox",
      "id, item_code, estimated_czk, estimated_hours, split_part, split_total, split_group_id, project_id, stage_id, sent_at, status",
      "project_id",
      filteredProjectIds,
      (q) => q.eq("status", "pending"),
    ),
  ]);

  // Group by project
  const tpvByProject = new Map<string, any[]>();
  for (const t of allTpv) {
    const arr = tpvByProject.get(t.project_id) || [];
    arr.push(t);
    tpvByProject.set(t.project_id, arr);
  }
  const schedByProject = new Map<string, any[]>();
  for (const s of allSched) {
    if (!recalculateAll && s.scheduled_week < weekKey) continue;
    const arr = schedByProject.get(s.project_id) || [];
    arr.push(s);
    schedByProject.set(s.project_id, arr);
  }
  const inboxByProject = new Map<string, any[]>();
  for (const it of allInbox) {
    const arr = inboxByProject.get(it.project_id) || [];
    arr.push(it);
    inboxByProject.set(it.project_id, arr);
  }

  let updated = 0;
  const projectResults: Array<{ project_id: string; result: PlanHoursResult }> = [];
  const allItemHourUpdates: Array<{ id: string; hodiny_plan: number; hodiny_source: string }> = [];
  const scheduleUpdates: Array<{ id: string; scheduled_hours: number; scheduled_czk: number }> = [];
  const inboxUpdates: Array<{ id: string; estimated_hours: number; estimated_czk: number }> = [];

  const total = projects.length;
  let processed = 0;

  for (const proj of projects) {
    const preset = proj.cost_preset_id
      ? presets.find((p: any) => p.id === proj.cost_preset_id)
      : presets.find((p: any) => p.is_default) || presets[0];

    const tpvItems = tpvByProject.get(proj.project_id) || [];

    const result = computePlanHours({
      tpvItems,
      project: proj,
      preset,
      hourlyRate,
      exchangeRates,
      defaultMarginPct,
      formulas,
    });

    projectResults.push({ project_id: proj.project_id, result });
    allItemHourUpdates.push(...result.item_hours);

    if (tpvItems.length || result.hodiny_plan !== 0) {
      // EUR conversion for this project
      const isEur = proj.currency === 'EUR';
      const eurRate = (() => {
        const projYear = proj.created_at ? new Date(proj.created_at).getFullYear() : new Date().getFullYear();
        const sorted = [...exchangeRates].sort((a, b) => b.year - a.year);
        return sorted.find(r => r.year === projYear)?.eur_czk ?? sorted[0]?.eur_czk ?? 25;
      })();

      const prodejniCena = isEur
        ? (Number(proj.prodejni_cena) || 0) * eurRate
        : (Number(proj.prodejni_cena) || 0);

      const scaleRatio = result.scale_ratio || 1;
      const schedItems = schedByProject.get(proj.project_id) || [];

      // Build ratio map for split groups (preserve proportional distribution)
      const splitGroupTotals: Record<string, number> = {};
      for (const item of schedItems) {
        if (item.split_group_id) {
          splitGroupTotals[item.split_group_id] = (splitGroupTotals[item.split_group_id] || 0) + Number(item.scheduled_hours);
        }
      }

      for (const item of schedItems) {
        if (item.item_code?.startsWith('HIST_')) {
          const histHours = Number(item.scheduled_hours) || 0;
          const totalPlanHours = result.hodiny_plan || 0;
          if (histHours > 0 && totalPlanHours > 0) {
            const correctCzk = Math.floor(evaluateFormula(
              formulas['scheduled_czk_hist'] ?? FORMULA_DEFAULTS['scheduled_czk_hist'],
              { scheduled_hours: histHours, hodiny_plan: totalPlanHours, prodejni_cena: prodejniCena, eur_czk: 1 }
            ));
            if (correctCzk !== Number(item.scheduled_czk)) {
              scheduleUpdates.push({ id: item.id, scheduled_hours: Number(item.scheduled_hours), scheduled_czk: correctCzk });
              updated++;
            }
          }
          continue;
        }
        const tpv = tpvItems.find((t: any) => t.item_code === item.item_code);
        if (!tpv) continue;

        const rawCena = Number(tpv.cena) || 0;
        const cenaCzk = isEur ? rawCena * eurRate : rawCena;
        const itemCostCzk = cenaCzk * (Number(tpv.pocet) || 1);
        const correctCzk = Math.floor(evaluateFormula(
          formulas['scheduled_czk_tpv'] ?? FORMULA_DEFAULTS['scheduled_czk_tpv'],
          { tpv_cena: rawCena, pocet: Number(tpv.pocet) || 1, eur_czk: isEur ? eurRate : 1 }
        ));
        const rawTotalHours =
          itemCostCzk > 0
            ? Math.floor(evaluateFormula(
                formulas['scheduled_hours'] ?? FORMULA_DEFAULTS['scheduled_hours'],
                { itemCostCzk, marze: result.marze_used, production_pct: result.prodpct_used, hourly_rate: hourlyRate }
              ))
            : 0;
        const totalHours = Math.floor(rawTotalHours * scaleRatio);
        const splitGroupId = item.split_group_id;
        const correctHours = (() => {
          if (!splitGroupId || !splitGroupTotals[splitGroupId]) {
            return Math.floor(totalHours / (Number(item.split_total) || 1));
          }
          const ratio = Number(item.scheduled_hours) / splitGroupTotals[splitGroupId];
          return Math.floor(totalHours * ratio);
        })();

        if (
          correctCzk !== Number(item.scheduled_czk) ||
          correctHours !== Number(item.scheduled_hours)
        ) {
          scheduleUpdates.push({ id: item.id, scheduled_hours: correctHours, scheduled_czk: correctCzk });
          updated++;
        }
      }

      // ===== INBOX: direct mirror of TPV item hours =====
      // Each inbox item with an item_code mapped to a TPV item gets:
      //   estimated_hours = tpv.hodiny_plan (already accounts for pocet & margin via computePlanHours)
      //   estimated_czk   = cena × pocet (via scheduled_czk_tpv formula)
      // For chained items (split_group_id) → split tpv hours by active parts count for that item_code.
      // Ad-hoc items (no TPV match) keep their existing values.
      const inboxItemsAll = inboxByProject.get(proj.project_id) || [];
      const inboxItems = inboxItemsAll.filter((it: any) => !it.item_code?.startsWith('HIST_'));

      // Map: tpv.id → final hodiny_plan (already scaled in computePlanHours.item_hours)
      const tpvHoursById = new Map<string, number>();
      for (const ih of result.item_hours) tpvHoursById.set(ih.id, ih.hodiny_plan);

      // Count active chain parts per item_code (inbox + non-midflight schedule)
      const fullSchedForProject = allSched.filter((s: any) => s.project_id === proj.project_id);
      const activePartsByCode = new Map<string, number>();
      for (const it of inboxItems) {
        if (!it.item_code) continue;
        activePartsByCode.set(it.item_code, (activePartsByCode.get(it.item_code) || 0) + 1);
      }
      for (const s of fullSchedForProject) {
        if (!s.item_code || s.is_midflight) continue;
        if (s.item_code.startsWith('HIST_')) continue;
        activePartsByCode.set(s.item_code, (activePartsByCode.get(s.item_code) || 0) + 1);
      }

      for (const item of inboxItems) {
        const tpv = tpvItems.find((t: any) => t.item_code === item.item_code);
        if (!tpv) continue; // ad-hoc inbox item — leave untouched

        const rawCena = Number(tpv.cena) || 0;
        const correctCzk = Math.floor(evaluateFormula(
          formulas['scheduled_czk_tpv'] ?? FORMULA_DEFAULTS['scheduled_czk_tpv'],
          { tpv_cena: rawCena, pocet: Number(tpv.pocet) || 1, eur_czk: isEur ? eurRate : 1 }
        ));

        const tpvHoursTotal = tpvHoursById.get(tpv.id) ?? 0;
        const partsCount = Math.max(1, activePartsByCode.get(item.item_code!) || 1);
        const newHours = Math.round((tpvHoursTotal / partsCount) * 10) / 10;

        // For chained items, also split CZK proportionally
        const newCzk = item.split_group_id ? Math.floor(correctCzk / partsCount) : correctCzk;

        if (
          newCzk !== Number(item.estimated_czk) ||
          newHours !== Number(item.estimated_hours)
        ) {
          inboxUpdates.push({ id: item.id, estimated_hours: newHours, estimated_czk: newCzk });
          updated++;
        }
      }
    }

    processed++;
    // Compute phase covers ~10% → 70%
    if (onProgress && (processed % 10 === 0 || processed === total)) {
      const pct = 10 + Math.floor((processed / total) * 60);
      onProgress({ phase: `Počítám projekty (${processed}/${total})...`, pct });
    }
  }

  // Bulk writes in parallel where possible
  onProgress?.({ phase: "Ukládám změny...", pct: 75 });

  const writePromises: Promise<any>[] = [];

  if (scheduleUpdates.length > 0) {
    writePromises.push(chunkedUpsert(supabaseClient, "production_schedule", scheduleUpdates));
  }
  if (inboxUpdates.length > 0) {
    writePromises.push(chunkedUpsert(supabaseClient, "production_inbox", inboxUpdates));
  }

  // project_plan_hours upsert (by project_id, not id)
  if (projectResults.length > 0) {
    const planRows = projectResults.map((r) => {
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
    });
    const batchSize = 500;
    for (let i = 0; i < planRows.length; i += batchSize) {
      const batch = planRows.slice(i, i + batchSize);
      writePromises.push(
        supabaseClient.from("project_plan_hours").upsert(batch, { onConflict: "project_id" }) as any
      );
    }
  }

  // tpv_items bulk update — need full row for upsert by id; include project_id (NOT NULL)
  if (allItemHourUpdates.length > 0) {
    const idToProject = new Map<string, string>();
    for (const t of allTpv) idToProject.set(t.id, t.project_id);
    const tpvRows = allItemHourUpdates
      .filter((it) => idToProject.has(it.id))
      .map((it) => ({
        id: it.id,
        project_id: idToProject.get(it.id)!,
        item_code: allTpv.find((t: any) => t.id === it.id)?.item_code,
        hodiny_plan: it.hodiny_plan,
        hodiny_source: it.hodiny_source,
      }));
    writePromises.push(chunkedUpsert(supabaseClient, "tpv_items", tpvRows));
  }

  await Promise.all(writePromises);

  // Project-wide chain renumbering: keep split badges (N/N) consistent across
  // schedule + inbox after hour redistribution. Best-effort — failures don't
  // abort the recalc.
  try {
    const { renumberAllChainsForProject } = await import("./splitChainHelpers");
    for (const pid of filteredProjectIds) {
      try { await renumberAllChainsForProject(pid); } catch { /* per-project silent */ }
    }
  } catch { /* silent */ }

  onProgress?.({ phase: "Kontrola překročení plánu...", pct: 92 });

  // Over-plan notifications
  try {
    const overPlanProjectIds = projectResults
      .filter((r) => r.result.hodiny_plan > 0)
      .map((r) => r.project_id);

    if (overPlanProjectIds.length > 0) {
      const schedData: any[] = [];
      const chunk = 200;
      for (let i = 0; i < overPlanProjectIds.length; i += chunk) {
        const slice = overPlanProjectIds.slice(i, i + chunk);
        const { data } = await supabaseClient
          .from("production_schedule")
          .select("project_id, scheduled_hours")
          .in("project_id", slice)
          .in("status", ["scheduled", "in_progress", "completed"]);
        if (data) schedData.push(...data);
      }

      const hoursByProject: Record<string, number> = {};
      for (const s of schedData) {
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

  onProgress?.({ phase: "Hotovo", pct: 100 });

  return updated;
}
