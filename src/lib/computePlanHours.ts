import { evaluateFormula, FORMULA_DEFAULTS } from "./formulaEngine";

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
  preset?: { production_pct?: number | null; material_pct?: number | null; overhead_pct?: number | null } | null;
  hourlyRate: number;
  exchangeRates: Array<{ year: number; eur_czk: number }>;
  fallbackEurToCzk?: number;
  defaultMarginPct?: number;
  formulas?: Record<string, string>;
}

export interface ItemPlanHours {
  id: string;
  hodiny_plan: number;
  hodiny_source: "item" | "project";
}

export interface PlanHoursResult {
  hodiny_plan: number;
  tpv_hours: number;
  tpv_hours_raw: number;
  project_hours: number;
  source: "TPV" | "Project" | "None";
  warning_low_tpv: boolean;
  marze_used: number;
  prodpct_used: number;
  eur_rate_used: number;
  scale_ratio: number;
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
    defaultMarginPct = 15,
    formulas,
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

  // Default margin from settings (percentage like 15) → decimal
  const defaultMarginDecimal = defaultMarginPct > 1 ? defaultMarginPct / 100 : defaultMarginPct;

  // Marze: handle both percentage (15) and decimal (0.15) storage formats
  const marze = (() => {
    const raw = Number(project.marze);
    if (!raw || raw <= 0) return defaultMarginDecimal;
    return raw > 1 ? raw / 100 : raw;
  })();

  // Production pct: simple percentage / 100
  const prodPct = project.cost_production_pct != null
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
        ? formulas
          ? Math.floor(evaluateFormula(formulas['scheduled_hours'] ?? FORMULA_DEFAULTS['scheduled_hours'], {
              itemCostCzk: itemCzk, marze, production_pct: prodPct, hourly_rate: hourlyRate
            }))
          : Math.floor((itemCzk * (1 - marze) * prodPct) / hourlyRate)
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

  const tpv_hours_raw = item_hours.reduce((s, i) => s + i.hodiny_plan, 0);

  // Project hours: from prodejni_cena
  const projCenaRaw = Number(project.prodejni_cena) || 0;
  const projCenaCzk = isEur ? projCenaRaw * eurRate : projCenaRaw;
  const project_hours =
    projCenaCzk > 0
      ? formulas
        ? Math.floor(evaluateFormula(formulas['hodiny_plan_projekt'] ?? FORMULA_DEFAULTS['hodiny_plan_projekt'], {
            prodejni_cena: projCenaCzk, eur_czk: 1, marze, production_pct: prodPct, hourly_rate: hourlyRate
          }))
        : Math.floor((projCenaCzk * (1 - marze) * prodPct) / hourlyRate)
      : 0;

  // Warning: TPV sum < 60% of project price (badge only — does not affect calculation)
  const warning_low_tpv =
    tpv_hours_raw > 0 &&
    project_hours > 0 &&
    tpvSumCzk < projCenaCzk * 0.6;

  // Source decision: max(TPV, Project) — never lose hours below project price
  let source: "TPV" | "Project" | "None";
  let hodiny_plan: number;
  let scale_ratio = 1;

  if (tpv_hours_raw > 0 && project_hours > 0) {
    if (project_hours > tpv_hours_raw || project.plan_use_project_price) {
      source = "Project";
      hodiny_plan = project_hours;
      scale_ratio = project_hours / tpv_hours_raw;
    } else {
      source = "TPV";
      hodiny_plan = tpv_hours_raw;
    }
  } else if (tpv_hours_raw > 0) {
    source = "TPV";
    hodiny_plan = tpv_hours_raw;
  } else if (project_hours > 0) {
    source = "Project";
    hodiny_plan = project_hours;
    item_hours.forEach((i) => (i.hodiny_source = "project"));
  } else {
    source = "None";
    hodiny_plan = 0;
  }

  // Apply proportional scaling with remainder on last item
  let tpv_hours = tpv_hours_raw;
  if (scale_ratio > 1 && item_hours.length > 0) {
    let runningSum = 0;
    for (let i = 0; i < item_hours.length - 1; i++) {
      const scaled = Math.floor(item_hours[i].hodiny_plan * scale_ratio);
      item_hours[i].hodiny_plan = scaled;
      item_hours[i].hodiny_source = "project";
      runningSum += scaled;
    }
    // Last item gets remainder so sum equals hodiny_plan exactly
    const last = item_hours[item_hours.length - 1];
    last.hodiny_plan = Math.max(0, hodiny_plan - runningSum);
    last.hodiny_source = "project";
    tpv_hours = item_hours.reduce((s, i) => s + i.hodiny_plan, 0);
  }

  return {
    hodiny_plan,
    tpv_hours,
    tpv_hours_raw,
    project_hours,
    source,
    warning_low_tpv,
    marze_used: marze,
    prodpct_used: prodPct,
    eur_rate_used: eurRate,
    scale_ratio,
    item_hours,
  };
}
