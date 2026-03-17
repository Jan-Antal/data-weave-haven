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
  const s = String(raw).trim().substring(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) { const d = new Date(Date.UTC(+m[1],+m[2]-1,+m[3])); return isNaN(d.getTime())?null:d; }
  const cz = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/);
  if (cz) { const d = new Date(Date.UTC(+cz[3],+cz[2]-1,+cz[1])); return isNaN(d.getTime())?null:d; }
  return null;
}
function normalizeMarze(raw: any): number {
  const n = Number(raw); if (isNaN(n)||n<=0) return 0.15; return n>1?n/100:n;
}
function isoWeekFromKey(weekKey: string): { week: number; year: number } {
  const d = new Date(weekKey + "T00:00:00Z");
  const thu = new Date(d); thu.setUTCDate(d.getUTCDate()+(4-(d.getUTCDay()||7)));
  const year = thu.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year,0,1));
  const week = Math.ceil(((thu.getTime()-jan1.getTime())/86400000+1)/7);
  return { week, year };
}
function getWeekCapacity(weekKey: string, capacityRows: any[], defaultCap: number, clientMap?: Record<string,number>): number {
  // Prefer client-side capacity map (includes holidays, company holidays, manual overrides)
  if (clientMap && clientMap[weekKey] !== undefined) return Number(clientMap[weekKey]);
  const { week, year } = isoWeekFromKey(weekKey);
  const row = capacityRows.find(r => Number(r.week_number)===week && Number(r.week_year)===year);
  return row ? Number(row.capacity_hours) : defaultCap;
}
function tpvWeeksEstimate(count: number): number {
  if (count<=20) return 2; if (count<=30) return 3; return 4;
}
function montazWeeks(count: number): number {
  if (count<=20) return 1; if (count<=35) return 2; if (count<=50) return 3;
  if (count<=65) return 4; if (count<=80) return 5; return Math.ceil(count/20);
}
function estimateHours(proj: any, tpvItems: any[], hourlyRate: number, vyrobaPct: number, eurRate: number) {
  const marze = normalizeMarze(proj.marze);
  const active = tpvItems.filter(t => t.status !== "Zrušeno");
  const withPrice = active.filter(t => t.cena && Number(t.cena) > 0);
  if (withPrice.length > 0) {
    let tpvSum = withPrice.reduce((s,t) => s + Number(t.cena)*(Number(t.pocet)||1), 0);
    const prodejni = Number(proj.prodejni_cena) || 0;
    if (prodejni > 0 && tpvSum < prodejni * 0.15) tpvSum = tpvSum * eurRate;
    const hours = Math.max(20, Math.min(20000, Math.round(tpvSum*(1-marze)*vyrobaPct/hourlyRate)));
    return { hours, badge: "TPV ceny", base: "tpv_items" };
  }
  const pc = Number(proj.prodejni_cena) || 0;
  if (pc <= 0) return { hours: 20, badge: "⚠ Chybí podklady", base: "none" };
  const hours = Math.max(20, Math.min(20000, Math.round(pc*(1-marze)*vyrobaPct/hourlyRate)));
  return { hours, badge: proj.cost_preset_id ? "Rozpad" : "Výroba – odhad", base: "prodejni_cena" };
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
  const delays: Record<string,number> = { "Příprava":12,"Engineering":8,"TPV":4,"Výroba IN":0,"Výroba":0 };
  return addWeeks(today, delays[proj.status] ?? 6);
}
function priorityScore(proj: any, tpvStart: Date, deadline: Date, today: Date): number {
  let score = 0;
  if (proj.risk==="High") score+=300; else if (proj.risk==="Medium") score+=150; else score+=50;
  if (proj.status==="Výroba IN"||proj.status==="Výroba") score+=200;
  else if (proj.status==="TPV") score+=100;
  else if (proj.status==="Engineering") score+=50;
  const window = deadline.getTime()-tpvStart.getTime();
  const elapsed = today.getTime()-tpvStart.getTime();
  score += Math.round(Math.max(0,Math.min(1,window>0?elapsed/window:1))*500);
  return score;
}

