import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MIN_HOURS = 20;
const MAX_HOURS = 2000;

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

  // 1. ISO: "2026-05-04" or "2026-03-19"
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const d = new Date(Date.UTC(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  // 2. Czech: "25. 3. 2026" or "4. 5. 2026" or "30. 1. 2026"
  const czMatch = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (czMatch) {
    const d = new Date(Date.UTC(+czMatch[3], +czMatch[2] - 1, +czMatch[1]));
    return isNaN(d.getTime()) ? null : d;
  }

  // 3. DD-Mon-YY: "02-Mar-26", "10-Nov-25"
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

  // 4. US slash: "1/23/26" or "2/16/26" (M/D/YY)
  const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (usMatch) {
    let year = +usMatch[3];
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, +usMatch[1] - 1, +usMatch[2]));
    return isNaN(d.getTime()) ? null : d;
  }

  // 5. Fallback: try native parser
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// Normalize margin: stored as decimal (0.25) or whole number (25) — detect and return as fraction (0.25)
function normalizeMarze(raw: any): number | null {
  if (raw == null || raw === "") return null;
  const num = Number(raw);
  if (isNaN(num)) return null;
  // If value is >= 1, it's a whole-number percentage (e.g. 25 → 0.25)
  // If value is < 1 (e.g. 0.25), it's already a decimal fraction
  return num >= 1 ? num / 100 : num;
}

function estimateProjectHours(proj: any, projTpvItems: any[], hourlyRate: number, costPresets: any[], defaultPreset: any, eurCzkRate: number): { hours: number; level: number; badge: string } {
  // LEVEL 1 — sum from TPV items that have cena set
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
      const itemCena = Number(item.cena) * (Number(item.pocet) || 1);
      const naklady = itemCena * (1 - marzeFraction);
      totalHours += naklady * (vyrobaPct / 100) / hourlyRate;
    }

    // If only some items have price, add estimate for the rest
    const itemsWithoutPrice = projTpvItems.filter((t: any) => !t.cena || Number(t.cena) === 0);
    if (itemsWithoutPrice.length > 0 && Number(proj.prodejni_cena) > 0) {
      const totalItems = projTpvItems.length;
      const remainingShare = itemsWithoutPrice.length / totalItems;
      const remainingCena = Number(proj.prodejni_cena) * currencyMultiplier * remainingShare;
      const naklady = remainingCena * (1 - marzeFraction);
      totalHours += naklady * (vyrobaPct / 100) / hourlyRate;
    }

    return { hours: clampHours(totalHours), level: 1, badge: "TPV ceny" };
  }

  // LEVEL 2 — project price + preset
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
  if (status === "Výroba") score += 200;
  else if (status === "TPV") score += 100;
  else if (status === "Engineering") score += 50;

  if (deadlineDate) {
    const daysLeft = Math.floor((deadlineDate.getTime() - today.getTime()) / 86400000);
    score += Math.max(0, 500 - daysLeft);
  }
  return score;
}

