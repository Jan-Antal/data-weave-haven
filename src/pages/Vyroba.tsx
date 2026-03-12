import { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProductionSchedule, getISOWeekNumber, type ScheduleBundle } from "@/hooks/useProductionSchedule";
import { useProductionDailyLogs, saveDailyLog, type DailyLog } from "@/hooks/useProductionDailyLogs";
import { useAllTPVItems } from "@/hooks/useAllTPVItems";
import { getProjectColor } from "@/lib/projectColors";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ClipboardList, AlertTriangle, User, UserCog, Settings, LogOut, LayoutDashboard, CalendarRange } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AccountSettings } from "@/components/AccountSettings";

/* ═══ helpers ═══ */
function getMonday(d: Date): Date {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function addWeeks(d: Date, n: number): Date {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n * 7);
  return dt;
}

function fmtDate(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function weekKeyStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

const DAY_NAMES = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek"];
const DAY_SHORT = ["Po", "Út", "St", "Čt", "Pá"];

const PHASES = [
  { name: "Řezání", color: "#f59e0b" },
  { name: "Lepení", color: "#3b82f6" },
  { name: "Lakování", color: "#8b5cf6" },
  { name: "Montáž", color: "#10b981" },
  { name: "Expedice", color: "#16a34a" },
];

type RoleView = "manager" | "management";

interface VyrobaBundle {
  bundleId: string;
  projectId: string;
  projectName: string;
  totalHours: number;
  items: { id: string; item_name: string; item_code: string | null }[];
  color: string;
  spillFrom?: boolean;
}

/* ═══ MAIN PAGE ═══ */
export default function Vyroba() {
  const { isOwner, loading, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);

  // Owner-only guard
  useEffect(() => {
    if (!loading && !isOwner) navigate("/", { replace: true });
  }, [loading, isOwner, navigate]);

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0);
  const currentMonday = useMemo(() => addWeeks(getMonday(new Date()), weekOffset), [weekOffset]);
  const weekKey = weekKeyStr(currentMonday);
  const weekNum = getISOWeekNumber(currentMonday);
  const friday = addWeeks(currentMonday, 0);
  friday.setDate(friday.getDate() + 4);

  // Role view toggle
  const [roleView, setRoleView] = useState<RoleView>("manager");

  // Data
  const { data: scheduleData } = useProductionSchedule();
  const { data: dailyLogsMap } = useProductionDailyLogs(weekKey);
  const { itemsByProject } = useAllTPVItems();

  // Build bundles from schedule
  const bundles = useMemo<VyrobaBundle[]>(() => {
    if (!scheduleData) return [];
    const silo = scheduleData.get(weekKey);
    if (!silo) return [];
    return silo.bundles.map((b) => ({
      bundleId: `${b.project_id}::${weekKey}`,
      projectId: b.project_id,
      projectName: b.project_name,
      totalHours: b.total_hours,
      items: b.items.map((i) => ({ id: i.id, item_name: i.item_name, item_code: i.item_code })),
      color: getProjectColor(b.project_id),
    }));
  }, [scheduleData, weekKey]);

  // Today info
  const todayDayIndex = useMemo(() => {
    const now = new Date();
    const todayMonday = getMonday(now);
    if (weekKeyStr(todayMonday) !== weekKey) return -1; // not current week
    return (now.getDay() + 6) % 7; // 0=Mon
  }, [weekKey]);

  // Selection
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const selectedBundle = bundles.find((b) => b.bundleId === selectedBundleId) || null;

  // Auto-select first bundle
  useEffect(() => {
    if (bundles.length > 0 && !bundles.find((b) => b.bundleId === selectedBundleId)) {
      setSelectedBundleId(bundles[0].bundleId);
    }
  }, [bundles, selectedBundleId]);

  // Log modal state
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logPhase, setLogPhase] = useState<string>("Řezání");
  const [logPercent, setLogPercent] = useState(0);

  // Items expand state per bundle
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  /* ── helpers for a bundle ── */
  function getLogsForBundle(bundleId: string): DailyLog[] {
    return dailyLogsMap?.get(bundleId) || [];
  }

  function getLatestPercent(bundleId: string): number {
    const logs = getLogsForBundle(bundleId);
    if (logs.length === 0) return 0;
    return Math.max(...logs.map((l) => l.percent));
  }

  function getLatestPhase(bundleId: string): string | null {
    const logs = getLogsForBundle(bundleId);
    if (logs.length === 0) return null;
    const sorted = [...logs].sort((a, b) => b.day_index - a.day_index);
    return sorted[0].phase;
  }

  function getCumulativeForDay(bundleId: string, dayIndex: number): { percent: number; phase: string | null; isCarryForward: boolean; hasLog: boolean } | null {
    const logs = getLogsForBundle(bundleId);
    // Find exact log for this day
    const exact = logs.find((l) => l.day_index === dayIndex);
    if (exact) return { percent: exact.percent, phase: exact.phase, isCarryForward: false, hasLog: true };
    // Carry forward from previous day
    const prev = logs.filter((l) => l.day_index < dayIndex).sort((a, b) => b.day_index - a.day_index);
    if (prev.length > 0) return { percent: prev[0].percent, phase: prev[0].phase, isCarryForward: true, hasLog: false };
    return null;
  }

  function getExpectedPct(dayIndex: number): number {
    return Math.round(((dayIndex + 1) / 5) * 100);
  }

  function isBehind(bundleId: string): boolean {
    const latest = getLatestPercent(bundleId);
    if (todayDayIndex < 0) return false;
    return latest < getExpectedPct(todayDayIndex) - 15;
  }

  function getDaysLogged(bundleId: string): number {
    return getLogsForBundle(bundleId).length;
  }

  /* ── Stats ── */
  const stats = useMemo(() => {
    const total = bundles.length;
    const avgPct = total > 0 ? Math.round(bundles.reduce((s, b) => s + getLatestPercent(b.bundleId), 0) / total) : 0;
    const onTrack = bundles.filter((b) => !isBehind(b.bundleId)).length;
    const behind = bundles.filter((b) => isBehind(b.bundleId)).length;
    const todayLogged = todayDayIndex >= 0 ? bundles.filter((b) => getLogsForBundle(b.bundleId).some((l) => l.day_index === todayDayIndex)).length : 0;
    return { total, avgPct, onTrack, behind, todayLogged };
  }, [bundles, dailyLogsMap, todayDayIndex]);

  /* ── Log modal ── */
  function openLogModal() {
    if (!selectedBundle) return;
    const latestPhase = getLatestPhase(selectedBundle.bundleId);
    setLogPhase(latestPhase || "Řezání");
    setLogPercent(getLatestPercent(selectedBundle.bundleId));
    setLogModalOpen(true);
  }

  async function handleSaveLog() {
    if (!selectedBundle || todayDayIndex < 0) return;
    try {
      await saveDailyLog(selectedBundle.bundleId, weekKey, todayDayIndex, logPhase, logPercent);
      qc.invalidateQueries({ queryKey: ["production-daily-logs", weekKey] });
      toast.success("✓ Log uložen", { duration: 2000 });
      setLogModalOpen(false);
    } catch (err) {
      toast.error("Chyba při ukládání logu");
    }
  }

  /* ── Spill to next week ── */
  const [spilledIds, setSpilledIds] = useState<Set<string>>(new Set());
  function handleSpill(bundleId: string) {
    setSpilledIds((prev) => new Set(prev).add(bundleId));
    const nextWeekNum = getISOWeekNumber(addWeeks(currentMonday, 1));
    toast(`Přesunuto do T${nextWeekNum}`, {
      action: {
        label: "Zpět",
        onClick: () => setSpilledIds((prev) => { const n = new Set(prev); n.delete(bundleId); return n; }),
      },
      duration: 5000,
    });
  }

  const visibleBundles = bundles.filter((b) => !spilledIds.has(b.bundleId));
  const spillBundles = visibleBundles.filter((b) => b.spillFrom);
  const activeBundles = visibleBundles.filter((b) => !b.spillFrom);

  if (loading) {
    return <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center"><p className="text-[#6b7280]">Načítání...</p></div>;
  }

  if (!isOwner) return null;

  const isManagement = roleView === "management";

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "#f8f7f4" }}>
      {/* ═══ HEADER ═══ */}
      <header className="border-b bg-primary px-6 py-4 shrink-0 z-50">
        <div className="flex items-center justify-between">
          {/* Left: Logo + module name */}
          <div className="flex items-center gap-3 shrink-0">
            <h1 className="text-xl font-serif text-primary-foreground tracking-wide">
              A→M <span className="font-sans font-normal text-base opacity-80">Interior</span>
            </h1>
            <span className="text-primary-foreground/40 text-sm">|</span>
            <span className="text-primary-foreground/70 text-sm font-sans">Výroba</span>
          </div>

          {/* Right: week nav + controls */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Week navigator */}
            <button onClick={() => setWeekOffset((w) => w - 1)} className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-primary-foreground text-sm font-mono select-none min-w-[200px] text-center">
              Týden {weekNum} · {fmtDate(currentMonday)}–{fmtDate(friday)}{currentMonday.getFullYear()}
            </span>
            <button onClick={() => setWeekOffset((w) => w + 1)} className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>

            <span className="w-px h-5 bg-primary-foreground/20 mx-1" />

            {/* Role toggle */}
            <button
              onClick={() => setRoleView((r) => r === "manager" ? "management" : "manager")}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors text-xs font-sans"
            >
              {isManagement ? "👔 Management" : "🔧 Výrobní Manažer"}
            </button>

            <span className="w-px h-5 bg-primary-foreground/20 mx-1" />

            {/* Nav icons */}
            <button
              onClick={() => navigate("/plan-vyroby")}
              className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
              title="Plán Výroby"
            >
              <CalendarRange className="h-5 w-5" />
            </button>
            <button
              onClick={() => navigate("/")}
              className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
              title="Přehled projektů"
            >
              <LayoutDashboard className="h-5 w-5" />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors text-sm">
                  <User className="h-4 w-4" />
                  <span className="font-sans text-xs">{profile?.full_name || profile?.email || "Uživatel"}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setAccountSettingsOpen(true)}>
                  <UserCog className="h-4 w-4 mr-2" />
                  Nastavení účtu
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Odhlásit se
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ═══ STATS BAR ═══ */}
      <div className="shrink-0 flex items-center gap-3 px-4 text-xs" style={{ height: 40, background: "#f5f3f0", borderBottom: "1px solid #e5e2dd" }}>
        <span className="text-[#1a1a1a] font-medium">{stats.total} bundlů</span>
        <span className="w-px h-4 bg-[#d0cdc8]" />
        <span className="font-mono" style={{ color: "#2563eb" }}>∅ {stats.avgPct}%</span>
        <span className="w-px h-4 bg-[#d0cdc8]" />
        <span style={{ color: "#3a8a36" }}>✓ {stats.onTrack} on track</span>
        <span className="w-px h-4 bg-[#d0cdc8]" />
        <span style={{ color: stats.behind > 0 ? "#dc2626" : "#6b7280" }}>⚠ {stats.behind} pozadu</span>
        <span className="w-px h-4 bg-[#d0cdc8]" />
        <span style={{ color: todayDayIndex >= 0 && stats.todayLogged < stats.total ? "#d97706" : "#6b7280" }}>
          Dnes: {stats.todayLogged} / {stats.total}
        </span>
      </div>

      {/* ═══ BODY ═══ */}
      <div className="flex flex-1 min-h-0">
        {/* ═══ SIDEBAR ═══ */}
        <div className="shrink-0 flex flex-col overflow-y-auto" style={{ width: 270, borderRight: "1px solid #e5e2dd", background: "#ffffff" }}>
          {spillBundles.length > 0 && (
            <div style={{ background: "#fffbeb", borderBottom: "1px solid #fcd34d" }}>
              <div className="px-3 py-1.5 text-[10px] uppercase font-semibold" style={{ color: "#d97706" }}>↩ Přetok z min. týdne</div>
              {spillBundles.map((b) => (
                <SidebarRow key={b.bundleId} bundle={b} selected={selectedBundleId === b.bundleId} onSelect={setSelectedBundleId}
                  latestPct={getLatestPercent(b.bundleId)} latestPhase={getLatestPhase(b.bundleId)} behind={isBehind(b.bundleId)} />
              ))}
            </div>
          )}
          <div className="px-3 py-1.5 text-[10px] uppercase font-semibold" style={{ color: "#6b7280" }}>Aktivní bundly ({activeBundles.length})</div>
          {activeBundles.map((b) => (
            <SidebarRow key={b.bundleId} bundle={b} selected={selectedBundleId === b.bundleId} onSelect={setSelectedBundleId}
              latestPct={getLatestPercent(b.bundleId)} latestPhase={getLatestPhase(b.bundleId)} behind={isBehind(b.bundleId)} />
          ))}
          {visibleBundles.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-[#99a5a3] text-sm p-4 text-center">
              Žádné bundly v tomto týdnu
            </div>
          )}
        </div>

        {/* ═══ DETAIL PANEL ═══ */}
        <div className="flex-1 flex flex-col min-h-0">
          {!selectedBundle ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[#99a5a3] gap-2">
              <ClipboardList className="h-10 w-10" />
              <span className="text-sm">Vyberte bundle ze seznamu</span>
            </div>
          ) : (
            <>
              <DetailPanel
                bundle={selectedBundle}
                logs={getLogsForBundle(selectedBundle.bundleId)}
                todayDayIndex={todayDayIndex}
                isManagement={isManagement}
                onOpenLog={openLogModal}
                onSpill={() => handleSpill(selectedBundle.bundleId)}
                nextWeekNum={getISOWeekNumber(addWeeks(currentMonday, 1))}
                tpvItems={itemsByProject.get(selectedBundle.projectId) || []}
                expandedMap={expandedMap}
                setExpandedMap={setExpandedMap}
                getCumulativeForDay={(di) => getCumulativeForDay(selectedBundle.bundleId, di)}
                getExpectedPct={getExpectedPct}
                isBehind={isBehind(selectedBundle.bundleId)}
                latestPct={getLatestPercent(selectedBundle.bundleId)}
                daysLogged={getDaysLogged(selectedBundle.bundleId)}
              />
              {/* Pinned bottom log button */}
              {!isManagement && todayDayIndex >= 0 && (
                <div className="shrink-0 p-3" style={{ borderTop: "1px solid #e5e2dd" }}>
                  <button
                    onClick={openLogModal}
                    className="w-full py-2.5 rounded-md text-white text-sm font-medium transition-colors hover:opacity-90"
                    style={{ background: selectedBundle.color }}
                  >
                    + Log dnes ({DAY_SHORT[todayDayIndex]})
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ═══ LOG MODAL ═══ */}
      <Dialog open={logModalOpen} onOpenChange={setLogModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="font-mono text-xs text-[#6b7280]">{selectedBundle?.projectId}</span>
              <span>{selectedBundle?.projectName}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* Phase selector */}
            <div>
              <div className="text-xs font-semibold text-[#6b7280] mb-2">Fáze dnes</div>
              <div className="flex flex-wrap gap-1.5">
                {PHASES.map((p) => (
                  <button key={p.name} onClick={() => setLogPhase(p.name)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                    style={{
                      background: logPhase === p.name ? p.color : "#f5f3f0",
                      color: logPhase === p.name ? "#fff" : "#1a1a1a",
                      border: `1px solid ${logPhase === p.name ? p.color : "#e5e2dd"}`,
                    }}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Percent slider */}
            <div>
              <div className="text-xs font-semibold text-[#6b7280] mb-2">Celková hotovost bundlu</div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Slider
                    min={0} max={100} step={5}
                    value={[logPercent]}
                    onValueChange={([v]) => setLogPercent(v)}
                  />
                  <div className="flex justify-between text-[9px] text-[#99a5a3] mt-1">
                    <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                  </div>
                </div>
                <span className="text-2xl font-mono font-bold min-w-[60px] text-right" style={{ color: logPercent >= 100 ? "#3a8a36" : "#1a1a1a" }}>
                  {logPercent}%
                </span>
              </div>
              <div className="mt-2">
                <Progress value={logPercent} className="h-1.5" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogModalOpen(false)}>Zrušit</Button>
            <Button onClick={handleSaveLog}>Uložit log</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AccountSettings open={accountSettingsOpen} onOpenChange={setAccountSettingsOpen} />
    </div>
  );
}

/* ═══════════════════════════════════════ */
/* SIDEBAR ROW                             */
/* ═══════════════════════════════════════ */

function SidebarRow({ bundle, selected, onSelect, latestPct, latestPhase, behind }: {
  bundle: VyrobaBundle;
  selected: boolean;
  onSelect: (id: string) => void;
  latestPct: number;
  latestPhase: string | null;
  behind: boolean;
}) {
  const phaseInfo = PHASES.find((p) => p.name === latestPhase);
  return (
    <button
      onClick={() => onSelect(bundle.bundleId)}
      className="w-full text-left flex items-stretch transition-colors"
      style={{
        background: selected ? `${bundle.color}12` : "transparent",
        borderLeft: selected ? `3px solid ${bundle.color}` : "3px solid transparent",
        borderBottom: "1px solid #f0eeea",
      }}
    >
      {/* Color bar */}
      <div className="w-[3px] shrink-0" style={{ background: bundle.color }} />

      <div className="flex-1 px-2 py-1.5 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs font-semibold truncate" style={{ color: "#1a1a1a" }}>{bundle.projectName}</span>
          <div className="flex items-center gap-1 shrink-0">
            {behind && <span className="text-[9px] bg-[#dc2626] text-white rounded px-1">⚠</span>}
            <span className="text-xs font-mono font-bold" style={{ color: behind ? "#dc2626" : latestPct >= 100 ? "#3a8a36" : "#1a1a1a" }}>
              {latestPct}%
            </span>
          </div>
        </div>
        {/* Mini progress */}
        <div className="mt-1 h-[3px] rounded-full overflow-hidden" style={{ background: "#e5e2dd" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(latestPct, 100)}%`, background: bundle.color }} />
        </div>
        {/* Phase info */}
        {latestPhase && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: phaseInfo?.color || "#6b7280" }} />
            <span className="text-[10px]" style={{ color: "#6b7280" }}>{latestPhase}</span>
          </div>
        )}
        <div className="text-[10px] font-mono mt-0.5" style={{ color: "#99a5a3" }}>{bundle.projectId}</div>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════ */
/* DETAIL PANEL                            */
/* ═══════════════════════════════════════ */

interface CumulativeInfo { percent: number; phase: string | null; isCarryForward: boolean; hasLog: boolean }

function DetailPanel({ bundle, logs, todayDayIndex, isManagement, onOpenLog, onSpill, nextWeekNum, tpvItems, expandedMap, setExpandedMap, getCumulativeForDay, getExpectedPct, isBehind: isBehindProp, latestPct, daysLogged }: {
  bundle: VyrobaBundle;
  logs: DailyLog[];
  todayDayIndex: number;
  isManagement: boolean;
  onOpenLog: () => void;
  onSpill: () => void;
  nextWeekNum: number;
  tpvItems: any[];
  expandedMap: Record<string, boolean>;
  setExpandedMap: (fn: (m: Record<string, boolean>) => Record<string, boolean>) => void;
  getCumulativeForDay: (dayIndex: number) => CumulativeInfo | null;
  getExpectedPct: (dayIndex: number) => number;
  isBehind: boolean;
  latestPct: number;
  daysLogged: number;
}) {
  const expectedPct = todayDayIndex >= 0 ? getExpectedPct(todayDayIndex) : 0;
  const isExpanded = expandedMap[bundle.bundleId] ?? false;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="shrink-0 px-5 py-3" style={{ background: "#ffffff", borderBottom: "1px solid #e5e2dd" }}>
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-1 h-5 rounded-sm" style={{ background: bundle.color }} />
              <span className="text-xs font-mono" style={{ color: "#6b7280" }}>{bundle.projectId}</span>
              {isBehindProp && <span className="text-[9px] bg-[#dc2626] text-white rounded px-1.5 py-0.5 font-medium">⚠ pozadu</span>}
            </div>
            <div className="text-lg font-bold" style={{ color: "#1a1a1a" }}>{bundle.projectName}</div>
            <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
              {bundle.items.length} položek · {daysLogged} dní zalogováno
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-mono font-bold" style={{ color: isBehindProp ? "#dc2626" : latestPct >= 100 ? "#3a8a36" : "#1a1a1a" }}>
              {latestPct}%
            </div>
            {todayDayIndex >= 0 && (
              <div className="text-xs" style={{ color: "#99a5a3" }}>oček. {expectedPct}%</div>
            )}
          </div>
        </div>
        {/* Overall progress bar with marker */}
        <div className="mt-2 relative">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#e5e2dd" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(latestPct, 100)}%`, background: bundle.color }} />
          </div>
          {todayDayIndex >= 0 && (
            <div className="absolute top-[-2px] h-[10px] w-[2px]" style={{ left: `${expectedPct}%`, background: "#1a1a1a", opacity: 0.3 }} />
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ background: "#f8f7f4" }}>
        {/* Day cells */}
        <div>
          <div className="text-[10px] uppercase font-semibold mb-2" style={{ color: "#99a5a3" }}>Průběh týdne — kumulativní</div>
          <div className="grid grid-cols-5 gap-2">
            {[0, 1, 2, 3, 4].map((di) => (
              <DayCell key={di} dayIndex={di} todayDayIndex={todayDayIndex} cumulative={getCumulativeForDay(di)}
                isManagement={isManagement} onOpenLog={onOpenLog} bundleColor={bundle.color} />
            ))}
          </div>
        </div>

        {/* Phases */}
        <div>
          <div className="text-[10px] uppercase font-semibold mb-2" style={{ color: "#99a5a3" }}>Fáze výroby</div>
          <div className="flex flex-wrap gap-1.5">
            {PHASES.map((p) => {
              const phaseUsed = logs.some((l) => l.phase === p.name);
              const phaseDone = logs.some((l) => l.phase === p.name && l.percent >= 100);
              const isCurrent = logs.length > 0 && [...logs].sort((a, b) => b.day_index - a.day_index)[0]?.phase === p.name;
              return (
                <span key={p.name} className="px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{
                    background: phaseDone ? "#f0fdf4" : isCurrent ? `${p.color}15` : "#f5f3f0",
                    color: phaseDone ? "#3a8a36" : isCurrent ? p.color : "#6b7280",
                    border: `1px solid ${phaseDone ? "#86efac" : isCurrent ? p.color : "#e5e2dd"}`,
                  }}>
                  {phaseDone ? "✓ " : ""}{p.name}
                </span>
              );
            })}
          </div>
        </div>

        {/* Spill */}
        {!isManagement && (
          <div className="rounded-lg p-3" style={{ background: "#ffffff", border: "1px solid #e5e2dd" }}>
            <div className="text-xs font-semibold mb-1" style={{ color: "#1a1a1a" }}>Přesunutí do příštího týdne</div>
            <p className="text-xs mb-2" style={{ color: "#6b7280" }}>Bundle bude přesunut do T{nextWeekNum} a zmizí z aktuálního týdne.</p>
            <button onClick={onSpill} className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors"
              style={{ background: "#fffbeb", border: "1px solid #fcd34d", color: "#d97706" }}>
              ⏭ Přesunout do T{nextWeekNum}
            </button>
          </div>
        )}

        {/* Items list */}
        <Collapsible open={isExpanded} onOpenChange={(open) => setExpandedMap((m) => ({ ...m, [bundle.bundleId]: open }))}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold cursor-pointer" style={{ color: "#6b7280" }}>
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Položky ({bundle.items.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 rounded-lg overflow-hidden" style={{ border: "1px solid #e5e2dd", maxHeight: 280, overflowY: "auto" }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "#f5f3f0" }}>
                    <th className="text-left px-2 py-1 font-medium" style={{ color: "#6b7280" }}>Kód</th>
                    <th className="text-left px-2 py-1 font-medium" style={{ color: "#6b7280" }}>Název</th>
                  </tr>
                </thead>
                <tbody>
                  {(tpvItems.length > 0 ? tpvItems : bundle.items).map((item: any, i: number) => (
                    <tr key={item.id || i} style={{ borderTop: i > 0 ? "1px solid #f0eeea" : undefined }}>
                      <td className="px-2 py-1 font-mono">{item.item_name || item.item_code || "–"}</td>
                      <td className="px-2 py-1">{item.item_type || item.nazev_prvku || item.item_name || "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════ */
/* DAY CELL                                */
/* ═══════════════════════════════════════ */

function DayCell({ dayIndex, todayDayIndex, cumulative, isManagement, onOpenLog, bundleColor }: {
  dayIndex: number;
  todayDayIndex: number;
  cumulative: CumulativeInfo | null;
  isManagement: boolean;
  onOpenLog: () => void;
  bundleColor: string;
}) {
  const isToday = dayIndex === todayDayIndex;
  const isFuture = todayDayIndex >= 0 && dayIndex > todayDayIndex;
  const isPast = todayDayIndex >= 0 && dayIndex < todayDayIndex;
  const notCurrentWeek = todayDayIndex < 0;
  const hasData = cumulative !== null;
  const pct = cumulative?.percent ?? 0;
  const isComplete = pct >= 100;

  let bg = "#ffffff";
  let border = "#e5e2dd";
  let statusLabel = "";

  if (isFuture || notCurrentWeek) {
    bg = "#f5f3f0";
    border = "#e5e2dd";
  } else if (isComplete) {
    bg = "#f0fdf4";
    border = "#86efac";
  } else if (isToday && hasData && cumulative?.hasLog) {
    bg = "#f0fdf4";
    border = "#86efac";
  } else if (isToday && !cumulative?.hasLog) {
    bg = "#fffbeb";
    border = "#fcd34d";
    statusLabel = "chybí log";
  } else if (isPast && !hasData) {
    bg = "rgba(254,242,242,0.6)";
    border = "#fca5a5";
    statusLabel = "bez logu";
  }

  return (
    <div className="rounded-lg p-2 flex flex-col gap-1 transition-all" style={{
      background: bg,
      border: `1px solid ${border}`,
      opacity: isFuture ? 0.4 : 1,
    }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium" style={{ color: "#6b7280" }}>{DAY_NAMES[dayIndex]}</span>
        {isToday && <span className="text-[8px] font-bold px-1 rounded" style={{ background: "#3a8a36", color: "#fff" }}>DNES</span>}
      </div>

      {hasData ? (
        <>
          <div className="text-xl font-mono font-bold text-right" style={{ color: pct >= 100 ? "#3a8a36" : "#1a1a1a" }}>{pct}%</div>
          {cumulative?.phase && (
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: PHASES.find((p) => p.name === cumulative.phase)?.color || "#6b7280" }} />
              <span className="text-[9px]" style={{ color: "#6b7280" }}>{cumulative.phase}</span>
            </div>
          )}
          <div className="h-1 rounded-full overflow-hidden" style={{ background: "#e5e2dd" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: bundleColor }} />
          </div>
          {cumulative?.isCarryForward && <span className="text-[8px]" style={{ color: "#99a5a3" }}>kumulativně</span>}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          {statusLabel && <span className="text-[9px] font-medium" style={{ color: isToday ? "#d97706" : "#dc2626" }}>{statusLabel}</span>}
          {!statusLabel && !isFuture && <span className="text-[9px]" style={{ color: "#99a5a3" }}>—</span>}
        </div>
      )}

      {isToday && !isManagement && (
        <button onClick={onOpenLog} className="mt-1 w-full text-[9px] font-medium py-0.5 rounded transition-colors"
          style={{ background: `${bundleColor}15`, color: bundleColor, border: `1px solid ${bundleColor}40` }}>
          {cumulative?.hasLog ? "Upravit log" : "+ Log dnes"}
        </button>
      )}
    </div>
  );
}