serve(async (req) => {
  if (req.method==="OPTIONS") return new Response(null,{headers:corsHeaders});
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { weeklyCapacityHours, weeklyCapacityMap } = await req.json();
    const defaultCapacity = Number(weeklyCapacityHours)||760;
    const clientMap: Record<string,number>|undefined = weeklyCapacityMap && typeof weeklyCapacityMap === 'object' ? weeklyCapacityMap : undefined;
    const SCHEDULE_CAP = 1.15;
    const OVERBOOK_THRESHOLD = 1.10;
    const today = new Date(); today.setUTCHours(0,0,0,0);
    const currentMonday = new Date(today);
    const dow = currentMonday.getUTCDay();
    currentMonday.setUTCDate(currentMonday.getUTCDate()+(dow===0?-6:1-dow));

    const [projRes,tpvRes,settingsRes,presetsRes,capacityRes,ratesRes,inboxRes] = await Promise.all([
      sb.from("projects").select("project_id,project_name,status,risk,prodejni_cena,marze,cost_preset_id,cost_production_pct,datum_objednavky,datum_tpv,expedice,montaz,predani,datum_smluvni").in("status",["Příprava","Engineering","TPV","Výroba IN","Výroba"]).is("deleted_at",null).eq("is_test",false),
      sb.from("tpv_items").select("project_id,cena,pocet,status").is("deleted_at",null),
      sb.from("production_settings").select("hourly_rate").limit(1).single(),
      sb.from("cost_breakdown_presets").select("id,is_default,production_pct").order("sort_order"),
      sb.from("production_capacity").select("week_number,week_year,capacity_hours"),
      sb.from("exchange_rates").select("year,eur_czk"),
      sb.from("production_inbox").select("project_id,estimated_hours").eq("status","pending"),
    ]);

    const projects = projRes.data||[];
    const hourlyRate = Number(settingsRes.data?.hourly_rate)||550;
    const presets = presetsRes.data||[];
    const defaultPreset = presets.find((p:any)=>p.is_default)||presets[0];
    const capacityRows = capacityRes.data||[];
    const rateRows = (ratesRes.data||[]).sort((a:any,b:any)=>b.year-a.year);
    const eurRate = rateRows[0] ? Number(rateRows[0].eur_czk) : 25.0;

    const tpvByProject = new Map<string,any[]>();
    for (const item of tpvRes.data||[]) {
      if (!tpvByProject.has(item.project_id)) tpvByProject.set(item.project_id,[]);
      tpvByProject.get(item.project_id)!.push(item);
    }
    const inboxByProject = new Map<string,number>();
    for (const item of inboxRes.data||[])
      inboxByProject.set(item.project_id,(inboxByProject.get(item.project_id)||0)+(Number(item.estimated_hours)||0));

    const workItems: any[] = [];
    const safetyNetMap = new Map<string,any>();

    for (const proj of projects) {
      const projTpv = tpvByProject.get(proj.project_id)||[];
      const tpvCount = projTpv.length;
      const preset = proj.cost_preset_id ? presets.find((p:any)=>p.id===proj.cost_preset_id) : defaultPreset;
      const vyrobaPct = ((proj.cost_production_pct?Number(proj.cost_production_pct):null)??preset?.production_pct??35)/100;
      const est = estimateHours(proj,projTpv,hourlyRate,vyrobaPct,eurRate);
      const inboxH = inboxByProject.get(proj.project_id)||0;
      const remainingHours = Math.max(20,est.hours-inboxH);
      const hasAnyDate = proj.datum_tpv||proj.datum_objednavky||proj.expedice||proj.montaz||proj.predani||proj.datum_smluvni;
      if (!hasAnyDate) {
        safetyNetMap.set(proj.project_id,{project_id:proj.project_id,project_name:proj.project_name,estimated_hours:remainingHours,estimation_badge:est.badge+" – chybí termíny"});
        continue;
      }
      const tpvStart = resolveTpvStart(proj,tpvCount,today);
      const dl = resolveDeadline(proj,tpvCount);
      const statusFallback:Record<string,number> = {"Výroba IN":4,"Výroba":4,"TPV":8,"Engineering":12,"Příprava":16};
      const deadline = dl.date?(dl.date<tpvStart?addWeeks(tpvStart,2):dl.date):addWeeks(tpvStart,statusFallback[proj.status]??8);
      if (deadline < today) {
        safetyNetMap.set(proj.project_id,{project_id:proj.project_id,project_name:proj.project_name,estimated_hours:remainingHours,estimation_badge:"⚠ Termín v minulosti"});
        continue;
      }
      workItems.push({projectId:proj.project_id,projectName:proj.project_name,totalHours:remainingHours,tpvStart,deadline,deadlineSource:dl.source,priority:priorityScore(proj,tpvStart,deadline,today),badge:est.badge,base:est.base,tpvCount});
    }

    workItems.sort((a,b)=>b.priority-a.priority);
    let maxDeadline = addWeeks(currentMonday,26);
    for (const w of workItems) if (w.deadline>maxDeadline) maxDeadline=addWeeks(w.deadline,2);
    const weekKeys:string[] = [];
    let wk = new Date(currentMonday);
    while (wk<=maxDeadline) { weekKeys.push(getWeekKey(wk)); wk=addWeeks(wk,1); }
    const weekIndexMap = new Map<string,number>();
    weekKeys.forEach((k,i)=>weekIndexMap.set(k,i));

    const usage:Record<string,number> = {};
    for (const k of weekKeys) usage[k]=0;
    const blocks:any[] = [];

    for (const work of workItems) {
      const startIdx = weekIndexMap.get(getWeekKey(work.tpvStart))??0;
      const endIdx = weekIndexMap.get(getWeekKey(work.deadline))??weekKeys.length-1;
      const clampStart = Math.max(0,Math.min(startIdx,weekKeys.length-1));
      const clampEnd = Math.max(clampStart,Math.min(endIdx,weekKeys.length-1));
      let remaining = work.totalHours;
      let lastIdx = clampStart-1;
      while (remaining>0) {
        const searchFrom = Math.max(clampStart,lastIdx+1);
        let placed = false;
        for (let i=searchFrom; i<=clampEnd; i++) {
          const key = weekKeys[i];
          const weekCap = getWeekCapacity(key,capacityRows,defaultCapacity,clientMap);
          const currentUsage = usage[key]||0;
          const softCap = weekCap*1.0;
          const hardCap = weekCap*SCHEDULE_CAP;
          const effectiveCap = currentUsage<softCap?softCap:hardCap;
          const avail = effectiveCap-currentUsage;
          if (avail>1) {
            const alloc = Math.min(remaining,avail);
            blocks.push({id:`${work.projectId}-${key}-${blocks.length}`,project_id:work.projectId,project_name:work.projectName,bundle_description:`${work.tpvCount} položek`,week:key,estimated_hours:Math.round(alloc),tpv_item_count:work.tpvCount,confidence:work.base==="tpv_items"?"high":"medium",source:"project_estimate",deadline:work.deadline.toISOString().substring(0,10),deadline_source:work.deadlineSource,is_forecast:true,estimation_badge:work.badge});
            usage[key]=currentUsage+alloc; remaining-=alloc; lastIdx=i; placed=true; break;
          }
        }
        if (!placed) {
          const ex=safetyNetMap.get(work.projectId);
          if (ex) ex.estimated_hours+=Math.round(remaining);
          else safetyNetMap.set(work.projectId,{project_id:work.projectId,project_name:work.projectName,estimated_hours:Math.round(remaining),estimation_badge:work.badge+" – kapacita plná"});
          break;
        }
      }
    }

    const overbookedWeeks = weekKeys
      .filter(k=>{const c=getWeekCapacity(k,capacityRows,defaultCapacity,clientMap);return (usage[k]||0)>c*OVERBOOK_THRESHOLD;})
      .map(k=>{const c=getWeekCapacity(k,capacityRows,defaultCapacity,clientMap);return {week:k,utilizationPct:Math.round(((usage[k]||0)/c)*100),hoursScheduled:Math.round(usage[k]||0),capacity:c,projectsInWeek:[...new Set(blocks.filter(b=>b.week===k).map(b=>b.project_name))]};})
      .sort((a,b)=>b.utilizationPct-a.utilizationPct);

    let ai = {forecastSummary:null as string|null,criticalWeek:null as string|null,weekInsights:null as any[]|null,generatedAt:new Date().toISOString()};
    try {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (LOVABLE_API_KEY && workItems.length>0) {
        const busiestWeeks = weekKeys.map(k=>({week:k,pct:Math.round(((usage[k]||0)/getWeekCapacity(k,capacityRows,defaultCapacity,clientMap))*100)})).sort((a,b)=>b.pct-a.pct).slice(0,5).map(w=>`${w.week}:${w.pct}%`).join(",");
        const projectLines = workItems.map(w=>`${w.projectName}|${w.badge}|deadline:${w.deadline.toISOString().substring(0,10)}|${Math.round(w.totalHours)}h`).join("\n");
        const contextStr = `Kapacita:${defaultCapacity}h/tyden\nProjekty:\n${projectLines}\nSafetyNet:${Array.from(safetyNetMap.values()).map(s=>s.project_name).join(",")}\nZatizene:${busiestWeeks}`;
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${LOVABLE_API_KEY}`},body:JSON.stringify({model:"google/gemini-2.0-flash-001",max_tokens:600,messages:[{role:"system",content:"Si planvaoci asistent AMI. Vrat IBA JSON bez markdown: {forecastSummary:string cesky 2-3 vety,criticalWeek:string weekKey,weekInsights:array max 4 {week,insight 1 veta cesky}}"},{role:"user",content:contextStr}]}),signal:AbortSignal.timeout(8000)});
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const text = aiData.choices?.[0]?.message?.content||"";
          const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
          ai={...parsed,generatedAt:new Date().toISOString()};
          if (ai.weekInsights) for (const block of blocks) { const ins=(ai.weekInsights as any[]).find(w=>w.week===block.week); if(ins)(block as any).ai_insight=ins.insight; }
        }
      }
    } catch(_) {}

    return new Response(JSON.stringify({blocks,safetyNet:Array.from(safetyNetMap.values()),overbookedWeeks,ai}),{headers:{...corsHeaders,"Content-Type":"application/json"}});
  } catch(err:any) {
    return new Response(JSON.stringify({error:err.message}),{headers:{...corsHeaders,"Content-Type":"application/json"},status:500});
  }
});