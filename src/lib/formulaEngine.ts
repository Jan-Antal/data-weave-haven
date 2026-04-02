import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hardcoded formula defaults — the ultimate fallback.
 * These are NEVER read from DB to populate; they live in code.
 */
export const FORMULA_DEFAULTS: Record<string, string> = {
  scheduled_czk_hist:
    "FLOOR((scheduled_hours / hodiny_plan) * prodejni_cena * eur_czk)",
  scheduled_czk_tpv: "FLOOR(tpv_cena * pocet * eur_czk)",
  scheduled_hours:
    "FLOOR(itemCostCzk * (1 - marze) * production_pct / hourly_rate)",
  hodiny_plan_projekt:
    "FLOOR(prodejni_cena * eur_czk * (1 - marze) * production_pct / hourly_rate)",
  hodiny_plan_tpv:
    "FLOOR(tpv_cena * pocet * eur_czk * (1 - marze) * production_pct / hourly_rate)",
  production_pct: "preset_production_pct / 100",
  weekly_goal_pct:
    "MIN(FLOOR((past_hours + current_hours * (day_idx + 1) / 5) / hodiny_plan * 100), 100)",
  is_on_track: "percent >= weekly_goal_pct",
};

let formulaCache: Record<string, string> | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load formulas from formula_config table with 5-min in-memory cache.
 * NEVER throws — always returns at least FORMULA_DEFAULTS.
 */
export async function loadFormulas(
  supabaseClient: SupabaseClient
): Promise<Record<string, string>> {
  if (formulaCache && Date.now() - cacheTime < CACHE_TTL) return formulaCache;
  try {
    const { data } = await supabaseClient
      .from("formula_config")
      .select("key, expression");
    if (data && data.length > 0) {
      formulaCache = { ...FORMULA_DEFAULTS };
      for (const row of data) {
        formulaCache[row.key] = row.expression;
      }
      cacheTime = Date.now();
      return formulaCache;
    }
  } catch {
    /* fallback to defaults */
  }
  return { ...FORMULA_DEFAULTS };
}

/**
 * Evaluate a formula expression with given variable values.
 * NEVER throws — returns 0 on any error.
 */
export function evaluateFormula(
  expression: string,
  vars: Record<string, number>
): number {
  let expr = expression
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/FLOOR\(/g, "Math.floor(")
    .replace(/MIN\(/g, "Math.min(")
    .replace(/MAX\(/g, "Math.max(")
    .replace(/ROUND\(/g, "Math.round(")
    .replace(/ABS\(/g, "Math.abs(")
    .replace(/SUM\(/g, "("); // SUM( just becomes grouping

  // Sort variable names by length descending to avoid partial replacements
  const sortedKeys = Object.keys(vars).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    expr = expr.replace(new RegExp(`\\b${key}\\b`, "g"), String(vars[key]));
  }

  try {
    const result = new Function(`"use strict"; return (${expr});`)();
    return typeof result === "number" && !isNaN(result) ? result : 0;
  } catch {
    return 0;
  }
}

/**
 * Invalidate the in-memory formula cache (call after saving new formulas).
 */
export function invalidateFormulaCache() {
  formulaCache = null;
  cacheTime = 0;
}
