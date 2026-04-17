// v9 - frontload scheduler: fills weeks left-to-right, respecting deadlines
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
function parseDate(raw: any): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const MONTHS: Record<string, number> = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) { const d = new Date(Date.UTC(+iso[1], +iso[2]-1, +iso[3])); return isNaN(d.getTime()) ? null : d; }
  const cz = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (cz) { const d = new Date(Date.UTC(+cz[3], +cz[2]-1, +cz[1])); return isNaN(d.getTime()) ? null : d; }
  const en = s.match(/^(\d{1,2})[-\/]([A-Za-z]{3})[-\/](\d{2,4})$/);
  if (en) { const m = MONTHS[en[2].toLowerCase()]; const y = +en[3] < 100 ? 2000 + +en[3] : +en[3]; if (m) { const d = new Date(Date.UTC(y, m-1, +en[1])); return isNaN(d.getTime()) ? null : d; } }
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) { const y = +us[3] < 100 ? 2000 + +us[3] : +us[3]; const d = new Date(Date.UTC(y, +us[1]-1, +us[2])); return isNaN(d.getTime()) ? null : d; }
  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dash) { const y = +dash[3] < 100 ? 2000 + +dash[3] : +dash[3]; const d = new Date(Date.UTC(y, +dash[2]-1, +dash[1])); return isNaN(d.getTime()) ? null : d; }
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
  const withPrice = active.filter((t) => t.cena && Number(t.cena) > 0 && !plannedItemCodes.has(t.item_code));
  if (active.length > 0 && withPrice.length === 0) return { hours: 0, badge: "Vše naplánováno", base: "none" };
  if (withPrice.length > 0) {
    let tpvSum = withPrice.reduce((s, t) => s + Number(t.cena) * (Number(t.pocet) || 1), 0);
    if (proj.currency === "EUR") tpvSum *= eurRate;
    const hours = Math.max(20, Math.min(20000, Math.round((tpvSum * (1 - marze) * vyrobaPct) / hourlyRate)));
    return { hours, badge: "TPV ceny", base: "tpv_items" };
  }
  let pc = Number(proj.prodejni_cena) || 0;
  if (pc <= 0) return { hours: 20, badge: "⚠ Chybí podklady", base: "none" };
  if (proj.currency === "EUR") pc *= eurRate;
  const hours = Math.max(20, Math.min(20000, Math.round((pc * (1 - marze) * vyrobaPct) / hourlyRate)));
  return { hours, badge: "Prodejní cena – odhad", base: "prodejni_cena" };
}

function resolveDeadline(proj: any, itemCount: number, presetName: string): { date: Date | null; source: string; conflict?: string } {
  const isExWorks = presetName.toLowerCase().includes("ex-works") || presetName.toLowerCase().includes("ex works");
  const exp = parseDate(proj.expedice);
  const sml = parseDate(proj.datum_smluvni);
  let conflict: string | undefined;
  if (exp && sml && sml < exp) conflict = `Konflikt: smluvní (${sml.toISOString().substring(0,10)}) před expedicí (${exp.toISOString().substring(0,10)})`;
  if (exp) return { date: addDays(exp, -1), source: "expedice", conflict };
  const mon = parseDate(proj.montaz);
  if (mon) return { date: addDays(mon, -3), source: "montaz", conflict };
  const pre = parseDate(proj.predani);
  if (pre) {
    if (isExWorks) return { date: addDays(pre, -1), source: "predani(ex-works)", conflict };
    return { date: addWeeks(pre, -montazWeeks(itemCount)), source: "predani", conflict };
  }
  if (sml) {
    if (isExWorks) return { date: addDays(sml, -1), source: "smluvni(ex-works)", conflict };
    return { date: sml, source: "smluvni", conflict };
  }
  return { date: null, source: "none", conflict };
}

