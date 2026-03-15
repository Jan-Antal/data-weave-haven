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

function estimateProjectHours(proj: any, tpvCount: number, hourlyRate: number, costPresets: any[], defaultPreset: any): { hours: number; level: number; badge: string } {
  const prodejniCena = Number(proj.prodejni_cena) || 0;
  const marze = proj.marze != null ? Number(proj.marze) : null;
  const preset = proj.cost_preset_id
    ? costPresets.find((p: any) => p.id === proj.cost_preset_id)
    : defaultPreset;

  if (!preset || prodejniCena === 0) {
    return { hours: MIN_HOURS, level: 4, badge: "⚠ Chybí podklady" };
  }
  const effectiveMarze = marze ?? 15;
  const naklady = prodejniCena * (1 - effectiveMarze / 100);
  const vyrobaNaklady = naklady * (Number(preset.production_pct) / 100);
  const hours = clampHours(vyrobaNaklady / hourlyRate);
  const level = proj.cost_preset_id ? 1 : marze != null ? 2 : 3;
  const badge = level === 1 ? "Rozpad" : level === 2 ? "Výroba – odhad" : "Výroba – odhad (def. marže)";
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

    // 1. Fetch all data in parallel
    const [projectsRes, tpvRes, settingsRes, presetsRes] = await Promise.all([
      sb.from("projects")
        .select("project_id, project_name, status, risk, expedice, montaz, predani, datum_smluvni, datum_objednavky, datum_tpv, prodejni_cena, marze, cost_preset_id")
        .in("status", ["Příprava", "Engineering", "TPV", "Výroba"])
        .is("deleted_at", null)
        .eq("is_test", false)
        .not("project_id", "like", "TEST%"),
      sb.from("tpv_items")
        .select("project_id, id")
        .is("deleted_at", null),
      sb.from("production_settings").select("*").limit(1).single(),
      sb.from("cost_breakdown_presets").select("*").order("sort_order"),
    ]);

    const projects = projectsRes.data || [];
    const tpvItems = tpvRes.data || [];
    const hourlyRate = Number(settingsRes.data?.hourly_rate) || 550;
    const costPresets = presetsRes.data || [];
    const defaultPreset = costPresets.find((p: any) => p.is_default) || costPresets[0] || null;

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
      "Výroba": 4, "TPV": 8, "Engineering": 12, "Příprava": 16,
    };

    const workItems: ProjectWork[] = [];
    const safetyNet: any[] = [];

    for (const proj of projects) {
      const tpvCount = tpvCountByProject.get(proj.project_id) || 0;
      const estimation = estimateProjectHours(proj, tpvCount, hourlyRate, costPresets, defaultPreset);

      // Determine tpv_start (earliest possible production start)
      let tpvStart: Date;
      if (proj.datum_tpv) {
        const parsed = new Date(proj.datum_tpv);
        tpvStart = isNaN(parsed.getTime()) ? addWeeks(today, 2) : parsed;
      } else if (proj.datum_objednavky) {
        const parsed = new Date(proj.datum_objednavky);
        const tpvWeeks = estimateTpvWeeks(tpvCount);
        tpvStart = isNaN(parsed.getTime()) ? addWeeks(today, 2) : addWeeks(parsed, tpvWeeks);
      } else {
        tpvStart = addWeeks(today, 2);
      }
      // tpvStart must not be in the past and must be valid
      if (isNaN(tpvStart.getTime()) || tpvStart < today) tpvStart = new Date(today);

      // Determine deadline
      const deadlineStr = proj.expedice || proj.montaz || proj.predani || proj.datum_smluvni;
      let deadline: Date;
      let deadlineSource: string;
      if (deadlineStr) {
        const parsed = new Date(deadlineStr);
        if (!isNaN(parsed.getTime())) {
          deadline = parsed;
          deadlineSource = proj.expedice ? "expedice" : proj.montaz ? "montaz" : proj.predani ? "predani" : "smluvni";
        } else {
          const fbWeeks = statusFallbackWeeks[proj.status] || 8;
          deadline = addWeeks(tpvStart, fbWeeks);
          deadlineSource = "fallback";
        }
      } else {
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

    for (const work of workItems) {
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
          estimated_hours: work.totalHours,
          estimation_badge: work.estimationBadge,
        });
        continue;
      }

      const blockHours = splitIntoBlocks(work.totalHours, weeklyCapacity);
      const minBlock = Math.max(100, Math.round(work.totalHours * 0.20));

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

    // Build weekUsage for frontend compatibility
    const weekUsage: Record<string, number> = {};
    for (const wk of weekKeys) weekUsage[wk] = usage[wk] || 0;

    return new Response(JSON.stringify({ blocks, weekKeys, weekUsage, safetyNet, hourlyRate }), {
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
