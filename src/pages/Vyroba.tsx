import { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePeopleManagement } from "@/components/PeopleManagementContext";
import { useProductionSchedule, getISOWeekNumber, type ScheduleBundle, type ScheduleItem } from "@/hooks/useProductionSchedule";
import { useProductionDailyLogs, saveDailyLog, type DailyLog } from "@/hooks/useProductionDailyLogs";
import { useAllTPVItems } from "@/hooks/useAllTPVItems";
import { getProjectColor } from "@/lib/projectColors";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ClipboardList, AlertTriangle, User, UserCog, Settings, Check, LogOut, LayoutDashboard, CalendarRange, Circle, CheckCircle2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { renumberSiblings } from "@/components/production/SplitItemDialog";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AccountSettings } from "@/components/AccountSettings";
import { UserManagement } from "@/components/UserManagement";
import { ExchangeRateSettings } from "@/components/ExchangeRateSettings";
import { StatusManagement } from "@/components/StatusManagement";
import { RecycleBin } from "@/components/RecycleBin";
import { CostBreakdownPresetsDialog } from "@/components/CostBreakdownPresetsDialog";
import { DataLogPanel } from "@/components/DataLogPanel";
import { CapacitySettings } from "@/components/production/CapacitySettings";

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



interface VyrobaBundle {
  bundleId: string;
  projectId: string;
  projectName: string;
  totalHours: number;
  scheduleItems: ScheduleItem[];
  items: { id: string; item_name: string; item_code: string | null }[];
  color: string;
  spillFrom?: boolean;
}

