// v8 - leveling scheduler
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getWeekKey(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  d.setUTCHours(0, 0, 0, 0);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function addWeeks(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d;
}
function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
function dayKey(d: Date): string {
  return d.toISOString().split("T")[0];
}
function isWorkday(d: Date): boolean {
  const w = d.getUTCDay();
  return w !== 0 && w !== 6;
}
function lastWorkday(d: Date): Date {
  const r = new Date(d);
  r.setUTCHours(0, 0, 0, 0);
  while (!isWorkday(r)) r.setUTCDate(r.getUTCDate() - 1);
  return r;
}
function getWorkdays(start: Date, end: Date): string[] {
  const days: string[] = [];
  const d = new Date(start);
  d.setUTCHours(0, 0, 0, 0);
  const e = new Date(end);
  e.setUTCHours(0, 0, 0, 0);
  while (d <= e) {
    if (isWorkday(d)) days.push(dayKey(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}
function parseDate(raw: any): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const MONTHS: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const cz = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (cz) {
    const d = new Date(Date.UTC(+cz[3], +cz[2] - 1, +cz[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const en = s.match(/^(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{2,4})$/);
  if (en) {
    const m = MONTHS[en[2].toLowerCase()];
    const y = +en[3] < 100 ? 2000 + +en[3] : +en[3];
    if (m) {
      const d = new Date(Date.UTC(y, m - 1, +en[1]));
      return isNaN(d.getTime()) ? null : d;
    }
  }
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const y = +us[3] < 100 ? 2000 + +us[3] : +us[3];
    const d = new Date(Date.UTC(y, +us[1] - 1, +us[2]));
    return isNaN(d.getTime()) ? null : d;
  }
  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dash) {
    const y = +dash[3] < 100 ? 2000 + +dash[3] : +dash[3];
    const d = new Date(Date.UTC(y, +dash[2] - 1, +dash[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
function normalizeMarze(raw: any): number {
  const n = Number(raw);
  if (isNaN(n) || n <= 0) return 0.15;
  return n > 1 ? n / 100 : n;
}
function isoWeekFromKey(weekKey: string): { week: number; year: number } {
  const d = new Date(weekKey + "T00:00:00Z");
  const thu = new Date(d);
  thu.setUTCDate(d.getUTCDate() + (4 - (d.getUTCDay() || 7)));
  const year = thu.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((thu.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return { week, year };
}
function getWeekCapacity(weekKey: string, capacityRows: any[], defaultCap: number): number {
  const { week, year } = isoWeekFromKey(weekKey);
  const row = capacityRows.find((r) => Number(r.week_number) === week && Number(r.week_year) === year);
  return row ? Number(row.capacity_hours) : defaultCap;
}
function tpvWeeksEstimate(count: number): number {
  if (count <= 20) return 2;
  if (count <= 30) return 3;
  return 4;
}
function montazWeeks(count: number): number {
  if (count <= 20) return 1;
  if (count <= 35) return 2;
  if (count <= 50) return 3;
  if (count <= 65) return 4;
  if (count <= 80) return 5;
  return Math.ceil(count / 20);
}

function estimateHours(proj: any, tpvItems: any[], hourlyRate: number, vyrobaPct: number, eurRate: number, plannedItemCodes: Set<string>) {
  const marze = normalizeMarze(proj.marze);
  const active = tpvItems.filter((t) => t.status !== "Zrušeno");
  const withPrice = active.filter((t) => t.cena && Number(t.cena) > 0 && !plannedItemCodes.has(t.item_name));
  if (active.length > 0 && withPrice.length === 0) {
    // All priced items are already planned
    return { hours: 0, badge: "Vše naplánováno", base: "none" };
  }
  if (withPrice.length > 0) {
    let tpvSum = withPrice.reduce((s, t) => s + Number(t.cena) * (Number(t.pocet) || 1), 0);
    if (proj.currency === "EUR") tpvSum = tpvSum * eurRate;
    const hours = Math.max(20, Math.min(20000, Math.round((tpvSum * (1 - marze) * vyrobaPct) / hourlyRate)));
    return { hours, badge: "TPV ceny", base: "tpv_items" };
  }
  let pc = Number(proj.prodejni_cena) || 0;
  if (pc <= 0) return { hours: 20, badge: "⚠ Chybí podklady", base: "none" };
  if (proj.currency === "EUR") pc = pc * eurRate;
  const hours = Math.max(20, Math.min(20000, Math.round((pc * (1 - marze) * vyrobaPct) / hourlyRate)));
  return { hours, badge: "Prodejní cena – odhad", base: "prodejni_cena" };
}

function resolveDeadline(
  proj: any,
  itemCount: number,
  presetName: string,
): { date: Date | null; source: string; conflict?: string } {
  const isExWorks = presetName.toLowerCase().includes("ex-works") || presetName.toLowerCase().includes("ex works");
  const exp = parseDate(proj.expedice);
  const sml = parseDate(proj.datum_smluvni);

  // Conflict: datum_smluvni before expedice = data error
  let conflict: string | undefined;
  if (exp && sml && sml < exp) {
    conflict =
      "Konflikt datumov: datum_smluvni (" +
      sml.toISOString().substring(0, 10) +
      ") je pred expedice (" +
      exp.toISOString().substring(0, 10) +
      ")";
  }

  // expedice always wins — výroba must finish 1 day before
  if (exp) return { date: addDays(exp, -1), source: "expedice", conflict };

  const mon = parseDate(proj.montaz);
  if (mon) return { date: addDays(mon, -3), source: "montaz", conflict };

  const pre = parseDate(proj.predani);
  if (pre) {
    // Ex-Works: predani = last day of production (no assembly)
    if (isExWorks) return { date: addDays(pre, -1), source: "predani(ex-works)", conflict };
    return { date: addWeeks(pre, -montazWeeks(itemCount)), source: "predani", conflict };
  }

  if (sml) {
    // Ex-Works: datum_smluvni = last day of production
    if (isExWorks) return { date: addDays(sml, -1), source: "smluvni(ex-works)", conflict };
    return { date: sml, source: "smluvni", conflict };
  }

  return { date: null, source: "none", conflict };
}

function resolveTpvStart(proj: any, itemCount: number, today: Date, deadline: Date): Date {
  const tpv = parseDate(proj.tpv_date);
  if (tpv) {
    const r = tpv < today ? today : tpv;
    return r > deadline ? today : r;
  }
  const ord = parseDate(proj.datum_objednavky);
  if (ord) {
    const est = addWeeks(ord, tpvWeeksEstimate(itemCount));
    const r = est < today ? today : est;
    return r > deadline ? today : r;
  }
  const delays: Record<string, number> = { Příprava: 12, Engineering: 8, TPV: 4, "Výroba IN": 0, Výroba: 0 };
  const fallback = addWeeks(today, delays[proj.status] ?? 6);
  return fallback > deadline ? today : fallback;
}

function priorityScore(proj: any, tpvStart: Date, deadline: Date, today: Date): number {
  let score = 0;
  if (proj.risk === "High") score += 300;
  else if (proj.risk === "Medium") score += 150;
  else score += 50;
  if (proj.status === "Výroba IN" || proj.status === "Výroba") score += 200;
  else if (proj.status === "TPV") score += 100;
  else if (proj.status === "Engineering") score += 50;
  const window = deadline.getTime() - tpvStart.getTime();
  const elapsed = today.getTime() - tpvStart.getTime();
  score += Math.round(Math.max(0, Math.min(1, window > 0 ? elapsed / window : 1)) * 500);
  return score;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { weeklyCapacityHours } = await req.json();
    const defaultCapacity = Number(weeklyCapacityHours) || 760;
    const DAILY_CAP_RATIO = 1.0 / 5;
    const THRESHOLD = 1.15;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const currentMonday = new Date(today);
    const dow = currentMonday.getUTCDay();
    currentMonday.setUTCDate(currentMonday.getUTCDate() + (dow === 0 ? -6 : 1 - dow));

    const [projRes, tpvRes, settingsRes, presetsRes, capacityRes, ratesRes, inboxRes, schedRes] = await Promise.all([
      sb
        .from("projects")
        .select(
          "project_id,project_name,status,risk,prodejni_cena,marze,cost_preset_id,cost_production_pct,datum_objednavky,tpv_date,expedice,montaz,predani,datum_smluvni,currency",
        )
        .in("status", ["Příprava", "Engineering", "TPV", "Výroba IN", "Výroba"])
        .is("deleted_at", null)
        .eq("is_test", false),
      sb.from("tpv_items").select("project_id,item_name,cena,pocet,status").is("deleted_at", null),
      sb.from("production_settings").select("hourly_rate").limit(1).single(),
      sb.from("cost_breakdown_presets").select("id,name,is_default,production_pct").order("sort_order"),
      sb.from("production_capacity").select("week_number,week_year,capacity_hours"),
      sb.from("exchange_rates").select("year,eur_czk"),
      sb.from("production_inbox").select("project_id,item_code,estimated_hours").in("status", ["pending", "scheduled"]),
      sb.from("production_schedule").select("project_id,item_code,scheduled_hours").in("status", ["scheduled", "in_progress"]),
    ]);

    const projects = projRes.data || [];
    const hourlyRate = Number(settingsRes.data?.hourly_rate) || 550;
    const presets = presetsRes.data || [];
    const defaultPreset = presets.find((p: any) => p.is_default) || presets[0];
    const capacityRows = capacityRes.data || [];
    const rateRows = (ratesRes.data || []).sort((a: any, b: any) => b.year - a.year);
    const eurRate = rateRows[0] ? Number(rateRows[0].eur_czk) : 25.0;

    const tpvByProject = new Map<string, any[]>();
    for (const item of tpvRes.data || []) {
      if (!tpvByProject.has(item.project_id)) tpvByProject.set(item.project_id, []);
      tpvByProject.get(item.project_id)!.push(item);
    }
    const inboxByProject = new Map<string, number>();
    for (const item of inboxRes.data || [])
      inboxByProject.set(
        item.project_id,
        (inboxByProject.get(item.project_id) || 0) + (Number(item.estimated_hours) || 0),
      );

    const workItems: any[] = [];
    const safetyNetMap = new Map<string, any>();

    for (const proj of projects) {
      const projTpv = tpvByProject.get(proj.project_id) || [];
      const tpvCount = projTpv.length;
      const preset = proj.cost_preset_id ? presets.find((p: any) => p.id === proj.cost_preset_id) : defaultPreset;
      const vyrobaPct =
        ((proj.cost_production_pct ? Number(proj.cost_production_pct) : null) ?? preset?.production_pct ?? 35) / 100;
      const est = estimateHours(proj, projTpv, hourlyRate, vyrobaPct, eurRate);
      const inboxH = inboxByProject.get(proj.project_id) || 0;
      const remainingHours = Math.max(20, est.hours - inboxH);

      const hasAnyDate =
        proj.tpv_date || proj.datum_objednavky || proj.expedice || proj.montaz || proj.predani || proj.datum_smluvni;
      if (!hasAnyDate) {
        safetyNetMap.set(proj.project_id, {
          project_id: proj.project_id,
          project_name: proj.project_name,
          estimated_hours: remainingHours,
          estimation_badge: est.badge + " – chybí termíny",
        });
        continue;
      }
      const presetName =
        (proj.cost_preset_id ? presets.find((p: any) => p.id === proj.cost_preset_id)?.name : defaultPreset?.name) ??
        "";
      const dl = resolveDeadline(proj, tpvCount, presetName);
      const statusFallback: Record<string, number> = {
        "Výroba IN": 4,
        Výroba: 4,
        TPV: 8,
        Engineering: 12,
        Příprava: 16,
      };
      const rawDeadline = dl.date ?? addWeeks(today, statusFallback[proj.status] ?? 8);
      if (rawDeadline < today) {
        safetyNetMap.set(proj.project_id, {
          project_id: proj.project_id,
          project_name: proj.project_name,
          estimated_hours: remainingHours,
          estimation_badge: "⚠ Termín v minulosti" + (dl.conflict ? " | " + dl.conflict : ""),
        });
        continue;
      }
      const deadline = lastWorkday(rawDeadline);
      const tpvStart = resolveTpvStart(proj, tpvCount, today, deadline);

      workItems.push({
        projectId: proj.project_id,
        projectName: proj.project_name,
        totalHours: remainingHours,
        tpvStart,
        deadline,
        deadlineSource: dl.source,
        conflict: dl.conflict,
        priority: priorityScore(proj, tpvStart, deadline, today),
        badge: est.badge,
        base: est.base,
        tpvCount,
      });
    }

    workItems.sort((a, b) => b.priority - a.priority);

    let maxDeadline = addWeeks(currentMonday, 26);
    for (const w of workItems) if (w.deadline > maxDeadline) maxDeadline = addWeeks(w.deadline, 2);

    const allDays = getWorkdays(today, maxDeadline);
    const dayUsage: Record<string, number> = {};
    const dayAlloc: Record<string, Record<string, number>> = {};
    for (const d of allDays) {
      dayUsage[d] = 0;
      dayAlloc[d] = {};
    }

    for (const work of workItems) {
      const days = getWorkdays(work.tpvStart, work.deadline);
      if (days.length === 0) {
        safetyNetMap.set(work.projectId, {
          project_id: work.projectId,
          project_name: work.projectName,
          estimated_hours: work.totalHours,
          estimation_badge: work.badge + " – žádné pracovní dny",
        });
        continue;
      }
      const weekCap = getWeekCapacity(getWeekKey(work.tpvStart), capacityRows, defaultCapacity);
      const dailyCap = weekCap * DAILY_CAP_RATIO;
      const windowWeeks = (work.deadline.getTime() - work.tpvStart.getTime()) / (7 * 86400000);
      const isUrgent = windowWeeks <= 3;

      let rem = work.totalHours;

      if (isUrgent) {
        // URGENT (≤3w): cluster-first — fill busy days
        const hoursPerDay = Math.ceil(work.totalHours / days.length);
        const sorted = [...days].sort((a, b) => {
          const ua = dayUsage[a] || 0,
            ub = dayUsage[b] || 0;
          const sa = ua > 0 && ua < dailyCap ? ua : ua >= dailyCap ? -9999 : 0;
          const sb2 = ub > 0 && ub < dailyCap ? ub : ub >= dailyCap ? -9999 : 0;
          if (sa !== sb2) return sb2 - sa;
          return days.indexOf(a) - days.indexOf(b);
        });
        for (const d of sorted) {
          if (rem <= 0) break;
          const cur = dayUsage[d] || 0;
          const avail = Math.max(0, dailyCap - cur);
          const put = avail > 0 ? Math.min(rem, Math.max(hoursPerDay, avail)) : hoursPerDay;
          const actual = Math.min(rem, put);
          if (actual <= 0) continue;
          dayAlloc[d][work.projectId] = (dayAlloc[d][work.projectId] || 0) + actual;
          dayUsage[d] = (dayUsage[d] || 0) + actual;
          rem -= actual;
        }
      } else {
        // LEVELING: prefer days closest to target load (95% daily cap)
        // This smooths peaks across all available weeks
        const TARGET_LOAD = dailyCap * 0.95;
        const MIN_BUNDLE = 40;
        const sorted = [...days].sort((a, b) => {
          const ua = dayUsage[a] || 0,
            ub = dayUsage[b] || 0;
          const sa = ua < TARGET_LOAD ? TARGET_LOAD - ua : (ua - TARGET_LOAD) * 3;
          const sb = ub < TARGET_LOAD ? TARGET_LOAD - ub : (ub - TARGET_LOAD) * 3;
          if (Math.abs(sa - sb) > 5) return sb - sa;
          return days.indexOf(a) - days.indexOf(b);
        });
        for (let di = 0; di < sorted.length; di++) {
          if (rem <= 0) break;
          const d = sorted[di];
          const isLastDay = di === sorted.length - 1;
          const cur = dayUsage[d] || 0;
          const weekCapD = getWeekCapacity(getWeekKey(new Date(d + "T00:00:00Z")), capacityRows, defaultCapacity);
          const dailyCapD = weekCapD * DAILY_CAP_RATIO;
          const avail = Math.max(0, dailyCapD * THRESHOLD - cur);
          if (avail <= 0 && !isLastDay) continue;
          let put: number;
          if (isLastDay) {
            put = rem;
          } else if (rem <= avail) {
            put = rem;
          } else if (rem - avail < MIN_BUNDLE) {
            put = rem;
          } else {
            put = avail;
          }
          if (put <= 0) continue;
          dayAlloc[d][work.projectId] = (dayAlloc[d][work.projectId] || 0) + put;
          dayUsage[d] = (dayUsage[d] || 0) + put;
          rem -= put;
        }
      }

      // Overflow: always schedule remainder in last day (no project left behind)
      if (rem > 0) {
        const lastDay = days[days.length - 1];
        dayAlloc[lastDay][work.projectId] = (dayAlloc[lastDay][work.projectId] || 0) + rem;
        dayUsage[lastDay] = (dayUsage[lastDay] || 0) + rem;
      }
    }

    const weekHours: Record<string, number> = {};
    const weekDayWarnings: Record<string, any[]> = {};
    const weekProjHours: Record<string, Record<string, number>> = {};
    const projMeta = new Map(workItems.map((w) => [w.projectId, w]));

    for (const d of allDays) {
      const wk = getWeekKey(new Date(d + "T00:00:00Z"));
      if (!weekHours[wk]) weekHours[wk] = 0;
      if (!weekProjHours[wk]) weekProjHours[wk] = {};
      if (!weekDayWarnings[wk]) weekDayWarnings[wk] = [];
      const weekCap = getWeekCapacity(wk, capacityRows, defaultCapacity);
      const dailyCap = weekCap * DAILY_CAP_RATIO;
      const du = dayUsage[d] || 0;
      weekHours[wk] += du;
      if (du > dailyCap * 1.01) {
        const projsThisDay = Object.entries(dayAlloc[d])
          .filter(([, h]) => h > 0)
          .map(([pid, h]) => ({ name: projMeta.get(pid)?.projectName || pid, hours: Math.round(h as number) }));
        weekDayWarnings[wk].push({
          day: d,
          total: Math.round(du),
          capacity: Math.round(dailyCap),
          projects: projsThisDay,
        });
      }
      for (const [pid, h] of Object.entries(dayAlloc[d])) {
        if (h < 0.1) continue;
        weekProjHours[wk][pid] = (weekProjHours[wk][pid] || 0) + (h as number);
      }
    }

    const blocks: any[] = [];
    for (const wk of Object.keys(weekProjHours).sort()) {
      for (const [pid, h] of Object.entries(weekProjHours[wk])) {
        if (h < 0.5) continue;
        const w = projMeta.get(pid);
        if (!w) continue;
        blocks.push({
          id: `${pid}-${wk}`,
          project_id: pid,
          project_name: w.projectName,
          bundle_description: `${w.tpvCount} položek`,
          week: wk,
          estimated_hours: Math.round(h),
          tpv_item_count: w.tpvCount,
          confidence: w.base === "tpv_items" ? "high" : "medium",
          source: "project_estimate",
          deadline: w.deadline.toISOString().substring(0, 10),
          deadline_source: w.deadlineSource,
          is_forecast: true,
          estimation_badge: w.badge,
          date_conflict: w.conflict || undefined,
          day_warnings: weekDayWarnings[wk]?.length > 0 ? weekDayWarnings[wk] : undefined,
        });
      }
    }

    const overbookedWeeks = Object.keys(weekHours)
      .filter((k) => {
        const c = getWeekCapacity(k, capacityRows, defaultCapacity);
        return (weekHours[k] || 0) > c * 1.15;
      })
      .map((k) => {
        const c = getWeekCapacity(k, capacityRows, defaultCapacity);
        return {
          week: k,
          utilizationPct: Math.round(((weekHours[k] || 0) / c) * 100),
          hoursScheduled: Math.round(weekHours[k] || 0),
          capacity: c,
          projectsInWeek: [...new Set(blocks.filter((b) => b.week === k).map((b) => b.project_name))],
        };
      })
      .sort((a, b) => b.utilizationPct - a.utilizationPct);

    const ai = {
      forecastSummary: null as string | null,
      criticalWeek: null as string | null,
      weekInsights: null as any[] | null,
      generatedAt: new Date().toISOString(),
    };

    return new Response(JSON.stringify({ blocks, safetyNet: Array.from(safetyNetMap.values()), overbookedWeeks, ai }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
