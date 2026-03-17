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
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}
function addWeeks(date: Date, n: number): Date {
  const d = new Date(date); d.setUTCDate(d.getUTCDate() + n * 7); return d;
}
function addDays(date: Date, n: number): Date {
  const d = new Date(date); d.setUTCDate(d.getUTCDate() + n); return d;
}
function parseDate(raw: any): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) { const d = new Date(Date.UTC(+iso[1],+iso[2]-1,+iso[3])); return isNaN(d.getTime())?null:d; }
  const cz = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})/);
  if (cz) { const d = new Date(Date.UTC(+cz[3],+cz[2]-1,+cz[1])); return isNaN(d.getTime())?null:d; }
  const d = new Date(s); return isNaN(d.getTime())?null:d;
}
function normalizeMarze(raw: any): number {
  const n = Number(raw);
  if (isNaN(n) || n <= 0) return 0.15;
  return n > 1 ? n / 100 : n;
}
function tpvWeeksEstimate(count: number): number {
  if (count <= 20) return 2; if (count <= 30) return 3; return 4;
}
function montazWeeks(count: number): number {
  if (count <= 20) return 1; if (count <= 35) return 2; if (count <= 50) return 3;
  if (count <= 65) return 4; if (count <= 80) return 5; return Math.ceil(count / 20);
}

function estimateHours(proj: any, tpvItems: any[], hourlyRate: number, vyrobaPct: number) {
  const marze = normalizeMarze(proj.marze);
  const activeItems = tpvItems.filter(t => t.status !== "Zrušeno");
  const itemsWithPrice = activeItems.filter(t => t.cena && Number(t.cena) > 0);
  let sellingBase = 0, badge = "", base = "";
  if (itemsWithPrice.length > 0) {
    sellingBase = itemsWithPrice.reduce((s,t) => s + Number(t.cena)*(Number(t.pocet)||1), 0);
    badge = "TPV ceny"; base = "tpv_items";
  } else {
    const pc = Number(proj.prodejni_cena) || 0;
    if (pc <= 0) return { hours: 20, badge: "⚠ Chybí podklady", base: "none", sellingBase: 0 };
    sellingBase = pc;
    badge = proj.cost_preset_id ? "Rozpad" : "Výroba – odhad";
    base = "prodejni_cena";
  }
  const hours = Math.max(20, Math.min(20000, Math.round(sellingBase*(1-marze)*vyrobaPct/hourlyRate)));
  return { hours, badge, base, sellingBase };
}

function resolveDeadline(proj: any, itemCount: number): { date: Date|null; source: string } {
  const exp = parseDate(proj.expedice); if (exp) return { date: exp, source: "expedice" };
  const mon = parseDate(proj.montaz); if (mon) return { date: addDays(mon,-3), source: "montaz" };
  const pre = parseDate(proj.predani); if (pre) return { date: addWeeks(pre,-montazWeeks(itemCount)), source: "predani" };
  const sml = parseDate(proj.datum_smluvni); if (sml) return { date: sml, source: "smluvni" };
  return { date: null, source: "none" };
}

function resolveTpvStart(proj: any, itemCount: number, today: Date): Date {
  const tpv = parseDate(proj.datum_tpv);
  if (tpv) return tpv < today ? today : tpv;
  const ord = parseDate(proj.datum_objednavky);
  if (ord) { const est = addWeeks(ord, tpvWeeksEstimate(itemCount)); return est < today ? today : est; }
  const delay: Record<string,number> = { "Příprava":12,"Engineering":8,"TPV":4,"Výroba IN":0,"Výroba":0 };
  return addWeeks(today, delay[proj.status] ?? 6);
}