// Generate sorted list of week keys from startWeek to endWeek
function generateWeekKeys(startWeek: string, endWeek: string): string[] {
  const weeks: string[] = [];
  const d = new Date(startWeek + "T00:00:00Z");
  const end = new Date(endWeek + "T00:00:00Z");
  while (d <= end) {
    weeks.push(getWeekKey(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return weeks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { weeklyCapacityHours } = await req.json();
    const defaultCapacity = Number(weeklyCapacityHours) || 760;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const currentWeekKey = getWeekKey(today);

    const [projRes, tpvRes, settingsRes, presetsRes, capacityRes, ratesRes, inboxRes, schedRes] = await Promise.all([
      sb.from("projects")
        .select("project_id,project_name,status,risk,prodejni_cena,marze,cost_preset_id,cost_production_pct,datum_objednavky,tpv_date,expedice,montaz,predani,datum_smluvni,currency")
        .in("status", ["Příprava", "Engineering", "TPV", "Výroba IN", "Výroba"])
        .is("deleted_at", null).eq("is_test", false),
      sb.from("tpv_items").select("project_id,item_code,cena,pocet,status").is("deleted_at", null),
      sb.from("production_settings").select("hourly_rate").limit(1).single(),
      sb.from("cost_breakdown_presets").select("id,name,is_default,production_pct").order("sort_order"),
      sb.from("production_capacity").select("week_number,week_year,capacity_hours"),
      sb.from("exchange_rates").select("year,eur_czk"),
      sb.from("production_inbox").select("project_id,item_code,estimated_hours").in("status", ["pending", "scheduled"]),
      sb.from("production_schedule").select("project_id,item_code,scheduled_hours,scheduled_week").in("status", ["scheduled", "in_progress"]),
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

    // Build sets of already-planned item_codes per project
    // NOTE: Inbox items are NOT yet scheduled — they should be ADDED to forecast hours, not excluded.
    // Only items already in production_schedule (truly planned) are excluded from estimation.
    const inboxItemsByProject = new Map<string, Set<string>>();
    const schedItemsByProject = new Map<string, Set<string>>();
    const inboxHoursByProject = new Map<string, number>();
    for (const row of inboxRes.data || []) {
      if (!row.item_code) continue;
      if (!inboxItemsByProject.has(row.project_id)) inboxItemsByProject.set(row.project_id, new Set());
      inboxItemsByProject.get(row.project_id)!.add(row.item_code);
      inboxHoursByProject.set(row.project_id, (inboxHoursByProject.get(row.project_id) || 0) + (Number(row.estimated_hours) || 0));
    }
    for (const row of schedRes.data || []) {
      if (!row.item_code) continue;
      if (!schedItemsByProject.has(row.project_id)) schedItemsByProject.set(row.project_id, new Set());
      schedItemsByProject.get(row.project_id)!.add(row.item_code);
    }

    // Compute already-used hours per week from existing schedule
    const usedHoursPerWeek = new Map<string, number>();
    for (const row of schedRes.data || []) {
      const wk = row.scheduled_week;
      if (!wk) continue;
      usedHoursPerWeek.set(wk, (usedHoursPerWeek.get(wk) || 0) + (Number(row.scheduled_hours) || 0));
    }

    // --- PREPARE WORK ITEMS ---
    interface WorkItem {
      projectId: string;
      projectName: string;
      totalHours: number;
      deadlineWeek: string | null; // null = no deadline
      deadline: Date | null;
      deadlineSource: string;
      conflict?: string;
      badge: string;
      base: string;
      tpvCount: number;
    }

    const workItems: WorkItem[] = [];
    const safetyNetMap = new Map<string, any>();

    for (const proj of projects) {
      const projTpv = tpvByProject.get(proj.project_id) || [];
      const tpvCount = projTpv.length;
      const preset = proj.cost_preset_id ? presets.find((p: any) => p.id === proj.cost_preset_id) : defaultPreset;
      const vyrobaPct = ((proj.cost_production_pct ? Number(proj.cost_production_pct) : null) ?? preset?.production_pct ?? 35) / 100;
      const plannedCodes = new Set([...(inboxItemsByProject.get(proj.project_id) || []), ...(schedItemsByProject.get(proj.project_id) || [])]);
      const est = estimateHours(proj, projTpv, hourlyRate, vyrobaPct, eurRate, plannedCodes);
      if (est.hours === 0) continue;

      const hasAnyDate = proj.tpv_date || proj.datum_objednavky || proj.expedice || proj.montaz || proj.predani || proj.datum_smluvni;
      if (!hasAnyDate) {
        safetyNetMap.set(proj.project_id, {
          project_id: proj.project_id, project_name: proj.project_name,
          estimated_hours: est.hours, estimation_badge: est.badge + " – chybí termíny",
          source: "no_dates",
        });
        continue;
      }

      const presetName = (proj.cost_preset_id ? presets.find((p: any) => p.id === proj.cost_preset_id)?.name : defaultPreset?.name) ?? "";
      const dl = resolveDeadline(proj, tpvCount, presetName);
      const statusFallback: Record<string, number> = { "Výroba IN": 4, Výroba: 4, TPV: 8, Engineering: 12, Příprava: 16 };
      const rawDeadline = dl.date ?? addWeeks(today, statusFallback[proj.status] ?? 8);

      if (rawDeadline < today) {
        // Past deadline — still schedule, but mark as overdue
        // We'll handle these in the scheduler with overDeadline flag
      }

      const deadline = lastWorkday(rawDeadline);
      const deadlineWeek = getWeekKey(deadline);

      workItems.push({
        projectId: proj.project_id,
        projectName: proj.project_name,
        totalHours: est.hours,
        deadlineWeek,
        deadline,
        deadlineSource: dl.source,
        conflict: dl.conflict,
        badge: est.badge,
        base: est.base,
        tpvCount,
      });
    }

    // --- STEP 2: SORT BY PRIORITY ---
    // a) Past deadline first (most urgent)
    // b) Earliest deadline
    // c) Larger projects first (tie-breaker)
    workItems.sort((a, b) => {
      const aPast = a.deadlineWeek && a.deadlineWeek < currentWeekKey ? 1 : 0;
      const bPast = b.deadlineWeek && b.deadlineWeek < currentWeekKey ? 1 : 0;
      if (aPast !== bPast) return bPast - aPast; // past deadline first

      // Earliest deadline first
      const aDeadline = a.deadlineWeek || "9999-99-99";
      const bDeadline = b.deadlineWeek || "9999-99-99";
      if (aDeadline !== bDeadline) return aDeadline < bDeadline ? -1 : 1;

      // Larger projects first
      return b.totalHours - a.totalHours;
    });

    // --- STEP 3: BUILD WEEK LIST & AVAILABLE CAPACITY ---
    let maxWeek = addWeeks(today, 30);
    for (const w of workItems) {
      if (w.deadline && w.deadline > maxWeek) maxWeek = addWeeks(w.deadline, 4);
    }
    const allWeeks = generateWeekKeys(currentWeekKey, getWeekKey(maxWeek));

    // available_hours[week] = capacity - already used
    const availableHours = new Map<string, number>();
    for (const wk of allWeeks) {
      const cap = getWeekCapacity(wk, capacityRows, defaultCapacity);
      const used = usedHoursPerWeek.get(wk) || 0;
      availableHours.set(wk, Math.max(0, cap - used));
    }

    // --- STEP 4: FRONTLOAD SCHEDULING ---
    interface ScheduledChunk {
      projectId: string;
      week: string;
      hours: number;
      overDeadline: boolean;
    }
    const scheduledChunks: ScheduledChunk[] = [];
    const projectMeta = new Map(workItems.map(w => [w.projectId, w]));

    for (const work of workItems) {
      let remaining = work.totalHours;
      let overDeadline = false;
      const isPastDeadline = work.deadlineWeek && work.deadlineWeek < currentWeekKey;

      // Phase 1: Schedule within deadline (or from current week if past deadline)
      for (const wk of allWeeks) {
        if (remaining <= 0) break;

        // If project has a future deadline and we've passed it, stop phase 1
        if (!isPastDeadline && work.deadlineWeek && wk > work.deadlineWeek) break;

        const avail = availableHours.get(wk) || 0;
        if (avail <= 0) continue;

        const slot = Math.min(remaining, avail);
        scheduledChunks.push({ projectId: work.projectId, week: wk, hours: slot, overDeadline: false });
        availableHours.set(wk, avail - slot);
        remaining -= slot;
      }

      // Phase 2: If remaining > 0, schedule after deadline (overflow)
      if (remaining > 0) {
        overDeadline = true;
        for (const wk of allWeeks) {
          if (remaining <= 0) break;
          const avail = availableHours.get(wk) || 0;
          if (avail <= 0) continue;

          const slot = Math.min(remaining, avail);
          scheduledChunks.push({ projectId: work.projectId, week: wk, hours: slot, overDeadline: true });
          availableHours.set(wk, avail - slot);
          remaining -= slot;
        }
      }

      // Phase 3: If STILL remaining (all weeks full), force into last week
      if (remaining > 0) {
        const lastWeek = allWeeks[allWeeks.length - 1];
        scheduledChunks.push({ projectId: work.projectId, week: lastWeek, hours: remaining, overDeadline: true });
      }

      // Mark all chunks for this project as overDeadline if any overflow happened
      if (overDeadline) {
        for (const chunk of scheduledChunks) {
          if (chunk.projectId === work.projectId) chunk.overDeadline = true;
        }
      }
    }

    // --- STEP 5: AGGREGATE INTO BLOCKS ---
    // Merge chunks by (projectId, week) — use "::" separator to avoid dash conflicts with project IDs
    const blockMap = new Map<string, { projectId: string; week: string; hours: number; overDeadline: boolean }>();
    for (const chunk of scheduledChunks) {
      const key = `${chunk.projectId}::${chunk.week}`;
      const existing = blockMap.get(key);
      if (existing) {
        existing.hours += chunk.hours;
        existing.overDeadline = existing.overDeadline || chunk.overDeadline;
      } else {
        blockMap.set(key, { projectId: chunk.projectId, week: chunk.week, hours: chunk.hours, overDeadline: chunk.overDeadline });
      }
    }

    const blocks: any[] = [];
    const weekTotalHours = new Map<string, number>();

    for (const [, val] of blockMap.entries()) {
      if (val.hours < 0.5) continue;
      const w = projectMeta.get(val.projectId);
      if (!w) continue;

      weekTotalHours.set(val.week, (weekTotalHours.get(val.week) || 0) + val.hours);

      const totalChunksForProject = [...blockMap.values()].filter(v => v.projectId === val.projectId).length;
      let desc = `${w.tpvCount} položek`;
      if (totalChunksForProject > 1) desc += ` (rozděleno do ${totalChunksForProject} týdnů)`;
      if (val.overDeadline) desc += " ⚠ po termínu";

      blocks.push({
        id: `${val.projectId}-${val.week}`,
        project_id: val.projectId,
        project_name: w.projectName,
        bundle_description: desc,
        week: val.week,
        estimated_hours: Math.round(val.hours),
        tpv_item_count: w.tpvCount,
        confidence: val.overDeadline ? "low" : (w.base === "tpv_items" ? "high" : "medium"),
        source: "project_estimate",
        deadline: w.deadline?.toISOString().substring(0, 10) || null,
        deadline_source: w.deadlineSource,
        is_forecast: true,
        estimation_badge: w.badge,
        date_conflict: w.conflict || undefined,
      });
    }

    // --- STEP 6: COMPUTE OVERBOOKED WEEKS ---
    const overbookedWeeks = allWeeks
      .filter(wk => {
        const cap = getWeekCapacity(wk, capacityRows, defaultCapacity);
        const used = usedHoursPerWeek.get(wk) || 0;
        const forecast = weekTotalHours.get(wk) || 0;
        return (used + forecast) > cap;
      })
      .map(wk => {
        const cap = getWeekCapacity(wk, capacityRows, defaultCapacity);
        const used = usedHoursPerWeek.get(wk) || 0;
        const forecast = weekTotalHours.get(wk) || 0;
        return {
          week: wk,
          utilizationPct: Math.round(((used + forecast) / cap) * 100),
          hoursScheduled: Math.round(used + forecast),
          capacity: cap,
          projectsInWeek: [...new Set(blocks.filter(b => b.week === wk).map(b => b.project_name))],
        };
      })
      .sort((a, b) => b.utilizationPct - a.utilizationPct);

    return new Response(JSON.stringify({
      blocks: blocks.sort((a, b) => a.week.localeCompare(b.week)),
      safetyNet: Array.from(safetyNetMap.values()),
      overbookedWeeks,
      ai: { forecastSummary: null, criticalWeek: null, weekInsights: null, generatedAt: new Date().toISOString() },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
