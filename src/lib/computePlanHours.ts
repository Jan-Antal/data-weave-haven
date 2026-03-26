export interface PlanHoursInput {
  tpvItems: Array<{
    id?: string;
    cena?: number | null;
    pocet?: number | null;
    status?: string | null;
  }>;
  project: {
    project_id?: string;
    marze?: string | number | null;
    cost_production_pct?: number | null;
    cost_preset_id?: string | null;
    prodejni_cena?: number | null;
    currency?: string | null;
    created_at?: string | null;
    plan_use_project_price?: boolean;
  };
  preset?: { production_pct?: number | null } | null;
  hourlyRate: number;
  exchangeRates: Array<{ year: number; eur_czk: number }>;
  fallbackEurToCzk?: number;
}

export interface ItemPlanHours {
  id: string;
  hodiny_plan: number;
  hodiny_source: "item" | "project";
}

export interface PlanHoursResult {
  hodiny_plan: number;
  tpv_hours: number;
  project_hours: number;
  source: "TPV" | "Project" | "None";
  warning_low_tpv: boolean;
  marze_used: number;
  prodpct_used: number;
  eur_rate_used: number;
  item_hours: ItemPlanHours[];
}

export function computePlanHours(input: PlanHoursInput): PlanHoursResult {
  const {
    tpvItems,
    project,
    preset,
    hourlyRate,
    exchangeRates,
    fallbackEurToCzk = 25,
  } = input;

  // EUR rate: by project creation year → latest year → fallback
  const projYear = project.created_at
    ? new Date(project.created_at).getFullYear()
    : new Date().getFullYear();
  const sorted = [...(exchangeRates || [])].sort((a, b) => b.year - a.year);
  const eurRate =
    sorted.find((r) => r.year === projYear)?.eur_czk ??
    sorted[0]?.eur_czk ??
    fallbackEurToCzk;

  // Marze: project value if filled and > 0, else 15%
  const marze =
    project.marze != null && project.marze !== "" && Number(project.marze) > 0
      ? Number(project.marze) / 100
      : 0.15;

  // Production pct: project override → preset → 30%
  const prodPct =
    project.cost_production_pct != null
      ? Number(project.cost_production_pct) / 100
      : preset?.production_pct != null
        ? Number(preset.production_pct) / 100
        : 0.3;

  const isEur = project.currency === "EUR";

  // Per-item calculation
  const item_hours: ItemPlanHours[] = [];
  let tpvSumCzk = 0;

  const validItems = (tpvItems || []).filter(
    (i) => i.status !== "Zrušeno" && Number(i.cena) > 0
  );

  for (const item of validItems) {
    const cenaCzk = isEur ? Number(item.cena) * eurRate : Number(item.cena);
    const itemCzk = cenaCzk * (Number(item.pocet) || 1);
    const itemHours =
      itemCzk > 0
        ? Math.floor((itemCzk * (1 - marze) * prodPct) / hourlyRate)
        : 0;
    tpvSumCzk += itemCzk;
    if (item.id) {
      item_hours.push({
        id: item.id,
        hodiny_plan: itemHours,
        hodiny_source: "item",
      });
    }
  }

  const tpv_hours = item_hours.reduce((s, i) => s + i.hodiny_plan, 0);

  // Project hours: from prodejni_cena
  const projCenaRaw = Number(project.prodejni_cena) || 0;
  const projCenaCzk = isEur ? projCenaRaw * eurRate : projCenaRaw;
  const project_hours =
    projCenaCzk > 0
      ? Math.floor((projCenaCzk * (1 - marze) * prodPct) / hourlyRate)
      : 0;

  // Warning: TPV sum < 60% of project price
  const warning_low_tpv =
    tpv_hours > 0 &&
    project_hours > 0 &&
    tpvSumCzk < projCenaCzk * 0.6;

  // Source decision
  let source: "TPV" | "Project" | "None";
  let hodiny_plan: number;

  if (project.plan_use_project_price || warning_low_tpv) {
    source = "Project";
    hodiny_plan = project_hours;
    item_hours.forEach((i) => (i.hodiny_source = "project"));
  } else if (tpv_hours > 0) {
    source = "TPV";
    hodiny_plan = tpv_hours;
  } else if (project_hours > 0) {
    source = "Project";
    hodiny_plan = project_hours;
    item_hours.forEach((i) => (i.hodiny_source = "project"));
  } else {
    source = "None";
    hodiny_plan = 0;
  }

  return {
    hodiny_plan,
    tpv_hours,
    project_hours,
    source,
    warning_low_tpv,
    marze_used: marze,
    prodpct_used: prodPct,
    eur_rate_used: eurRate,
    item_hours,
  };
}