function priorityScore(proj: any, tpvStart: Date, deadline: Date, today: Date): number {
  let score = 0;
  if (proj.risk === "High") score += 300; else if (proj.risk === "Medium") score += 150; else score += 50;
  if (proj.status === "Výroba IN" || proj.status === "Výroba") score += 200;
  else if (proj.status === "TPV") score += 100;
  else if (proj.status === "Engineering") score += 50;
  const totalWindow = deadline.getTime() - tpvStart.getTime();
  const elapsed = today.getTime() - tpvStart.getTime();
  if (totalWindow > 0) score += Math.round(Math.max(0, Math.min(1, elapsed/totalWindow)) * 500);
  else score += 500;
  return score;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { weeklyCapacityHours } = await req.json();
    const weeklyCapacity = Number(weeklyCapacityHours) || 760;
    const TARGET_MAX = 1.10;
    const today = new Date(); today.setUTCHours(0,0,0,0);
    const currentMonday = new Date(today);
    const dow = currentMonday.getUTCDay();
    currentMonday.setUTCDate(currentMonday.getUTCDate() + (dow===0?-6:1-dow));

    const [projRes, tpvRes, settingsRes, presetsRes, inboxRes] = await Promise.all([
      sb.from("projects")
        .select("project_id,project_name,status,risk,prodejni_cena,marze,cost_preset_id,cost_production_pct,datum_objednavky,datum_tpv,expedice,montaz,predani,datum_smluvni")
        .in("status",["Příprava","Engineering","TPV","Výroba IN","Výroba"])
        .is("deleted_at",null).eq("is_test",false),
      sb.from("tpv_items").select("project_id,cena,pocet,status").is("deleted_at",null),
      sb.from("production_settings").select("hourly_rate").limit(1).single(),
      sb.from("cost_breakdown_presets").select("id,is_default,production_pct").order("sort_order"),
      sb.from("production_inbox").select("project_id,estimated_hours").eq("status","pending"),
    ]);

    const projects = projRes.data || [];
    const hourlyRate = Number(settingsRes.data?.hourly_rate) || 550;
    const presets = presetsRes.data || [];
    const defaultPreset = presets.find((p:any)=>p.is_default) || presets[0];

    const tpvByProject = new Map<string,any[]>();
    for (const item of tpvRes.data||[]) {
      if (!tpvByProject.has(item.project_id)) tpvByProject.set(item.project_id,[]);
      tpvByProject.get(item.project_id)!.push(item);
    }
    const inboxByProject = new Map<string,number>();
    for (const item of inboxRes.data||[])
      inboxByProject.set(item.project_id, (inboxByProject.get(item.project_id)||0)+(Number(item.estimated_hours)||0));

    const workItems: any[] = [];
    const safetyNetMap = new Map<string,any>();

    for (const proj of projects) {
      const projTpv = tpvByProject.get(proj.project_id)||[];
      const tpvCount = projTpv.length;
      const preset = proj.cost_preset_id ? presets.find((p:any)=>p.id===proj.cost_preset_id) : defaultPreset;
      const vyrobaPct = ((proj.cost_production_pct ? Number(proj.cost_production_pct) : null) ?? preset?.production_pct ?? 35) / 100;
      const est = estimateHours(proj, projTpv, hourlyRate, vyrobaPct);
      const remainingHours = Math.max(20, est.hours - (inboxByProject.get(proj.project_id)||0));

      const hasAnyDate = proj.datum_tpv||proj.datum_objednavky||proj.expedice||proj.montaz||proj.predani||proj.datum_smluvni;
      if (!hasAnyDate) {
        safetyNetMap.set(proj.project_id,{ project_id:proj.project_id, project_name:proj.project_name||proj.project_id, estimated_hours:remainingHours, estimation_badge:est.badge+" – chybí termíny" });
        continue;
      }

      const tpvStart = resolveTpvStart(proj, tpvCount, today);
      const dl = resolveDeadline(proj, tpvCount);
      const statusFallback: Record<string,number> = {"Výroba IN":4,"Výroba":4,"TPV":8,"Engineering":12,"Příprava":16};
      const deadline = dl.date ? (dl.date<tpvStart ? addWeeks(tpvStart,2) : dl.date) : addWeeks(tpvStart, statusFallback[proj.status]??8);

      workItems.push({
        projectId:proj.project_id, projectName:proj.project_name||proj.project_id,
        totalHours:remainingHours, tpvStart, deadline, deadlineSource:dl.source,
        priority:priorityScore(proj,tpvStart,deadline,today),
        badge:est.badge, base:est.base, tpvCount,
      });
    }

    workItems.sort((a,b)=>b.priority-a.priority);

    let maxDeadline = addWeeks(currentMonday,26);
    for (const w of workItems) if (w.deadline>maxDeadline) maxDeadline=addWeeks(w.deadline,2);
    const weekKeys: string[] = [];
    let wk = new Date(currentMonday);
    while (wk<=maxDeadline) { weekKeys.push(getWeekKey(wk)); wk=addWeeks(wk,1); }
    const weekIndexMap = new Map<string,number>();
    weekKeys.forEach((k,i)=>weekIndexMap.set(k,i));

    const usage: Record<string,number> = {};
    for (const k of weekKeys) usage[k]=0;
    const blocks: any[] = [];

    for (const work of workItems) {
      const startIdx = weekIndexMap.get(getWeekKey(work.tpvStart))??0;
      const endIdx = weekIndexMap.get(getWeekKey(work.deadline))??weekKeys.length-1;
      const clampedStart = Math.max(0,Math.min(startIdx,weekKeys.length-1));
      const clampedEnd = Math.max(clampedStart,Math.min(endIdx,weekKeys.length-1));
      let remaining = work.totalHours;
      let lastGlobalIdx = clampedStart-1;

      while (remaining>0) {
        const maxCap = weeklyCapacity*TARGET_MAX;
        let placed = false;
        const searchFrom = Math.max(clampedStart, lastGlobalIdx+1);
        for (let i=searchFrom; i<=clampedEnd; i++) {
          const weekKey = weekKeys[i];
          const avail = maxCap-(usage[weekKey]||0);
          if (avail>1) {
            const alloc = Math.min(remaining,avail);
            blocks.push({
              id:`${work.projectId}-${weekKey}-${blocks.length}`,
              project_id:work.projectId, project_name:work.projectName,
              bundle_description:`${work.tpvCount} položek`,
              week:weekKey, estimated_hours:Math.round(alloc),
              tpv_item_count:work.tpvCount,
              confidence:work.base==="tpv_items"?"high":"medium",
              source:"project_estimate",
              deadline:work.deadline.toISOString().split("T")[0],
              deadline_source:work.deadlineSource,
              is_forecast:true, estimation_badge:work.badge,
            });
            usage[weekKey]=(usage[weekKey]||0)+alloc;
            remaining-=alloc; lastGlobalIdx=i; placed=true; break;
          }
        }
        if (!placed) {
          const ex=safetyNetMap.get(work.projectId);
          if (ex) ex.estimated_hours+=Math.round(remaining);
          else safetyNetMap.set(work.projectId,{ project_id:work.projectId, project_name:work.projectName, estimated_hours:Math.round(remaining), estimation_badge:work.badge+" – kapacita plná" });
          break;
        }
      }
    }

    const overbookedWeeks = weekKeys
      .filter(k=>(usage[k]||0)>weeklyCapacity*TARGET_MAX)
      .map(k=>({ week:k, utilizationPct:Math.round((usage[k]/weeklyCapacity)*100), hoursScheduled:Math.round(usage[k]), capacity:weeklyCapacity, projectsInWeek:[...new Set(blocks.filter(b=>b.week===k).map(b=>b.project_name))] }))
      .sort((a,b)=>b.utilizationPct-a.utilizationPct);

    return new Response(JSON.stringify({ blocks, safetyNet:Array.from(safetyNetMap.values()), overbookedWeeks }),
      { headers:{...corsHeaders,"Content-Type":"application/json"} });
  } catch(err:any) {
    return new Response(JSON.stringify({error:err.message||"Unknown error"}),
      { headers:{...corsHeaders,"Content-Type":"application/json"}, status:500 });
  }
});
