import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── HELPERS ────────────────────────────────────────────────────────────────

function getWeekKey(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  d.setUTCHours(0, 0, 0, 0);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}

function addWeeks(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d;
}

function parseDate(raw: any): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2]-1, +iso[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const cz = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})/);
  if (cz) {
    const d = new Date(Date.UTC(+cz[3], +cz[2]-1, +cz[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Marže: DB stores either decimal (0.15) or percent (15). Always return fraction.
function normalizeMarze(raw: any): number {
  const n = Number(raw);
  if (isNaN(n) || n <= 0) return 0.15; // default 15%
  if (n > 1) return n / 100;           // stored as 15, 22, 25
  return n;                             // already 0.15, 0.22
}

// EUR→CZK by year of order date
function getRate(orderDate: Date | null, rateByYear: Record<number, number>): number {
  const year = orderDate ? orderDate.getUTCFullYear() : new Date().getUTCFullYear();
  const years = Object.keys(rateByYear).map(Number).sort((a,b) => b-a);
  for (const y of years) {
    if (year >= y) return rateByYear[y];
  }
  return rateByYear[years[years.length-1]] ?? 25.0;
}

function toCzk(amount: number, currency: string, rate: number): number {
  if (!amount || isNaN(amount)) return 0;
  return currency?.toUpperCase() === "EUR" ? amount * rate : amount;
}

// TPV weeks estimate based on item count
function tpvWeeksEstimate(count: number): number {
  if (count <= 10) return 2;
  if (count <= 20) return 2;
  if (count <= 30) return 3;
  return 4;
}

// Montáž duration in weeks before předání deadline
function montazWeeks(count: number): number {
  if (count <= 10) return 1;
  if (count <= 20) return 1;
  if (count <= 35) return 2;
  if (count <= 50) return 3;
  if (count <= 65) return 4;
  if (count <= 80) return 5;
  return Math.ceil(count / 20);
}

// ─── HOUR ESTIMATION ────────────────────────────────────────────────────────
// Rule: all prices (TPV and prodejni_cena) are SELLING prices to customer.
// Formula: sellingBase × (1 - marze) × (vyroba_pct/100) / hodinova_sazba
//
// Priority:
//   1. TPV items have prices → use SUM(cena × pocet) as selling base
//   2. No TPV prices but project has prodejni_cena → use prodejni_cena
//   3. Neither → return MIN_HOURS with warning badge

function estimateHours(
  proj: any,
  tpvItems: any[],
  hourlyRate: number,
  vyrobaPct: number,   // fraction e.g. 0.35
  eurRate: number
): { hours: number; badge: string; base: string; sellingBase: number } {
  const currency = proj.currency || proj.mena || "CZK";
  const marze = normalizeMarze(proj.marze);

  // Filter: only active items, exclude Zrušeno
  const activeItems = tpvItems.filter(t =>
    !t.status || t.status !== "Zrušeno"
  );
  const itemsWithPrice = activeItems.filter(t => t.cena && Number(t.cena) > 0);

  let sellingBase = 0;
  let badge = "";
  let base = "";

  if (itemsWithPrice.length > 0) {
    // Level 1: sum from TPV items
    sellingBase = itemsWithPrice.reduce((sum, t) => {
      return sum + toCzk(Number(t.cena), currency, eurRate) * (Number(t.pocet) || 1);
    }, 0);
    badge = "TPV ceny";
    base = "tpv_items";
  } else {
    // Level 2: use prodejni_cena
    const pc = toCzk(Number(proj.prodejni_cena) || 0, currency, eurRate);
    if (pc <= 0) {
      return { hours: 20, badge: "⚠ Chybí podklady", base: "none", sellingBase: 0 };
    }
    sellingBase = pc;
    badge = proj.cost_preset_id ? "Rozpad" : "Výroba – odhad";
    base = "prodejni_cena";
  }

  const vyrobaNaklady = sellingBase * (1 - marze) * vyrobaPct;
  const hours = Math.max(20, Math.min(20000, Math.round(vyrobaNaklady / hourlyRate)));

  return { hours, badge, base, sellingBase };
}

// ─── DEADLINE RESOLUTION ────────────────────────────────────────────────────
function resolveDeadline(proj: any, itemCount: number): { date: Date | null; source: string } {
  // Expedice = hard deadline for production to finish
  const exp = parseDate(proj.expedice);
  if (exp) return { date: exp, source: "expedice" };

  // Montáž = need 3 days before for delivery
  const mon = parseDate(proj.montaz);
  if (mon) {
    const d = new Date(mon);
    d.setUTCDate(d.getUTCDate() - 3);
    return { date: d, source: "montaz" };
  }

  // Předání = need montazWeeks before for installation
  const pre = parseDate(proj.predani);
  if (pre) {
    const weeks = montazWeeks(itemCount);
    return { date: addWeeks(pre, -weeks), source: "predani" };
  }

  // Datum smluvní = use as-is
  const sml = parseDate(proj.datum_smluvni);
  if (sml) return { date: sml, source: "smluvni" };

  return { date: null, source: "none" };
}

// ─── TPV START ───────────────────────────────────────────────────────────────
function resolveTpvStart(proj: any, itemCount: number, today: Date): Date {
  // Explicit TPV deadline set by PM
  const tpv = parseDate(proj.datum_tpv);
  if (tpv) return tpv < today ? today : tpv;

  // Estimate from order date
  const ord = parseDate(proj.datum_objednavky);
  if (ord) {
    const est = addWeeks(ord, tpvWeeksEstimate(itemCount));
    return est < today ? today : est;
  }

  // No dates at all — delay by status
  const statusDelay: Record<string, number> = {
    "Příprava": 12, "Engineering": 8, "TPV": 4,
    "Výroba IN": 0, "Výroba": 0,
  };
  const delay = statusDelay[proj.status] ?? 6;
  return addWeeks(today, delay);
}

// ─── PRIORITY SCORE ──────────────────────────────────────────────────────────
function priorityScore(proj: any, deadline: Date | null, today: Date): number {
  let score = 0;
  const risk = proj.risk || "Low";
  if (risk === "High") score += 300;
  else if (risk === "Medium") score += 150;
  else score += 50;

  const status = proj.status || "";
  if (status === "Výroba IN" || status === "Výroba") score += 200;
  else if (status === "TPV") score += 100;
  else if (status === "Engineering") score += 50;

  if (deadline) {
    const daysLeft = Math.floor((deadline.getTime() - today.getTime()) / 86400000);
    score += Math.max(0, 500 - daysLeft);
  }
  return score;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { weeklyCapacityHours } = await req.json();
    const weeklyCapacity = Number(weeklyCapacityHours) || 760;
    const TARGET_MAX = 1.25; // 125% max per week

    const today = new Date();
    today.setUTCHours(0,0,0,0);
    const currentMonday = new Date(today);
    const dow = currentMonday.getUTCDay();
    currentMonday.setUTCDate(currentMonday.getUTCDate() + (dow === 0 ? -6 : 1 - dow));

    // 1. Fetch all data in parallel
    const [projRes, tpvRes, settingsRes, presetsRes, ratesRes, inboxRes] = await Promise.all([
      sb.from("projects")
        .select("project_id,project_name,status,risk,currency,prodejni_cena,marze,cost_preset_id,cost_production_pct,datum_objednavky,datum_tpv,expedice,montaz,predani,datum_smluvni")
        .in("status", ["Příprava","Engineering","TPV","Výroba IN","Výroba"])
        .is("deleted_at", null)
        .eq("is_test", false),
      sb.from("tpv_items")
        .select("project_id,id,cena,pocet,status")
        .is("deleted_at", null),
      sb.from("production_settings").select("hourly_rate").limit(1).single(),
      sb.from("cost_breakdown_presets").select("id,is_default,production_pct").order("sort_order"),
      sb.from("exchange_rates").select("year,eur_czk").order("year"),
      sb.from("production_inbox")
        .select("project_id,estimated_hours")
        .eq("status","pending"),
    ]);

    const projects = projRes.data || [];
    const allTpvItems = tpvRes.data || [];
    const hourlyRate = Number(settingsRes.data?.hourly_rate) || 550;
    const presets = presetsRes.data || [];
    const defaultPreset = presets.find((p:any) => p.is_default) || presets[0];
    const rateByYear: Record<number,number> = {};
    for (const r of ratesRes.data || []) rateByYear[r.year] = Number(r.eur_czk);

    // EUR rate resolver
    const getEurRate = (orderDate: Date | null) => getRate(orderDate, rateByYear);

    // Group TPV items and inbox hours by project
    const tpvByProject = new Map<string, any[]>();
    for (const item of allTpvItems) {
      if (!tpvByProject.has(item.project_id)) tpvByProject.set(item.project_id, []);
      tpvByProject.get(item.project_id)!.push(item);
    }

    const inboxHoursByProject = new Map<string, number>();
    for (const item of inboxRes.data || []) {
      inboxHoursByProject.set(item.project_id,
        (inboxHoursByProject.get(item.project_id) || 0) + (Number(item.estimated_hours) || 0)
      );
    }

    // 2. Build week keys (dynamic horizon)
    let maxDeadline = addWeeks(currentMonday, 26);
    for (const proj of projects) {
      const d = resolveDeadline(proj, (tpvByProject.get(proj.project_id) || []).length);
      if (d.date && d.date > maxDeadline) maxDeadline = addWeeks(d.date, 2);
    }
    const weekKeys: string[] = [];
    let wk = new Date(currentMonday);
    while (wk <= maxDeadline) {
      weekKeys.push(getWeekKey(wk));
      wk = addWeeks(wk, 1);
    }

    // 3. Prepare work items
    interface WorkItem {
      projectId: string;
      projectName: string;
      totalHours: number;
      tpvStart: Date;
      deadline: Date;
      deadlineSource: string;
      priority: number;
      badge: string;
      base: string;
      sellingBase: number;
      tpvCount: number;
    }

    const workItems: WorkItem[] = [];
    const safetyNetMap = new Map<string, any>();

    for (const proj of projects) {
      const projTpv = tpvByProject.get(proj.project_id) || [];
      const tpvCount = projTpv.length;
      const orderDate = parseDate(proj.datum_objednavky);
      const eurRate = getEurRate(orderDate);

      // Get vyroba_pct from preset
      const preset = proj.cost_preset_id
        ? presets.find((p:any) => p.id === proj.cost_preset_id)
        : defaultPreset;
      const vyrobaPct = (preset?.vyroba_pct ?? 35) / 100;

      const est = estimateHours(proj, projTpv, hourlyRate, vyrobaPct, eurRate);

      // Subtract hours already in inbox
      const inboxH = inboxHoursByProject.get(proj.project_id) || 0;
      const remainingHours = Math.max(20, est.hours - inboxH);

      const tpvStart = resolveTpvStart(proj, tpvCount, today);
      const dl = resolveDeadline(proj, tpvCount);

      // If no deadline, use fallback based on status
      const statusFallback: Record<string,number> = {
        "Výroba IN":4, "Výroba":4, "TPV":8, "Engineering":12, "Příprava":16
      };
      const deadline = dl.date
        ? (dl.date < tpvStart ? addWeeks(tpvStart, 2) : dl.date)
        : addWeeks(tpvStart, statusFallback[proj.status] ?? 8);

      const deadlineSource = dl.source;
      const priority = priorityScore(proj, deadline, today);

      workItems.push({
        projectId: proj.project_id,
        projectName: proj.project_name || proj.project_id,
        totalHours: remainingHours,
        tpvStart,
        deadline,
        deadlineSource,
        priority,
        badge: est.badge,
        base: est.base,
        sellingBase: est.sellingBase,
        tpvCount,
      });
    }

    // 4. Sort by priority DESC (highest = most urgent first)
    workItems.sort((a, b) => b.priority - a.priority);

    // 5. Schedule blocks into weeks
    const usage: Record<string, number> = {};
    for (const wk of weekKeys) usage[wk] = 0;

    const blocks: any[] = [];

    for (const work of workItems) {
      const tpvKey = getWeekKey(work.tpvStart);
      const dlKey = getWeekKey(work.deadline);

      const startIdx = Math.max(0, weekKeys.indexOf(tpvKey));
      let endIdx = weekKeys.indexOf(dlKey);
      if (endIdx < 0) endIdx = weekKeys.length - 1;
      if (endIdx < startIdx) endIdx = Math.min(startIdx + 4, weekKeys.length - 1);

      const availableWeeks = weekKeys.slice(startIdx, endIdx + 1);
      if (availableWeeks.length === 0) {
        safetyNetMap.set(work.projectId, {
          project_id: work.projectId,
          project_name: work.projectName,
          estimated_hours: work.totalHours,
          estimation_badge: work.badge,
        });
        continue;
      }

      let remaining = work.totalHours;
      let lastPlacedIdx = -1;

      while (remaining > 0) {
        // Find next best week: prefer consecutive to last placed
        let placed = false;

        // Try consecutive first
        if (lastPlacedIdx >= 0) {
          const nextIdx = lastPlacedIdx + 1;
          if (nextIdx < availableWeeks.length) {
            const wk = availableWeeks[nextIdx];
            const cap = weeklyCapacity * TARGET_MAX;
            const avail = cap - (usage[wk] || 0);
            if (avail > 0) {
              const alloc = Math.min(remaining, avail);
              blocks.push({
                id: `${work.projectId}-${wk}-${blocks.length}`,
                project_id: work.projectId,
                project_name: work.projectName,
                bundle_description: `${work.tpvCount} položek`,
                week: wk,
                estimated_hours: Math.round(alloc),
                tpv_item_count: work.tpvCount,
                confidence: work.base === "tpv_items" ? "high" : "medium",
                source: "project_estimate",
                deadline: work.deadline.toISOString().split("T")[0],
                deadline_source: work.deadlineSource,
                is_forecast: true,
                estimation_badge: work.badge,
              });
              usage[wk] = (usage[wk] || 0) + alloc;
              remaining -= alloc;
              lastPlacedIdx = nextIdx;
              placed = true;
            }
          }
        }

        // If not placed consecutively, find first week with capacity
        if (!placed) {
          let foundIdx = -1;
          for (let i = 0; i < availableWeeks.length; i++) {
            const wk = availableWeeks[i];
            const cap = weeklyCapacity * TARGET_MAX;
            const avail = cap - (usage[wk] || 0);
            if (avail > 0) {
              const alloc = Math.min(remaining, avail);
              blocks.push({
                id: `${work.projectId}-${wk}-${blocks.length}`,
                project_id: work.projectId,
                project_name: work.projectName,
                bundle_description: `${work.tpvCount} položek`,
                week: wk,
                estimated_hours: Math.round(alloc),
                tpv_item_count: work.tpvCount,
                confidence: work.base === "tpv_items" ? "high" : "medium",
                source: "project_estimate",
                deadline: work.deadline.toISOString().split("T")[0],
                deadline_source: work.deadlineSource,
                is_forecast: true,
                estimation_badge: work.badge,
              });
              usage[wk] = (usage[wk] || 0) + alloc;
              remaining -= alloc;
              foundIdx = i;
              placed = true;
              break;
            }
          }
          if (foundIdx >= 0) lastPlacedIdx = foundIdx;
        }

        // No week found = overflow to safety net
        if (!placed) {
          const existing = safetyNetMap.get(work.projectId);
          if (existing) {
            existing.estimated_hours += remaining;
          } else {
            safetyNetMap.set(work.projectId, {
              project_id: work.projectId,
              project_name: work.projectName,
              estimated_hours: remaining,
              estimation_badge: work.badge,
            });
          }
          break;
        }
      }
    }

    // 6. Detect overbooked weeks
    const overbookedWeeks = weekKeys
      .filter(wk => (usage[wk] || 0) > weeklyCapacity * TARGET_MAX)
      .map(wk => ({
        week: wk,
        utilizationPct: Math.round((usage[wk] / weeklyCapacity) * 100),
        hoursScheduled: Math.round(usage[wk]),
        capacity: weeklyCapacity,
        projectsInWeek: [...new Set(blocks.filter(b => b.week === wk).map(b => b.project_name))],
      }))
      .sort((a, b) => b.utilizationPct - a.utilizationPct);

    return new Response(JSON.stringify({
      blocks,
      safetyNet: Array.from(safetyNetMap.values()),
      overbookedWeeks,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("Forecast error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});