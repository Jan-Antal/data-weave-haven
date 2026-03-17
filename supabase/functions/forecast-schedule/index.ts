import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIN_HOURS = 20;
const MAX_HOURS = 20000;

function clampHours(h: number): number {
  return Math.max(MIN_HOURS, Math.min(MAX_HOURS, Math.round(h)));
}

// Estimate TPV weeks based on item count
function estimateTpvWeeks(itemCount: number): number {
  if (itemCount <= 5) return 2;
  if (itemCount <= 10) return 2;
  if (itemCount <= 20) return 3;
  return 4;
}

// Estimate montaz (installation) duration in weeks based on item count
function montazWeeks(count: number): number {
  if (count <= 10) return 1;
  if (count <= 20) return 1;
  if (count <= 35) return 2;
  if (count <= 50) return 3;
  if (count <= 65) return 4;
  if (count <= 80) return 5;
  return Math.ceil(count / 20);
}

// Get week key string from a Date (Monday of that week)
function getWeekKey(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  d.setUTCHours(0, 0, 0, 0);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Add N weeks to a date
function addWeeks(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d;
}

// Robust date parser for various formats stored in DB
const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseFlexDate(raw: string | null | undefined): Date | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const d = new Date(Date.UTC(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  const czMatch = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (czMatch) {
    const d = new Date(Date.UTC(+czMatch[3], +czMatch[2] - 1, +czMatch[1]));
    return isNaN(d.getTime()) ? null : d;
  }

  const dMyMatch = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (dMyMatch) {
    const month = MONTH_MAP[dMyMatch[2].toLowerCase()];
    if (month !== undefined) {
      let year = +dMyMatch[3];
      if (year < 100) year += 2000;
      const d = new Date(Date.UTC(year, month, +dMyMatch[1]));
      return isNaN(d.getTime()) ? null : d;
    }
  }

  const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usMatch) {
    let year = +usMatch[3];
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, +usMatch[1] - 1, +usMatch[2]));
    return isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// Normalize margin: stored as decimal (0.25) or whole number (25) — detect and return as fraction (0.25)
function normalizeMarze(raw: any): number | null {
  if (raw == null || raw === "") return null;
  const num = Number(raw);
  if (isNaN(num)) return null;
  return num >= 1 ? num / 100 : num;
}

// Resolve deadline with montaz buffer logic
function resolveDeadline(proj: any, tpvCount: number): { date: Date | null; source: string } {
  // Expedice = hard deadline, no buffer needed
  if (proj.expedice) {
    const d = parseFlexDate(proj.expedice);
    if (d) return { date: d, source: "expedice" };
  }

  // Montaz = needs 3 days before for delivery
  if (proj.montaz) {
    const d = parseFlexDate(proj.montaz);
    if (d) {
      d.setUTCDate(d.getUTCDate() - 3);
      return { date: d, source: "montaz" };
    }
  }

  // Predani = needs montaz_weeks before for installation
  if (proj.predani) {
    const d = parseFlexDate(proj.predani);
    if (d) {
      const weeks = montazWeeks(tpvCount);
      d.setUTCDate(d.getUTCDate() - weeks * 7);
      return { date: d, source: "predani" };
    }
  }

  // Datum smluvni = use as-is
  if (proj.datum_smluvni) {
    const d = parseFlexDate(proj.datum_smluvni);
    if (d) return { date: d, source: "smluvni" };
  }

  return { date: null, source: "none" };
}

function estimateProjectHours(proj: any, projTpvItems: any[], hourlyRate: number, costPresets: any[], defaultPreset: any, eurCzkRate: number): { hours: number; level: number; badge: string } {
  const itemsWithPrice = projTpvItems.filter((t: any) => t.cena && Number(t.cena) > 0);

  if (itemsWithPrice.length > 0) {
    const preset = proj.cost_preset_id
      ? costPresets.find((p: any) => p.id === proj.cost_preset_id)
      : defaultPreset;
    const vyrobaPct = preset?.production_pct ?? 35;
    const marzeFraction = normalizeMarze(proj.marze) ?? 0.15;
    const currencyMultiplier = (proj.currency === "EUR") ? eurCzkRate : 1;

    let totalHours = 0;
    for (const item of itemsWithPrice) {
      // TPV cena = predajná cena (čo platí zákazník), per-item × počet, converted to CZK
      const itemCena = Number(item.cena) * (Number(item.pocet) || 1) * currencyMultiplier;
      // Výrobná cena = TPV cena × (1 - marže) × výroba_pct%
      const vyrobnaCena = itemCena * (1 - marzeFraction) * (vyrobaPct / 100);
      // Hodiny = výrobná cena / hodinová sadzba
      totalHours += vyrobnaCena / hourlyRate;
    }

    const itemsWithoutPrice = projTpvItems.filter((t: any) => !t.cena || Number(t.cena) === 0);
    if (itemsWithoutPrice.length > 0 && Number(proj.prodejni_cena) > 0) {
      const totalItems = projTpvItems.length;
      const remainingShare = itemsWithoutPrice.length / totalItems;
      const remainingCena = Number(proj.prodejni_cena) * currencyMultiplier * remainingShare;
      // Same formula: výrobná cena = cena × (1 - marže) × výroba_pct%
      const vyrobnaCena = remainingCena * (1 - marzeFraction) * (vyrobaPct / 100);
      totalHours += vyrobnaCena / hourlyRate;
    }

    return { hours: clampHours(totalHours), level: 1, badge: "TPV ceny" };
  }

  const currencyMultiplier = (proj.currency === "EUR") ? eurCzkRate : 1;
  const prodejniCena = (Number(proj.prodejni_cena) || 0) * currencyMultiplier;
  const marze = normalizeMarze(proj.marze);
  const preset = proj.cost_preset_id
    ? costPresets.find((p: any) => p.id === proj.cost_preset_id)
    : defaultPreset;

  if (!preset || prodejniCena === 0) {
    return { hours: MIN_HOURS, level: 4, badge: "⚠ Chybí podklady" };
  }
  const effectiveMarze = marze ?? 0.15;
  const naklady = prodejniCena * (1 - effectiveMarze);
  const hours = clampHours(naklady * (Number(preset.production_pct) / 100) / hourlyRate);
  const level = proj.cost_preset_id ? 2 : marze != null ? 2 : 3;
  const badge = level === 2 ? "Výroba – odhad" : "Výroba – odhad (def. marže)";
  return { hours, level, badge };
}

// Priority score — higher = schedule first
function calcPriorityScore(proj: any, deadlineDate: Date | null, today: Date): number {
  let score = 0;
  const risk = proj.risk || "Low";
  if (risk === "High") score += 300;
  else if (risk === "Medium") score += 150;
  else score += 50;

  const status = proj.status || "";
  if (status === "Výroba IN") score += 200;
  else if (status === "Výroba") score += 200;
  else if (status === "TPV") score += 100;
  else if (status === "Engineering") score += 50;

  if (deadlineDate) {
    const daysLeft = Math.floor((deadlineDate.getTime() - today.getTime()) / 86400000);
    score += Math.max(0, 500 - daysLeft);
  }
  return score;
}

// Target utilization: 100-125% of weekly capacity
const TARGET_MIN = 1.00;
const TARGET_MAX = 1.25;
const TARGET_MID = (TARGET_MIN + TARGET_MAX) / 2; // 1.125

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { mode, weeklyCapacityHours } = await req.json();
    const weeklyCapacity = Number(weeklyCapacityHours) || 760;

    // 1. Fetch all data in parallel
    const [projectsRes, tpvRes, settingsRes, presetsRes, inboxRes, ratesRes] = await Promise.all([
      sb.from("projects")
        .select("project_id, project_name, status, risk, expedice, montaz, predani, datum_smluvni, datum_objednavky, datum_tpv, prodejni_cena, marze, cost_preset_id, currency")
        .is("deleted_at", null)
        .eq("is_test", false)
        .in("status", ["Příprava", "Engineering", "TPV", "Výroba IN", "Výroba"])
        .not("project_id", "like", "TEST%"),
      sb.from("tpv_items")
        .select("project_id, id, cena, pocet, status")
        .is("deleted_at", null)
        .or("status.is.null,status.neq.Zrušeno"),
      sb.from("production_settings").select("*").limit(1).single(),
      sb.from("cost_breakdown_presets").select("*").order("sort_order"),
      sb.from("production_inbox")
        .select("id, project_id, item_name, item_code, estimated_hours, estimated_czk, stage_id, projects!production_inbox_project_id_fkey(project_name, expedice, montaz, predani, datum_smluvni)")
        .eq("status", "pending")
        .order("sent_at", { ascending: true }),
      sb.from("exchange_rates")
        .select("eur_czk, year")
        .order("year", { ascending: false })
        .limit(1)
        .single(),
    ]);

    const projects = projectsRes.data || [];
    const tpvItems = tpvRes.data || [];
    const hourlyRate = Number(settingsRes.data?.hourly_rate) || 550;
    const costPresets = presetsRes.data || [];
    const defaultPreset = costPresets.find((p: any) => p.is_default) || costPresets[0] || null;
    const inboxItems = inboxRes.data || [];
    const eurCzkRate = Number(ratesRes.data?.eur_czk) || 25;

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // 2. Count TPV items per project
    const tpvCountByProject = new Map<string, number>();
    for (const item of tpvItems) {
      tpvCountByProject.set(item.project_id, (tpvCountByProject.get(item.project_id) || 0) + 1);
    }

    // 3. Generate week keys dynamically — extend to cover the latest project deadline
    const currentMonday = new Date(today);
    const dayOfWeek = currentMonday.getUTCDay();
    const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    currentMonday.setUTCDate(currentMonday.getUTCDate() + offset);
    currentMonday.setUTCHours(0, 0, 0, 0);

    // Find the latest deadline across all active projects (using resolveDeadline with montaz buffer)
    let latestDeadline = addWeeks(currentMonday, 26); // minimum 26 weeks
    for (const proj of projects) {
      const tpvCount = tpvCountByProject.get(proj.project_id) || 0;
      const resolved = resolveDeadline(proj, tpvCount);
      if (resolved.date && resolved.date > latestDeadline) {
        latestDeadline = resolved.date;
      }
      // Also check raw dates for horizon calculation
      for (const field of [proj.expedice, proj.montaz, proj.predani, proj.datum_smluvni]) {
        if (field) {
          const parsed = parseFlexDate(field);
          if (parsed && parsed > latestDeadline) latestDeadline = parsed;
        }
      }
    }
    const endDate = addWeeks(latestDeadline, 2);
    const totalWeeks = Math.max(26, Math.ceil((endDate.getTime() - currentMonday.getTime()) / (7 * 86400000)));

    const weekKeys: string[] = [];
    for (let i = 0; i < totalWeeks; i++) {
      weekKeys.push(getWeekKey(addWeeks(currentMonday, i)));
    }
    console.log(`[Forecast] Dynamic horizon: ${totalWeeks} weeks (latest deadline: ${latestDeadline.toISOString().split("T")[0]})`);

    // 4. Build project work items
    interface ProjectWork {
      projectId: string;
      projectName: string;
      totalHours: number;
      tpvStart: Date;
      deadline: Date;
      deadlineSource: string;
      priorityScore: number;
      estimationLevel: number;
      estimationBadge: string;
      tpvCount: number;
      risk: string;
      status: string;
    }

    const statusFallbackWeeks: Record<string, number> = {
      "Výroba IN": 4, "Výroba": 4, "TPV": 8, "Engineering": 12, "Příprava": 16,
    };

    // Minimum delay for projects without dates, by status
    const statusMinDelayWeeks: Record<string, number> = {
      "Příprava": 12, "Engineering": 8, "TPV": 4, "Výroba IN": 0, "Výroba": 0,
    };

    const workItems: ProjectWork[] = [];
    const safetyNet: any[] = [];

    for (const proj of projects) {
      const tpvCount = tpvCountByProject.get(proj.project_id) || 0;
      const projTpv = tpvItems.filter((t: any) => t.project_id === proj.project_id);
      const estimation = estimateProjectHours(proj, projTpv, hourlyRate, costPresets, defaultPreset, eurCzkRate);

      // Determine tpv_start (earliest possible production start)
      let tpvStart: Date;
      if (proj.datum_tpv) {
        const parsed = parseFlexDate(proj.datum_tpv);
        tpvStart = parsed ?? addWeeks(today, 2);
      } else if (proj.datum_objednavky) {
        const parsed = parseFlexDate(proj.datum_objednavky);
        const tpvWeeks = estimateTpvWeeks(tpvCount);
        tpvStart = parsed ? addWeeks(parsed, tpvWeeks) : addWeeks(today, 2);
      } else {
        // No dates — apply status-based minimum delay
        const minDelay = statusMinDelayWeeks[proj.status] ?? 8;
        tpvStart = addWeeks(today, minDelay);
      }
      if (isNaN(tpvStart.getTime()) || tpvStart < today) tpvStart = new Date(today);

      // Resolve deadline with montaz buffer
      const resolved = resolveDeadline(proj, tpvCount);
      let deadline: Date;
      let deadlineSource: string;
      if (resolved.date) {
        deadline = resolved.date;
        deadlineSource = resolved.source;
      } else {
        const fbWeeks = statusFallbackWeeks[proj.status] || 8;
        deadline = addWeeks(tpvStart, fbWeeks);
        deadlineSource = "fallback";
      }

      // If deadline is before tpvStart, push deadline forward
      if (deadline < tpvStart) deadline = addWeeks(tpvStart, 2);

      const priorityScore = calcPriorityScore(proj, deadline, today);

      workItems.push({
        projectId: proj.project_id,
        projectName: proj.project_name || proj.project_id,
        totalHours: estimation.hours,
        tpvStart,
        deadline,
        deadlineSource,
        priorityScore,
        estimationLevel: estimation.level,
        estimationBadge: estimation.badge,
        tpvCount,
        risk: proj.risk || "Low",
        status: proj.status || "",
      });
    }

    // 5. Sort by priority DESC (highest first = tightest deadline / highest risk)
    workItems.sort((a, b) => b.priorityScore - a.priorityScore);

    // 6. Schedule blocks into weeks
    const usage: Record<string, number> = {};
    for (const wk of weekKeys) usage[wk] = 0;

    const blocks: any[] = [];

    // 6a. Schedule INBOX items first (highest priority)
    const inboxByProject = new Map<string, { items: typeof inboxItems; projectName: string; totalHours: number; deadline: Date | null; deadlineSource: string }>();
    for (const item of inboxItems) {
      const pid = item.project_id;
      if (!inboxByProject.has(pid)) {
        const projInfo = (item as any).projects;
        const projectName = projInfo?.project_name || pid;
        const tpvCount = tpvCountByProject.get(pid) || 0;
        const resolved = resolveDeadline({
          expedice: projInfo?.expedice,
          montaz: projInfo?.montaz,
          predani: projInfo?.predani,
          datum_smluvni: projInfo?.datum_smluvni,
        }, tpvCount);
        inboxByProject.set(pid, { items: [], projectName, totalHours: 0, deadline: resolved.date, deadlineSource: resolved.source });
      }
      const group = inboxByProject.get(pid)!;
      group.items.push(item);
      group.totalHours += Number(item.estimated_hours) || 0;
    }

    // Schedule inbox projects into earliest available week (respecting 125% max)
    for (const [pid, group] of inboxByProject) {
      let hoursToPlace = group.totalHours;
      let placed = false;
      for (const wk of weekKeys) {
        if (hoursToPlace <= 0) break;
        const currentUsage = usage[wk] || 0;
        const maxCap = weeklyCapacity * TARGET_MAX; // 125% cap for inbox too
        if (currentUsage >= maxCap) continue;
        const roomToMax = maxCap - currentUsage;

        const alloc = Math.min(hoursToPlace, roomToMax);
        blocks.push({
          id: `inbox-${pid}-${wk}-${blocks.length}`,
          project_id: pid,
          project_name: group.projectName,
          bundle_description: `${group.items.length} položek z Inboxu`,
          week: wk,
          estimated_hours: Math.round(alloc),
          tpv_item_count: group.items.length,
          confidence: "high" as const,
          source: "inbox_item",
          deadline: group.deadline ? group.deadline.toISOString().split("T")[0] : null,
          deadline_source: group.deadlineSource,
          is_forecast: true,
          estimation_level: 1,
          estimation_badge: "Inbox",
          inbox_item_ids: group.items.map(i => i.id),
        });
        usage[wk] = currentUsage + alloc;
        hoursToPlace -= alloc;
        placed = true;
      }
      if (!placed || hoursToPlace > 0) {
        safetyNet.push({
          project_id: pid,
          project_name: group.projectName,
          estimated_hours: Math.round(hoursToPlace),
          estimation_badge: "Inbox – neplánovatelné",
        });
      }
    }

    // 6b. Schedule project estimate blocks — FORWARD from tpvStart toward deadline
    const inboxHoursByProject = new Map<string, number>();
    for (const [pid, group] of inboxByProject) {
      inboxHoursByProject.set(pid, group.totalHours);
    }

    for (const work of workItems) {
      const inboxHours = inboxHoursByProject.get(work.projectId) || 0;
      const remainingHours = Math.max(0, work.totalHours - inboxHours);
      if (remainingHours < MIN_HOURS) continue;

      const tpvStartKey = getWeekKey(work.tpvStart);
      const deadlineKey = getWeekKey(work.deadline);

      let startIdx = weekKeys.indexOf(tpvStartKey);
      let endIdx = weekKeys.indexOf(deadlineKey);

      if (startIdx < 0) startIdx = 0;
      if (endIdx < 0 || endIdx >= weekKeys.length) endIdx = weekKeys.length - 1;

      // NEVER place before tpvStart — enforce startIdx
      if (startIdx > endIdx) {
        safetyNet.push({
          project_id: work.projectId,
          project_name: work.projectName,
          estimated_hours: remainingHours,
          estimation_badge: work.estimationBadge,
        });
        continue;
      }

      // Determine scheduling direction
      // Forward fill by default; emergency backward only if < 2 weeks remain
      const isEmergency = (endIdx - startIdx) < 2;
      const orderedWeeks = isEmergency
        ? weekKeys.slice(startIdx, endIdx + 1).reverse()
        : weekKeys.slice(startIdx, endIdx + 1); // FORWARD order

      let hoursToPlace = remainingHours;
      let lastPlacedIdx = -1; // Track continuity — index within orderedWeeks

      for (let i = 0; i < orderedWeeks.length; i++) {
        if (hoursToPlace <= 0) break;
        const wk = orderedWeeks[i];

        // Continuity enforcement: next block must be within +1 or +2 of last placed
        // (only applies after the first block has been placed)
        if (lastPlacedIdx >= 0 && !isEmergency) {
          const gap = i - lastPlacedIdx;
          // Allow gap of 1 (adjacent) or 2 (skip one week)
          // If gap > 2, only proceed if no closer week had capacity — we check ahead
          if (gap > 2) {
            // Check if any of the skipped weeks simply had no room
            let skippedHadRoom = false;
            for (let s = lastPlacedIdx + 1; s < i; s++) {
              const skippedWk = orderedWeeks[s];
              const skippedUsage = usage[skippedWk] || 0;
              const skippedRoom = Math.max(0, weeklyCapacity * TARGET_MAX - skippedUsage);
              if (skippedRoom > 0) {
                skippedHadRoom = true;
                break;
              }
            }
            // If a skipped week had room, we already skipped it (shouldn't happen in forward order)
            // Just allow it — continuity is best-effort
          }
        }

        const currentUsage = usage[wk] || 0;
        const targetCap = weeklyCapacity * TARGET_MID; // ~112.5%
        const maxCap = weeklyCapacity * TARGET_MAX;    // 125%

        const roomToTarget = Math.max(0, targetCap - currentUsage);
        const roomToMax = Math.max(0, maxCap - currentUsage);

        if (roomToMax <= 0) continue;

        const alloc = Math.min(hoursToPlace, Math.max(roomToTarget, Math.min(hoursToPlace, roomToMax)));
        if (alloc <= 0) continue;

        blocks.push({
          id: `${work.projectId}-${wk}-${blocks.length}`,
          project_id: work.projectId,
          project_name: work.projectName,
          bundle_description: `${work.tpvCount} položek`,
          week: wk,
          estimated_hours: Math.round(alloc),
          tpv_item_count: work.tpvCount,
          confidence: work.estimationLevel <= 2 ? "high" : work.estimationLevel === 3 ? "medium" : "low",
          source: "project_estimate",
          deadline: work.deadline.toISOString().split("T")[0],
          deadline_source: work.deadlineSource,
          is_forecast: true,
          estimation_level: work.estimationLevel,
          estimation_badge: work.estimationBadge,
        });
        usage[wk] = currentUsage + alloc;
        hoursToPlace -= alloc;
        lastPlacedIdx = i;
      }

      if (hoursToPlace > MIN_HOURS * 0.5) {
        safetyNet.push({
          project_id: work.projectId,
          project_name: work.projectName,
          estimated_hours: Math.round(hoursToPlace),
          estimation_badge: work.estimationBadge,
        });
      }
    }

    // Aggregate safety net entries by project_id
    const safetyNetMap = new Map<string, typeof safetyNet[0]>();
    for (const entry of safetyNet) {
      const existing = safetyNetMap.get(entry.project_id);
      if (existing) {
        existing.estimated_hours += entry.estimated_hours;
      } else {
        safetyNetMap.set(entry.project_id, { ...entry });
      }
    }
    const aggregatedSafetyNet = Array.from(safetyNetMap.values());

    // Build weekUsage for frontend + log utilization
    const weekUsage: Record<string, number> = {};
    const usedWeeks: string[] = [];
    for (const wk of weekKeys) {
      weekUsage[wk] = usage[wk] || 0;
      if (usage[wk] > 0) {
        const pct = Math.round((usage[wk] / weeklyCapacity) * 100);
        usedWeeks.push(`${wk}: ${Math.round(usage[wk])}h (${pct}%)`);
      }
    }
    console.log(`[Forecast] Utilization per week:\n${usedWeeks.join("\n")}`);
    console.log(`[Forecast] ${blocks.length} blocks, ${aggregatedSafetyNet.length} in safety net`);

    // Detect overbooked weeks (> 125% capacity)
    const overbookedWeeks: Array<{
      week: string;
      utilizationPct: number;
      hoursScheduled: number;
      capacity: number;
      projectsInWeek: string[];
    }> = [];
    for (const wk of weekKeys) {
      const used = usage[wk] || 0;
      const pct = used / weeklyCapacity;
      if (pct > TARGET_MAX) {
        const projectsInWeek = blocks
          .filter((b: any) => b.week === wk)
          .map((b: any) => b.project_name)
          .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
        overbookedWeeks.push({
          week: wk,
          utilizationPct: Math.round(pct * 100),
          hoursScheduled: Math.round(used),
          capacity: weeklyCapacity,
          projectsInWeek,
        });
      }
    }
    if (overbookedWeeks.length > 0) {
      console.log(`[Forecast] ⚠ ${overbookedWeeks.length} overbooked weeks detected`);
    }

    return new Response(JSON.stringify({ blocks, weekKeys, weekUsage, safetyNet: aggregatedSafetyNet, hourlyRate, overbookedWeeks }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Forecast error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