// Split hours into meaningful blocks (continuity rule)
function splitIntoBlocks(totalHours: number, weeklyCapacity: number): number[] {
  const minBlock = Math.max(100, Math.round(totalHours * 0.20));
  if (totalHours <= weeklyCapacity * 1.1) return [totalHours];
  if (totalHours <= weeklyCapacity * 2.2) {
    const half = Math.round(totalHours / 2);
    return [half, totalHours - half];
  }
  const n = Math.floor(totalHours / minBlock);
  const blockSize = Math.round(totalHours / n);
  const blocks: number[] = [];
  let remaining = totalHours;
  for (let i = 0; i < n - 1; i++) {
    blocks.push(blockSize);
    remaining -= blockSize;
  }
  blocks.push(remaining);
  return blocks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const { mode, weeklyCapacityHours } = await req.json();
    const weeklyCapacity = Number(weeklyCapacityHours) || 760;

    // 1. Fetch all data in parallel (including inbox items)
    const [projectsRes, tpvRes, settingsRes, presetsRes, inboxRes, ratesRes] = await Promise.all([
      sb.from("projects")
        .select("project_id, project_name, status, risk, expedice, montaz, predani, datum_smluvni, datum_objednavky, datum_tpv, prodejni_cena, marze, cost_preset_id, currency")
        .is("deleted_at", null)
        .eq("is_test", false)
        .not("status", "in", '("Fakturace","Dokončeno")')
        .not("project_id", "like", "TEST%"),
      sb.from("tpv_items")
        .select("project_id, id, cena, pocet, status")
        .is("deleted_at", null),
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

    // 2. Generate week keys (current + 26 weeks ahead)
    const currentMonday = new Date(today);
    const dayOfWeek = currentMonday.getUTCDay();
    const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    currentMonday.setUTCDate(currentMonday.getUTCDate() + offset);
    currentMonday.setUTCHours(0, 0, 0, 0);

    const weekKeys: string[] = [];
    for (let i = 0; i < 26; i++) {
      weekKeys.push(getWeekKey(addWeeks(currentMonday, i)));
    }

    // 3. Count TPV items per project
    const tpvCountByProject = new Map<string, number>();
    for (const item of tpvItems) {
      tpvCountByProject.set(item.project_id, (tpvCountByProject.get(item.project_id) || 0) + 1);
    }

    // 4. Build project work items with priority
    interface ProjectWork {
      projectId: string;
      projectName: string;
      totalHours: number;
      tpvStart: Date;
      deadline: Date;
      deadlineSource: string;
      priorityScore: number;
      fillForward: boolean;
      estimationLevel: number;
      estimationBadge: string;
      tpvCount: number;
    }

    const statusFallbackWeeks: Record<string, number> = {
      "Výroba IN": 4, "Výroba": 4, "Expedice": 2, "Montáž": 3, "TPV": 8, "Engineering": 12, "Příprava": 16, "On Hold": 12, "Reklamace": 4, "VaN": 8,
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
        tpvStart = addWeeks(today, 2);
      }
      // tpvStart must not be in the past and must be valid
      if (isNaN(tpvStart.getTime()) || tpvStart < today) tpvStart = new Date(today);

      // Determine deadline — use parseFlexDate for robust parsing
      const deadlineFields = [
        { val: proj.expedice, src: "expedice" },
        { val: proj.montaz, src: "montaz" },
        { val: proj.predani, src: "predani" },
        { val: proj.datum_smluvni, src: "smluvni" },
      ];
      let deadline: Date;
      let deadlineSource: string;
      let foundDeadline = false;
      for (const f of deadlineFields) {
        if (f.val) {
          const parsed = parseFlexDate(f.val);
          if (parsed) {
            deadline = parsed;
            deadlineSource = f.src;
            foundDeadline = true;
            break;
          }
        }
      }
      if (!foundDeadline) {
        const fbWeeks = statusFallbackWeeks[proj.status] || 8;
        deadline = addWeeks(tpvStart, fbWeeks);
        deadlineSource = "fallback";
      }

      // If deadline is before tpvStart, push deadline forward
      if (deadline < tpvStart) deadline = addWeeks(tpvStart, 2);

      const priorityScore = calcPriorityScore(proj, deadline, today);
      const weeksUntilDeadline = Math.floor((deadline.getTime() - today.getTime()) / (7 * 86400000));
      const fillForward = weeksUntilDeadline > 6;

      workItems.push({
        projectId: proj.project_id,
        projectName: proj.project_name || proj.project_id,
        totalHours: estimation.hours,
        tpvStart,
        deadline,
        deadlineSource,
        priorityScore,
        fillForward,
        estimationLevel: estimation.level,
        estimationBadge: estimation.badge,
        tpvCount,
      });
    }

    // 5. Sort by priority DESC (highest first = tightest deadline / highest risk)
    workItems.sort((a, b) => b.priorityScore - a.priorityScore);

    // 6. Schedule blocks into weeks
    const usage: Record<string, number> = {};
    for (const wk of weekKeys) usage[wk] = 0;

    const blocks: any[] = [];

    // 6a. Schedule INBOX items first (highest priority — real items waiting to be planned)
    // Group inbox items by project
    const inboxByProject = new Map<string, { items: typeof inboxItems; projectName: string; totalHours: number; deadline: Date | null; deadlineSource: string }>();
    for (const item of inboxItems) {
      const pid = item.project_id;
      if (!inboxByProject.has(pid)) {
        const projInfo = (item as any).projects;
        const projectName = projInfo?.project_name || pid;
        // Get deadline from project — use robust parser
        const deadlineFields = [
          { val: projInfo?.expedice, src: "expedice" },
          { val: projInfo?.montaz, src: "montaz" },
          { val: projInfo?.predani, src: "predani" },
          { val: projInfo?.datum_smluvni, src: "smluvni" },
        ];
        let deadline: Date | null = null;
        let deadlineSource = "none";
        for (const f of deadlineFields) {
          if (f.val) {
            const parsed = parseFlexDate(f.val);
            if (parsed) {
              deadline = parsed;
              deadlineSource = f.src;
              break;
            }
          }
        }
        inboxByProject.set(pid, { items: [], projectName, totalHours: 0, deadline, deadlineSource });
      }
      const group = inboxByProject.get(pid)!;
      group.items.push(item);
      group.totalHours += Number(item.estimated_hours) || 0;
    }

    // Schedule inbox projects into the current week (or earliest available)
    for (const [pid, group] of inboxByProject) {
      const currentWeekKey = weekKeys[0];
      // Try to fit in current week, then next weeks
      let placed = false;
      for (const wk of weekKeys) {
        const avail = weeklyCapacity - (usage[wk] || 0);
        if (avail >= Math.min(group.totalHours * 0.5, 50)) {
          const alloc = Math.min(group.totalHours, avail);
          blocks.push({
            id: `inbox-${pid}-${wk}-${blocks.length}`,
            project_id: pid,
            project_name: group.projectName,
            bundle_description: `${group.items.length} položek z Inboxu`,
            week: wk,
            estimated_hours: alloc,
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
          usage[wk] = (usage[wk] || 0) + alloc;
          placed = true;

          // If not all hours fit, schedule remainder in next week
          const remaining = group.totalHours - alloc;
          if (remaining > 0) {
            const nextWkIdx = weekKeys.indexOf(wk) + 1;
            if (nextWkIdx < weekKeys.length) {
              const nextWk = weekKeys[nextWkIdx];
              blocks.push({
                id: `inbox-${pid}-${nextWk}-${blocks.length}`,
                project_id: pid,
                project_name: group.projectName,
                bundle_description: `${group.items.length} položek z Inboxu (pokr.)`,
                week: nextWk,
                estimated_hours: remaining,
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
              usage[nextWk] = (usage[nextWk] || 0) + remaining;
            }
          }
          break;
        }
      }
      if (!placed) {
        safetyNet.push({
          project_id: pid,
          project_name: group.projectName,
          estimated_hours: group.totalHours,
          estimation_badge: "Inbox – neplánovatelné",
        });
      }
    }

    // 6b. Schedule project estimate blocks
    // Calculate inbox hours already attributed per project to avoid double-counting
    const inboxHoursByProject = new Map<string, number>();
    for (const [pid, group] of inboxByProject) {
      inboxHoursByProject.set(pid, group.totalHours);
    }

    for (const work of workItems) {
      // Subtract hours already scheduled from inbox to avoid double-counting
      const inboxHours = inboxHoursByProject.get(work.projectId) || 0;
      const remainingHours = Math.max(0, work.totalHours - inboxHours);
      
      // Skip if inbox already covers the full estimate
      if (remainingHours < MIN_HOURS) continue;

      const tpvStartKey = getWeekKey(work.tpvStart);
      const deadlineKey = getWeekKey(work.deadline);

      const startIdx = Math.max(0, weekKeys.indexOf(tpvStartKey));
      const endIdx = weekKeys.indexOf(deadlineKey) >= 0
        ? weekKeys.indexOf(deadlineKey)
        : weekKeys.length - 1;

      if (startIdx > endIdx) {
        safetyNet.push({
          project_id: work.projectId,
          project_name: work.projectName,
          estimated_hours: remainingHours,
          estimation_badge: work.estimationBadge,
        });
        continue;
      }

      const blockHours = splitIntoBlocks(remainingHours, weeklyCapacity);
      const minBlock = Math.max(100, Math.round(remainingHours * 0.20));

      let scheduled = 0;
      const weekRange = weekKeys.slice(startIdx, endIdx + 1);
      const orderedWeeks = work.fillForward ? weekRange : [...weekRange].reverse();

      for (const blockH of blockHours) {
        let placed = false;
        for (const wk of orderedWeeks) {
          const avail = weeklyCapacity - (usage[wk] || 0);
          if (avail >= Math.min(minBlock, blockH * 0.8)) {
            const alloc = Math.min(blockH, avail);
            blocks.push({
              id: `${work.projectId}-${wk}-${blocks.length}`,
              project_id: work.projectId,
              project_name: work.projectName,
              bundle_description: `${work.tpvCount} položek`,
              week: wk,
              estimated_hours: alloc,
              tpv_item_count: work.tpvCount,
              confidence: work.estimationLevel <= 2 ? "high" : work.estimationLevel === 3 ? "medium" : "low",
              source: "project_estimate",
              deadline: work.deadline.toISOString().split("T")[0],
              deadline_source: work.deadlineSource,
              is_forecast: true,
              estimation_level: work.estimationLevel,
              estimation_badge: work.estimationBadge,
            });
            usage[wk] = (usage[wk] || 0) + alloc;
            scheduled += alloc;
            placed = true;
            break;
          }
        }
        if (!placed) {
          safetyNet.push({
            project_id: work.projectId,
            project_name: work.projectName,
            estimated_hours: blockH,
            estimation_badge: work.estimationBadge,
          });
        }
      }
    }

    // Aggregate safety net entries by project_id (splitIntoBlocks may create multiple entries for the same project)
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

    // Build weekUsage for frontend compatibility
    const weekUsage: Record<string, number> = {};
    for (const wk of weekKeys) weekUsage[wk] = usage[wk] || 0;

    return new Response(JSON.stringify({ blocks, weekKeys, weekUsage, safetyNet: aggregatedSafetyNet, hourlyRate }), {
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