/* ═══ MAIN PAGE ═══ */
export default function Vyroba() {
  const { isOwner, isAdmin, loading, profile, signOut, canAccessSettings, canManageUsers, canManagePeople, canManageExchangeRates, canManageStatuses, canAccessRecycleBin, realRole, simulatedRole, setSimulatedRole, role } = useAuth();
  const { openPeopleManagement } = usePeopleManagement();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [userMgmtOpen, setUserMgmtOpen] = useState(false);
  const [exchangeRateOpen, setExchangeRateOpen] = useState(false);
  const [statusMgmtOpen, setStatusMgmtOpen] = useState(false);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [costPresetsOpen, setCostPresetsOpen] = useState(false);
  const [dataLogOpen, setDataLogOpen] = useState(false);
  const [capacitySettingsOpen, setCapacitySettingsOpen] = useState(false);

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
      scheduleItems: b.items,
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

  const spillBundles = bundles.filter((b) => b.spillFrom);
  const activeBundles = bundles.filter((b) => !b.spillFrom);

  if (loading) {
    return <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center"><p className="text-[#6b7280]">Načítání...</p></div>;
  }

  if (!isOwner) return null;

  

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
                  <span className="font-sans">{profile?.full_name || profile?.email || "Uživatel"}</span>
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

            {(canAccessSettings || realRole === "owner") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors">
                    <Settings className="h-5 w-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canManageUsers && (
                    <DropdownMenuItem onClick={() => setUserMgmtOpen(true)}>
                      Správa uživatelů
                    </DropdownMenuItem>
                  )}
                  {canManagePeople && (
                    <DropdownMenuItem onClick={openPeopleManagement}>
                      Správa osob
                    </DropdownMenuItem>
                  )}
                  {canManageExchangeRates && (
                    <DropdownMenuItem onClick={() => setExchangeRateOpen(true)}>
                      Kurzovní lístek
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => setCostPresetsOpen(true)}>
                      Rozpad ceny
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => setCapacitySettingsOpen(true)}>
                      Kapacita výroby
                    </DropdownMenuItem>
                  )}
                  {canManageStatuses && (
                    <DropdownMenuItem onClick={() => setStatusMgmtOpen(true)}>
                      Správa statusů
                    </DropdownMenuItem>
                  )}
                  {canAccessRecycleBin && (
                    <DropdownMenuItem onClick={() => setRecycleBinOpen(true)}>
                      Koš
                    </DropdownMenuItem>
                  )}
                  {(isAdmin || role === "pm" || isOwner) && (
                    <DropdownMenuItem onClick={() => setDataLogOpen(true)}>
                      Data Log
                    </DropdownMenuItem>
                  )}
                  {realRole === "owner" && (
                    <>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Zobrazit jako</div>
                      {(["admin", "pm", "konstrukter", "viewer"] as const).map((r) => (
                        <DropdownMenuItem
                          key={r}
                          onClick={() => setSimulatedRole(r === "admin" ? null : r)}
                          className="flex items-center justify-between"
                        >
                          <span>{r === "admin" ? "Admin" : r === "pm" ? "PM" : r === "konstrukter" ? "Konstruktér" : "Viewer"}</span>
                          {((r === "admin" && !simulatedRole) || simulatedRole === r) && (
                            <Check className="h-4 w-4 text-green-600" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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
          {bundles.length === 0 && (
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
                
                onOpenLog={openLogModal}
                nextWeekNum={getISOWeekNumber(addWeeks(currentMonday, 1))}
                nextWeekKey={weekKeyStr(addWeeks(currentMonday, 1))}
                weekKey={weekKey}
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
              {todayDayIndex >= 0 && (
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
      <UserManagement open={userMgmtOpen} onOpenChange={setUserMgmtOpen} />
      <ExchangeRateSettings open={exchangeRateOpen} onOpenChange={setExchangeRateOpen} />
      <StatusManagement open={statusMgmtOpen} onOpenChange={setStatusMgmtOpen} />
      <RecycleBin open={recycleBinOpen} onOpenChange={setRecycleBinOpen} />
      <CostBreakdownPresetsDialog open={costPresetsOpen} onOpenChange={setCostPresetsOpen} />
      <DataLogPanel open={dataLogOpen} onOpenChange={setDataLogOpen} />
      <CapacitySettings open={capacitySettingsOpen} onOpenChange={setCapacitySettingsOpen} />
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

function DetailPanel({ bundle, logs, todayDayIndex, onOpenLog, nextWeekNum, nextWeekKey, weekKey, tpvItems, expandedMap, setExpandedMap, getCumulativeForDay, getExpectedPct, isBehind: isBehindProp, latestPct, daysLogged }: {
  bundle: VyrobaBundle;
  logs: DailyLog[];
  todayDayIndex: number;
  onOpenLog: () => void;
  nextWeekNum: number;
  nextWeekKey: string;
  weekKey: string;
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
  const qc = useQueryClient();

  // Spill state
  type SpillMode = "items" | "split";
  const [spillMode, setSpillMode] = useState<SpillMode>("items");
  const [spillCheckedIds, setSpillCheckedIds] = useState<Set<string>>(new Set());
  const [spillSplitPcts, setSpillSplitPcts] = useState<Record<string, number>>({});
  const [spillSubmitting, setSpillSubmitting] = useState(false);

  // Get active schedule items for this bundle
  const activeScheduleItems = useMemo(() =>
    bundle.scheduleItems.filter(i => i.status !== "completed" && i.status !== "paused" && i.status !== "cancelled"),
    [bundle.scheduleItems]
  );

  // Reset spill state when bundle changes
  useEffect(() => {
    setSpillCheckedIds(new Set());
    setSpillSplitPcts({});
    setSpillMode("items");
  }, [bundle.bundleId]);

  const toggleSpillItem = (id: string) => {
    setSpillCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSpillConfirm = useCallback(async () => {
    if (!nextWeekKey) return;
    setSpillSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (spillMode === "items") {
        const ids = Array.from(spillCheckedIds);
        if (ids.length === 0) return;
        const { error } = await supabase.from("production_schedule")
          .update({ scheduled_week: nextWeekKey }).in("id", ids);
        if (error) throw error;
        toast(`${ids.length} položek přesunuto do T${nextWeekNum}`, { duration: 3000 });
      } else {
        let movedCount = 0;
        for (const item of activeScheduleItems) {
          const pct = spillSplitPcts[item.id] || 0;
          if (pct === 0) continue;

          if (pct === 100) {
            await supabase.from("production_schedule")
              .update({ scheduled_week: nextWeekKey }).eq("id", item.id);
            movedCount++;
          } else {
            const spillHours = Math.round(item.scheduled_hours * pct / 100);
            const keepHours = item.scheduled_hours - spillHours;
            const czkPerHour = item.scheduled_hours > 0 ? item.scheduled_czk / item.scheduled_hours : 550;
            const groupId = item.split_group_id || item.id;
            const cleanName = item.item_name.replace(/\s*\(\d+\/\d+\)$/, "");

            await supabase.from("production_schedule").update({
              scheduled_hours: keepHours,
              scheduled_czk: keepHours * czkPerHour,
              split_group_id: groupId,
            }).eq("id", item.id);

            await supabase.from("production_schedule").insert({
              project_id: item.project_id,
              stage_id: item.stage_id,
              item_name: cleanName,
              item_code: item.item_code,
              scheduled_week: nextWeekKey,
              scheduled_hours: spillHours,
              scheduled_czk: spillHours * czkPerHour,
              position: 999,
              status: "scheduled",
              created_by: user.id,
              split_group_id: groupId,
            });

            await renumberSiblings(groupId);

            const { data: allParts } = await supabase
              .from("production_schedule")
              .select("id, split_part, split_total")
              .or(`split_group_id.eq.${groupId},id.eq.${groupId}`)
              .order("scheduled_week");
            if (allParts) {
              for (const p of allParts) {
                await supabase.from("production_schedule").update({
                  item_name: `${cleanName} (${p.split_part}/${p.split_total})`,
                }).eq("id", p.id);
              }
            }
            movedCount++;
          }
        }
        toast(`${movedCount} položek přelito/rozděleno → T${nextWeekNum}`, { duration: 3000 });
      }

      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["production-inbox"] });
      qc.invalidateQueries({ queryKey: ["production-expedice"] });
    } catch (err: any) {
      toast.error(err.message || "Chyba při přesunu");
    }
    setSpillSubmitting(false);
  }, [nextWeekKey, spillMode, spillCheckedIds, spillSplitPcts, activeScheduleItems, qc, nextWeekNum]);

  const spillTotalHours = useMemo(() => {
    if (spillMode === "items") {
      return activeScheduleItems.filter(i => spillCheckedIds.has(i.id)).reduce((s, i) => s + i.scheduled_hours, 0);
    }
    return activeScheduleItems.reduce((s, i) => s + Math.round(i.scheduled_hours * (spillSplitPcts[i.id] || 0) / 100), 0);
  }, [spillMode, activeScheduleItems, spillCheckedIds, spillSplitPcts]);

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
                onOpenLog={onOpenLog} bundleColor={bundle.color} />
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

        {/* Spill to next week — items/split mode UI */}
        {activeScheduleItems.length > 0 && (
          <div className="rounded-lg overflow-hidden" style={{ background: "#ffffff", border: "1px solid #e5e2dd" }}>
            <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid #f0eeea" }}>
              <span className="text-xs font-semibold" style={{ color: "#1a1a1a" }}>Přesunutí do T{nextWeekNum}</span>
              <div className="flex items-center gap-0">
                <button
                  onClick={() => setSpillMode("items")}
                  className="px-2 py-1 text-[10px] font-medium rounded-l transition-colors"
                  style={{
                    backgroundColor: spillMode === "items" ? "#223937" : "#ffffff",
                    color: spillMode === "items" ? "#ffffff" : "#6b7a78",
                    border: spillMode === "items" ? "none" : "1px solid #e5e2dd",
                  }}
                >
                  Po položkách
                </button>
                <button
                  onClick={() => setSpillMode("split")}
                  className="px-2 py-1 text-[10px] font-medium rounded-r transition-colors"
                  style={{
                    backgroundColor: spillMode === "split" ? "#223937" : "#ffffff",
                    color: spillMode === "split" ? "#ffffff" : "#6b7a78",
                    border: spillMode === "split" ? "none" : "1px solid #e5e2dd",
                  }}
                >
                  Rozdělit %
                </button>
              </div>
            </div>

            <div className="px-3 py-2 space-y-1 max-h-[220px] overflow-y-auto">
              {activeScheduleItems.map(item => (
                <div key={item.id}>
                  {spillMode === "items" ? (
                    <label
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-xs"
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f8f7f5")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <Checkbox
                        className="h-3.5 w-3.5"
                        checked={spillCheckedIds.has(item.id)}
                        onCheckedChange={() => toggleSpillItem(item.id)}
                      />
                      {item.item_code && (
                        <span className="font-mono text-[10px] shrink-0" style={{ color: "#223937" }}>
                          {item.item_code}
                        </span>
                      )}
                      <span className="flex-1 truncate" style={{ color: "#6b7a78" }}>
                        {item.item_name}
                      </span>
                      <span className="font-mono text-[10px] shrink-0" style={{ color: "#99a5a3" }}>
                        {item.scheduled_hours}h
                      </span>
                    </label>
                  ) : (
                    <div className="px-2 py-1.5">
                      <div className="flex items-center gap-2 text-xs mb-1">
                        {item.item_code && (
                          <span className="font-mono text-[10px] shrink-0" style={{ color: "#223937" }}>
                            {item.item_code}
                          </span>
                        )}
                        <span className="flex-1 truncate" style={{ color: "#6b7a78" }}>
                          {item.item_name}
                        </span>
                        <span className="font-mono text-[10px] font-semibold shrink-0" style={{ color: "#223937" }}>
                          {spillSplitPcts[item.id] || 0}%
                        </span>
                        <span className="font-mono text-[10px] shrink-0" style={{ color: "#99a5a3" }}>
                          {Math.round(item.scheduled_hours * (spillSplitPcts[item.id] || 0) / 100)}h
                        </span>
                      </div>
                      <Slider
                        value={[spillSplitPcts[item.id] || 0]}
                        min={0} max={100} step={5}
                        onValueChange={([v]) => setSpillSplitPcts(prev => ({ ...prev, [item.id]: v }))}
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Summary + confirm */}
            <div className="px-3 py-2 flex items-center justify-between gap-2" style={{ borderTop: "1px solid #f0eeea" }}>
              <span className="text-[10px] font-mono" style={{ color: "#6b7280" }}>
                {Math.round(spillTotalHours)}h k přesunu
              </span>
              <button
                onClick={handleSpillConfirm}
                disabled={(spillMode === "items" ? spillCheckedIds.size === 0 : spillTotalHours === 0) || spillSubmitting}
                className="px-3 py-1.5 text-[10px] font-semibold rounded text-white transition-colors"
                style={{
                  backgroundColor: (spillMode === "items" ? spillCheckedIds.size > 0 : spillTotalHours > 0) ? "#d97706" : "#99a5a3",
                  cursor: (spillMode === "items" ? spillCheckedIds.size > 0 : spillTotalHours > 0) ? "pointer" : "not-allowed",
                  opacity: spillSubmitting ? 0.7 : 1,
                }}
              >
                {spillSubmitting ? "..." : `⏭ Přesunout → T${nextWeekNum}`}
              </button>
            </div>
          </div>
        )}

        {/* Items list — card-style rows */}
        <Collapsible open={isExpanded} onOpenChange={(open) => setExpandedMap((m) => ({ ...m, [bundle.bundleId]: open }))}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold cursor-pointer" style={{ color: "#6b7280" }}>
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Položky ({bundle.scheduleItems.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-1" style={{ maxHeight: 280, overflowY: "auto" }}>
              {bundle.scheduleItems.map((item) => {
                const isCompleted = item.status === "completed";
                const isCancelled = item.status === "cancelled";
                const isPaused = item.status === "paused";
                const isDimmed = isCompleted || isCancelled;

                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors"
                    style={{
                      border: "1px solid #ece8e2",
                      background: "#ffffff",
                      opacity: isDimmed ? 0.5 : 1,
                    }}
                  >
                    {/* Status indicator */}
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "#3a8a36" }} />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0" style={{ color: "#d0cdc8" }} />
                    )}
                    {/* Code */}
                    {item.item_code && (
                      <span className="font-mono text-[10px] shrink-0" style={{ color: "#223937" }}>
                        {item.item_code}
                      </span>
                    )}
                    {/* Name */}
                    <span
                      className="text-[11px] flex-1 truncate"
                      style={{
                        color: isDimmed ? "#99a5a3" : "#6b7a78",
                        textDecoration: isCompleted ? "line-through" : undefined,
                      }}
                    >
                      {item.item_name}
                    </span>
                    {/* Hours */}
                    <span className="font-mono text-[10px] shrink-0" style={{ color: "#6b7a78" }}>
                      {item.scheduled_hours}h
                    </span>
                    {/* Status badge */}
                    {isPaused && (
                      <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(217,119,6,0.12)", color: "#d97706" }}>
                        ⏸
                      </span>
                    )}
                    {isCancelled && (
                      <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#dc2626" }}>
                        ✕
                      </span>
                    )}
                    {isCompleted && (
                      <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(58,138,54,0.12)", color: "#3a8a36" }}>
                        ✓
                      </span>
                    )}
                  </div>
                );
              })}
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

function DayCell({ dayIndex, todayDayIndex, cumulative, onOpenLog, bundleColor }: {
  dayIndex: number;
  todayDayIndex: number;
  cumulative: CumulativeInfo | null;
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

      {isToday && (
        <button onClick={onOpenLog} className="mt-1 w-full text-[9px] font-medium py-0.5 rounded transition-colors"
          style={{ background: `${bundleColor}15`, color: bundleColor, border: `1px solid ${bundleColor}40` }}>
          {cumulative?.hasLog ? "Upravit log" : "+ Log dnes"}
        </button>
      )}
    </div>
  );
}
