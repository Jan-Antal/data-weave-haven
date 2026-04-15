/**
 * Dílna — production floor dashboard showing current week's activity.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* ── helpers ─────────────────────────────────────────────────────── */

/** Format Date as YYYY-MM-DD using local timezone (avoids UTC shift). */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getISOWeekForOffset(offset: number): { year: number; week: number; monday: Date; friday: Date; weekKey: string } {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff + offset * 7);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  // ISO week number
  const jan4 = new Date(monday.getFullYear(), 0, 4);
  const daysSinceJan4 = Math.floor((monday.getTime() - jan4.getTime()) / 86400000);
  const week = Math.ceil((daysSinceJan4 + jan4.getDay() + 1) / 7);
  const weekKey = toLocalDateStr(monday);
  return { year: monday.getFullYear(), week, monday, friday, weekKey };
}

function fmtDate(d: Date) {
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

function fmtHours(n: number) {
  return Math.round(n).toLocaleString("cs-CZ");
}

function fmtTimestamp(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}. v ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ── data hook ───────────────────────────────────────────────────── */

function useDilnaData(weekOffset: number) {
  const weekInfo = useMemo(() => getISOWeekForOffset(weekOffset), [weekOffset]);
  const sundayStr = useMemo(() => {
    const sun = new Date(weekInfo.friday);
    sun.setDate(sun.getDate() + 2);
    return toLocalDateStr(sun);
  }, [weekInfo]);

  return useQuery({
    queryKey: ["dilna-dashboard", weekInfo.weekKey],
    queryFn: async () => {
      const [hoursRes, schedRes, settingsRes, projectsRes] = await Promise.all([
        supabase
          .from("production_hours_log")
          .select("ami_project_id, hodiny, created_at, datum_sync")
          .gte("datum_sync", weekInfo.weekKey)
          .lt("datum_sync", sundayStr)
          .not("cinnost_kod", "in", '("TPV","ENG","PRO")'),
        supabase
          .from("production_schedule")
          .select("project_id, scheduled_hours, status, item_name")
          .eq("scheduled_week", weekInfo.weekKey)
          .not("status", "eq", "cancelled"),
        supabase
          .from("production_settings")
          .select("weekly_capacity_hours")
          .limit(1)
          .single(),
        supabase
          .from("projects")
          .select("project_id, project_name, prodejni_cena, cost_production_pct, currency")
          .is("deleted_at", null),
      ]);

      const weeklyCapacity = Number(settingsRes.data?.weekly_capacity_hours) || 875;
      const hours = (hoursRes.data || []) as Array<{ ami_project_id: string; hodiny: number; created_at: string; datum_sync: string }>;
      const schedule = (schedRes.data || []) as Array<{ project_id: string; scheduled_hours: number; status: string; item_name: string }>;
      const projects = (projectsRes.data || []) as Array<{ project_id: string; project_name: string; prodejni_cena: number | null; cost_production_pct: number | null; currency: string | null }>;

      // Total hours this week
      const totalHoursWeek = hours.reduce((s, h) => s + Number(h.hodiny), 0);

      // Today's hours
      const today = new Date().toISOString().slice(0, 10);
      const todayHours = hours.filter(h => h.datum_sync === today).reduce((s, h) => s + Number(h.hodiny), 0);

      // Last sync
      const lastSync = hours.length > 0 ? hours.reduce((max, h) => h.created_at > max ? h.created_at : max, hours[0].created_at) : null;

      // Per-project hours this week
      const hoursByProject = new Map<string, number>();
      for (const h of hours) {
        hoursByProject.set(h.ami_project_id, (hoursByProject.get(h.ami_project_id) || 0) + Number(h.hodiny));
      }

      // Scheduled projects this week
      const scheduledProjects = new Map<string, number>();
      for (const s of schedule) {
        if (s.status === "historical") continue;
        scheduledProjects.set(s.project_id, (scheduledProjects.get(s.project_id) || 0) + Number(s.scheduled_hours));
      }

      // Project lookup
      const projMap = new Map(projects.map(p => [p.project_id, p]));

      // Build cards — one per unique project in schedule
      const cards: Array<{
        projectId: string;
        projectName: string;
        plannedHours: number;
        loggedHours: number;
        pct: number;
        valueCzk: number;
      }> = [];

      for (const [pid, plannedHours] of scheduledProjects) {
        const proj = projMap.get(pid);
        const loggedHours = hoursByProject.get(pid) || 0;
        const pct = plannedHours > 0 ? Math.round((loggedHours / plannedHours) * 100) : 0;
        const prodPct = (proj?.cost_production_pct ?? 30) / 100;
        const cena = proj?.prodejni_cena ?? 0;
        const valueCzk = cena * prodPct;

        cards.push({
          projectId: pid,
          projectName: proj?.project_name || pid,
          plannedHours,
          loggedHours,
          pct,
          valueCzk,
        });
      }

      // Sort by pct ascending (worst first)
      cards.sort((a, b) => a.pct - b.pct);

      return {
        weekInfo,
        weeklyCapacity,
        totalHoursWeek,
        todayHours,
        dailyTarget: weeklyCapacity / 5,
        lastSync,
        cards,
      };
    },
    staleTime: 60_000,
  });
}

/* ── color helpers ───────────────────────────────────────────────── */

function getBorderColor(pct: number, logged: number) {
  if (logged === 0) return "hsl(var(--border))";
  if (pct >= 80) return "#639922";
  if (pct >= 50) return "#BA7517";
  return "#E24B4A";
}

function getPillClasses(pct: number, logged: number) {
  if (logged === 0) return "bg-muted text-muted-foreground";
  if (pct >= 80) return "bg-[#639922]/15 text-[#639922]";
  if (pct >= 50) return "bg-[#BA7517]/15 text-[#BA7517]";
  return "bg-[#E24B4A]/15 text-[#E24B4A]";
}

function getBarColor(pct: number, logged: number) {
  if (logged === 0) return "bg-muted";
  if (pct >= 80) return "bg-[#639922]";
  if (pct >= 50) return "bg-[#BA7517]";
  return "bg-[#E24B4A]";
}

function getDailyDot(todayHours: number, dailyTarget: number) {
  const ratio = dailyTarget > 0 ? todayHours / dailyTarget : 0;
  if (ratio >= 1) return "bg-[#639922]";
  if (ratio >= 0.7) return "bg-[#BA7517]";
  return "bg-[#E24B4A]";
}

/* ── component ───────────────────────────────────────────────────── */

export function DilnaDashboard() {
  const [weekOffset, setWeekOffset] = useState(0);
  const { data, isLoading } = useDilnaData(weekOffset);

  if (isLoading || !data) {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="px-4 py-3 border-b bg-muted/30">
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="flex-1 p-3 grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const { weekInfo, weeklyCapacity, totalHoursWeek, todayHours, dailyTarget, lastSync, cards } = data;
  const weekPct = weeklyCapacity > 0 ? Math.min(100, Math.round((totalHoursWeek / weeklyCapacity) * 100)) : 0;
  const isCurrentWeek = weekOffset === 0;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-2.5 border-b bg-muted/30 flex items-center gap-6">
        {/* Left: week picker */}
        <div className="shrink-0 flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekOffset(o => o - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            className={cn(
              "text-sm font-bold tabular-nums px-1.5 py-0.5 rounded hover:bg-muted transition-colors",
              !isCurrentWeek && "text-primary underline underline-offset-2 cursor-pointer"
            )}
            onClick={() => setWeekOffset(0)}
            title="Zpět na aktuální týden"
          >
            T{weekInfo.week}
          </button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setWeekOffset(o => o + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground ml-1">
            {fmtDate(weekInfo.monday)} – {fmtDate(weekInfo.friday)}
          </span>
        </div>

        {/* Center: weekly progress */}
        <div className="flex-1 max-w-md">
          <p className="text-[10px] text-muted-foreground mb-0.5">Odpracováno tento týden</p>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${weekPct}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
            {fmtHours(totalHoursWeek)}h / {fmtHours(weeklyCapacity)}h
          </p>
        </div>

        {/* Right: daily target */}
        <div className="shrink-0 text-right">
          <p className="text-[10px] text-muted-foreground">Denní cíl: {fmtHours(dailyTarget)}h</p>
          <div className="flex items-center gap-1.5 justify-end mt-0.5">
            <span className={cn("w-2 h-2 rounded-full shrink-0", getDailyDot(todayHours, dailyTarget))} />
            <span className="text-xs font-medium tabular-nums">{fmtHours(todayHours)}h dnes</span>
          </div>
        </div>

        {/* Far right: sync info */}
        <div className="shrink-0 text-right border-l pl-4 border-border">
          <p className="text-[10px] text-muted-foreground">Alveno</p>
          <p className="text-[10px] text-muted-foreground">
            sync {fmtTime(lastSync)}
          </p>
        </div>
      </div>

      {/* ── PROJECT CARDS ──────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto p-3 bg-muted/10">
        {cards.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Žádné naplánované projekty tento týden
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {cards.map((card) => (
              <div
                key={card.projectId}
                className="bg-card rounded-lg border border-border/50 p-3 flex flex-col gap-1.5"
                style={{ borderLeftWidth: 3, borderLeftColor: getBorderColor(card.pct, card.loggedHours) }}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium leading-tight truncate">{card.projectName}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{card.projectId}</p>
                  </div>
                  <span className={cn(
                    "shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums",
                    getPillClasses(card.pct, card.loggedHours)
                  )}>
                    {card.pct} %
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", getBarColor(card.pct, card.loggedHours))}
                    style={{ width: `${Math.min(card.pct, 100)}%` }}
                  />
                </div>

                {/* Stats row */}
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    Hodiny <span className="font-medium text-foreground tabular-nums">{fmtHours(card.loggedHours)}h</span> / {fmtHours(card.plannedHours)}h
                  </span>
                  {card.valueCzk > 0 && (
                    <span>
                      Hodnota <span className="font-medium text-foreground tabular-nums">
                        {(card.valueCzk / 1_000_000).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} M Kč
                      </span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-2 border-t bg-muted/30 flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#639922]" /> ≥ 80 %</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#BA7517]" /> 50–79 %</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#E24B4A]" /> pod 50 %</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-muted border border-border" /> žádné hodiny</span>
        </div>
        <span>
          Data z Alvena · aktualizováno {fmtTimestamp(lastSync)}
        </span>
      </div>
    </div>
  );
}
