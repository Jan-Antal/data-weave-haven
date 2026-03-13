import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePeopleManagement } from "@/components/PeopleManagementContext";
import { useProductionSchedule, getISOWeekNumber, type ScheduleItem } from "@/hooks/useProductionSchedule";
import { useProductionDailyLogs, saveDailyLog, type DailyLog } from "@/hooks/useProductionDailyLogs";
import { getProjectColor } from "@/lib/projectColors";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ClipboardList,
  User, UserCog, Settings, Check, LogOut, LayoutDashboard, CalendarRange, Factory,
  Circle, CheckCircle2, X, Mail, Plus, Trash2, Loader2
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { renumberSiblings } from "@/components/production/SplitItemDialog";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AccountSettings } from "@/components/AccountSettings";
import { UserManagement } from "@/components/UserManagement";
import { ExchangeRateSettings } from "@/components/ExchangeRateSettings";
import { StatusManagement } from "@/components/StatusManagement";
import { RecycleBin } from "@/components/RecycleBin";
import { CostBreakdownPresetsDialog } from "@/components/CostBreakdownPresetsDialog";
import { DataLogPanel } from "@/components/DataLogPanel";
import { CapacitySettings } from "@/components/production/CapacitySettings";
import { AdminInboxButton } from "@/components/AdminInbox";
import { useIsMobile } from "@/hooks/use-mobile";
import { parseAppDate } from "@/lib/dateFormat";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useSharePointDocs, type SPFile } from "@/hooks/useSharePointDocs";
import { PhotoLightbox, isImageFile } from "@/components/PhotoLightbox";

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

function fmtDateFull(d: Date): string {
  return `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`;
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

interface VyrobaProject {
  projectId: string;
  projectName: string;
  totalHours: number;
  scheduleItems: ScheduleItem[];
  color: string;
  pm?: string | null;
  expedice?: string | null;
  deadline?: Date | null;
}

/* ═══ MAIN PAGE ═══ */
export default function Vyroba() {
  const { isOwner, isAdmin, loading, profile, signOut, canAccessSettings, canManageUsers, canManagePeople, canManageExchangeRates, canManageStatuses, canAccessRecycleBin, realRole, simulatedRole, setSimulatedRole, role } = useAuth();
  const { openPeopleManagement } = usePeopleManagement();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobile();

  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [userMgmtOpen, setUserMgmtOpen] = useState(false);
  const [exchangeRateOpen, setExchangeRateOpen] = useState(false);
  const [statusMgmtOpen, setStatusMgmtOpen] = useState(false);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [costPresetsOpen, setCostPresetsOpen] = useState(false);
  const [dataLogOpen, setDataLogOpen] = useState(false);
  const [capacitySettingsOpen, setCapacitySettingsOpen] = useState(false);

  // Owner/Admin guard
  useEffect(() => {
    if (!loading && !isOwner && !isAdmin) navigate("/", { replace: true });
  }, [loading, isOwner, isAdmin, navigate]);

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0);
  const currentMonday = useMemo(() => addWeeks(getMonday(new Date()), weekOffset), [weekOffset]);
  const weekKey = weekKeyStr(currentMonday);
  const weekNum = getISOWeekNumber(currentMonday);
  const friday = useMemo(() => { const f = new Date(currentMonday); f.setDate(f.getDate() + 4); return f; }, [currentMonday]);

  // Data
  const { data: scheduleData } = useProductionSchedule();
  const { data: dailyLogsMap } = useProductionDailyLogs(weekKey);

  // Build projects from schedule for this week
  const projects = useMemo<VyrobaProject[]>(() => {
    if (!scheduleData) return [];
    const silo = scheduleData.get(weekKey);
    if (!silo) return [];
    return silo.bundles
      .filter(b => b.items.some(i => i.status === "scheduled" || i.status === "in_progress"))
      .map((b) => {
        // Resolve deadline from project info in items
        let deadlineDate: Date | null = null;
        // We'll fetch deadline from project data below
        return {
          projectId: b.project_id,
          projectName: b.project_name,
          totalHours: b.total_hours,
          scheduleItems: b.items,
          color: getProjectColor(b.project_id),
          pm: null,
          expedice: null,
          deadline: deadlineDate,
        };
      });
  }, [scheduleData, weekKey]);

  // Fetch project details for deadlines/PM
  const { data: projectDetails } = useProjectDetails(projects.map(p => p.projectId));

  // Merge project details
  const enrichedProjects = useMemo<VyrobaProject[]>(() => {
    if (!projectDetails) return projects;
    return projects.map(p => {
      const detail = projectDetails.get(p.projectId);
      if (!detail) return p;
      const deadlineSrc = detail.expedice || detail.datum_smluvni || null;
      const deadlineDate = deadlineSrc ? parseAppDate(deadlineSrc) : null;
      return { ...p, pm: detail.pm, expedice: detail.expedice, deadline: deadlineDate };
    });
  }, [projects, projectDetails]);

  // Today info
  const todayDayIndex = useMemo(() => {
    const now = new Date();
    const todayMonday = getMonday(now);
    if (weekKeyStr(todayMonday) !== weekKey) return -1;
    return (now.getDay() + 6) % 7;
  }, [weekKey]);

  // Selection
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const selectedProject = enrichedProjects.find(p => p.projectId === selectedProjectId) || null;

  // Auto-select first
  useEffect(() => {
    if (enrichedProjects.length > 0 && !enrichedProjects.find(p => p.projectId === selectedProjectId)) {
      setSelectedProjectId(enrichedProjects[0].projectId);
    }
  }, [enrichedProjects, selectedProjectId]);

  // Log modal
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logPhase, setLogPhase] = useState("Řezání");
  const [logPercent, setLogPercent] = useState(0);
  const [logTab, setLogTab] = useState<"notes" | "photo">("notes");
  const [logNotes, setLogNotes] = useState("");

  // Items expand
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  /* ── helpers for a project ── */
  const bundleId = (pid: string) => `${pid}::${weekKey}`;

  function getLogsForProject(pid: string): DailyLog[] {
    return dailyLogsMap?.get(bundleId(pid)) || [];
  }

  function getLatestPercent(pid: string): number {
    const logs = getLogsForProject(pid);
    if (logs.length === 0) return 0;
    return Math.max(...logs.map(l => l.percent));
  }

  function getLatestPhase(pid: string): string | null {
    const logs = getLogsForProject(pid);
    if (logs.length === 0) return null;
    const sorted = [...logs].sort((a, b) => b.day_index - a.day_index);
    return sorted[0].phase;
  }

  function getCumulativeForDay(pid: string, dayIndex: number): CumulativeInfo | null {
    const logs = getLogsForProject(pid);
    const exact = logs.find(l => l.day_index === dayIndex);
    if (exact) return { percent: exact.percent, phase: exact.phase, isCarryForward: false, hasLog: true };
    const prev = logs.filter(l => l.day_index < dayIndex).sort((a, b) => b.day_index - a.day_index);
    if (prev.length > 0) return { percent: prev[0].percent, phase: prev[0].phase, isCarryForward: true, hasLog: false };
    return null;
  }

  function getExpectedPct(dayIndex: number): number {
    return Math.round(((dayIndex + 1) / 5) * 100);
  }

  function getProjectStatus(pid: string): "on-track" | "at-risk" | "behind" {
    const pct = getLatestPercent(pid);
    if (todayDayIndex < 0) return "on-track";
    const expected = getExpectedPct(todayDayIndex);
    if (pct >= expected - 10) return "on-track";
    if (pct >= expected - 25) return "at-risk";
    return "behind";
  }

  /* ── Stats ── */
  const stats = useMemo(() => {
    const total = enrichedProjects.length;
    const avgPct = total > 0 ? Math.round(enrichedProjects.reduce((s, p) => s + getLatestPercent(p.projectId), 0) / total) : 0;
    const onTrack = enrichedProjects.filter(p => getProjectStatus(p.projectId) === "on-track").length;
    const behind = enrichedProjects.filter(p => getProjectStatus(p.projectId) === "behind").length;
    const todayLogged = todayDayIndex >= 0 ? enrichedProjects.filter(p => getLogsForProject(p.projectId).some(l => l.day_index === todayDayIndex)).length : 0;
    return { total, avgPct, onTrack, behind, todayLogged };
  }, [enrichedProjects, dailyLogsMap, todayDayIndex]);

  /* ── Log modal ── */
  function openLogModal() {
    if (!selectedProject) return;
    const latestPhase = getLatestPhase(selectedProject.projectId);
    setLogPhase(latestPhase || "Řezání");
    setLogPercent(getLatestPercent(selectedProject.projectId));
    setLogTab("notes");
    setLogNotes("");
    setLogModalOpen(true);
  }

  async function handleSaveLog() {
    if (!selectedProject || todayDayIndex < 0) return;
    try {
      await saveDailyLog(bundleId(selectedProject.projectId), weekKey, todayDayIndex, logPhase, logPercent);
      qc.invalidateQueries({ queryKey: ["production-daily-logs", weekKey] });
      toast.success("✓ Log uložen", { duration: 2000 });
      setLogModalOpen(false);
    } catch {
      toast.error("Chyba při ukládání logu");
    }
  }

  /* ── Spill to next week ── */
  const nextWeekKey = weekKeyStr(addWeeks(currentMonday, 1));
  const nextWeekNum = getISOWeekNumber(addWeeks(currentMonday, 1));

  async function handleSpillAll() {
    if (!selectedProject) return;
    const activeItems = selectedProject.scheduleItems.filter(i => i.status === "scheduled" || i.status === "in_progress");
    if (activeItems.length === 0) return;
    const ids = activeItems.map(i => i.id);
    const { error } = await supabase.from("production_schedule").update({ scheduled_week: nextWeekKey }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["production-schedule"] });
    toast.success(`${ids.length} položek → T${nextWeekNum}`);
  }

  /* ── Check if all bundle items completed → move to Expedice ── */
  async function checkAndMoveToExpedice(projectId: string, projectName: string) {
    // Re-fetch all schedule items for this project in current week
    const { data: items } = await supabase
      .from("production_schedule")
      .select("id, status")
      .eq("project_id", projectId)
      .eq("scheduled_week", weekKey)
      .not("status", "eq", "cancelled");

    if (!items || items.length === 0) return;

    const allCompleted = items.every(i => i.status === "completed");
    if (!allCompleted) return;

    // Update project status to Expedice
    const { error } = await supabase
      .from("projects")
      .update({ status: "Expedice" })
      .eq("project_id", projectId);

    if (error) {
      console.warn("Failed to update project status:", error.message);
      return;
    }

    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["vyroba-project-details"] });
    toast.success(`${projectName} dokončeno — přesunuto do Expedice`, { duration: 4000 });
  }

  /* ── Complete all items ── */
  async function handleCompleteAll() {
    if (!selectedProject) return;
    const activeItems = selectedProject.scheduleItems.filter(i => i.status !== "completed" && i.status !== "cancelled");
    if (activeItems.length === 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    const ids = activeItems.map(i => i.id);
    const { error } = await supabase.from("production_schedule").update({
      status: "completed", completed_at: new Date().toISOString(), completed_by: user?.id || null,
    }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["production-schedule"] });

    // All items now completed → move to Expedice
    await checkAndMoveToExpedice(selectedProject.projectId, selectedProject.projectName);
  }

  /* ── Toggle single item complete ── */
  async function toggleItemComplete(itemId: string, currentStatus: string) {
    if (!selectedProject) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (currentStatus === "completed") {
      const { error } = await supabase.from("production_schedule").update({ status: "scheduled", completed_at: null, completed_by: null }).eq("id", itemId);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("production_schedule").update({
        status: "completed", completed_at: new Date().toISOString(), completed_by: user?.id || null,
      }).eq("id", itemId);
      if (error) { toast.error(error.message); return; }
    }
    qc.invalidateQueries({ queryKey: ["production-schedule"] });

    // After toggling to completed, check if all are now done
    if (currentStatus !== "completed") {
      // Small delay to let the invalidation propagate, then check
      setTimeout(() => checkAndMoveToExpedice(selectedProject.projectId, selectedProject.projectName), 300);
    }
  }

  function handleSelectProject(pid: string) {
    setSelectedProjectId(pid);
    if (isMobile) setMobileDetailOpen(true);
  }

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Načítání...</p></div>;
  }
  if (!isOwner) return null;

  const statusColors = { "on-track": "#3a8a36", "at-risk": "#d97706", "behind": "#dc2626" };

  /* ═══ RENDER ═══ */
  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "#f8f7f4" }}>
      {/* ═══ HEADER ═══ */}
      <header className="border-b bg-primary px-4 md:px-6 py-4 shrink-0 z-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 shrink-0">
            <h1 className="text-xl font-serif text-primary-foreground tracking-wide">
              A→M <span className="font-sans font-normal text-base opacity-80">Interior</span>
            </h1>
            <span className="text-primary-foreground/40 text-sm hidden md:inline">|</span>
            <span className="text-primary-foreground/70 text-sm font-sans hidden md:inline">Výroba</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setWeekOffset(w => w - 1)} className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-primary-foreground text-sm font-mono select-none min-w-[140px] md:min-w-[200px] text-center">
              T{weekNum} · {fmtDate(currentMonday)}–{fmtDate(friday)}{currentMonday.getFullYear()}
            </span>
            <button onClick={() => setWeekOffset(w => w + 1)} className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>

            <span className="w-px h-5 bg-primary-foreground/20 mx-1 hidden md:block" />

            <button className="p-2 rounded-md text-primary-foreground bg-primary-foreground/10 transition-colors cursor-default" title="Výroba">
              <Factory className="h-5 w-5" />
            </button>
            <button onClick={() => navigate("/plan-vyroby")} className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors" title="Plán Výroby">
              <CalendarRange className="h-5 w-5" />
            </button>
            <button onClick={() => navigate("/")} className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors" title="Přehled">
              <LayoutDashboard className="h-5 w-5" />
            </button>

            <AdminInboxButton />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors text-sm">
                  <User className="h-4 w-4" />
                  <span className="font-sans hidden md:inline">{profile?.full_name || profile?.email || "Uživatel"}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setAccountSettingsOpen(true)}>
                  <UserCog className="h-4 w-4 mr-2" /> Nastavení účtu
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="h-4 w-4 mr-2" /> Odhlásit se
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
                  {canManageUsers && <DropdownMenuItem onClick={() => setUserMgmtOpen(true)}>Správa uživatelů</DropdownMenuItem>}
                  {canManagePeople && <DropdownMenuItem onClick={openPeopleManagement}>Správa osob</DropdownMenuItem>}
                  {canManageExchangeRates && <DropdownMenuItem onClick={() => setExchangeRateOpen(true)}>Kurzovní lístek</DropdownMenuItem>}
                  {isAdmin && <DropdownMenuItem onClick={() => setCostPresetsOpen(true)}>Rozpad ceny</DropdownMenuItem>}
                  {isAdmin && <DropdownMenuItem onClick={() => setCapacitySettingsOpen(true)}>Kapacita výroby</DropdownMenuItem>}
                  {canManageStatuses && <DropdownMenuItem onClick={() => setStatusMgmtOpen(true)}>Správa statusů</DropdownMenuItem>}
                  {canAccessRecycleBin && <DropdownMenuItem onClick={() => setRecycleBinOpen(true)}>Koš</DropdownMenuItem>}
                  {(isAdmin || role === "pm" || isOwner) && <DropdownMenuItem onClick={() => setDataLogOpen(true)}>Data Log</DropdownMenuItem>}
                  {realRole === "owner" && (
                    <>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Zobrazit jako</div>
                      {(["admin", "pm", "konstrukter", "viewer"] as const).map(r => (
                        <DropdownMenuItem key={r} onClick={() => setSimulatedRole(r === "admin" ? null : r)} className="flex items-center justify-between">
                          <span>{r === "admin" ? "Admin" : r === "pm" ? "PM" : r === "konstrukter" ? "Konstruktér" : "Viewer"}</span>
                          {((r === "admin" && !simulatedRole) || simulatedRole === r) && <Check className="h-4 w-4 text-green-600" />}
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
        <span style={{ color: "#1a1a1a", fontWeight: 500 }}>{stats.total} projektů</span>
        <span className="w-px h-4" style={{ background: "#d0cdc8" }} />
        <span className="font-mono" style={{ color: "#2563eb" }}>∅ {stats.avgPct}%</span>
        <span className="w-px h-4" style={{ background: "#d0cdc8" }} />
        <span style={{ color: "#3a8a36" }}>✓ {stats.onTrack} on track</span>
        <span className="w-px h-4" style={{ background: "#d0cdc8" }} />
        <span style={{ color: stats.behind > 0 ? "#dc2626" : "#6b7280" }}>⚠ {stats.behind} pozadu</span>
        <span className="w-px h-4" style={{ background: "#d0cdc8" }} />
        <span style={{ color: todayDayIndex >= 0 && stats.todayLogged < stats.total ? "#d97706" : "#6b7280" }}>
          Dnes: {stats.todayLogged}/{stats.total}
        </span>
      </div>

      {/* ═══ BODY ═══ */}
      <div className="flex flex-1 min-h-0">
        {/* ═══ LEFT PANEL ═══ */}
        <div className={`shrink-0 flex flex-col overflow-y-auto ${isMobile ? "w-full" : "w-[252px]"}`} style={{ borderRight: isMobile ? "none" : "1px solid #e5e2dd", background: "#ffffff" }}>
          <div className="px-3 py-1.5 text-[10px] uppercase font-semibold" style={{ color: "#6b7280", borderBottom: "1px solid #f0eeea" }}>
            Projekty v T{weekNum} ({enrichedProjects.length})
          </div>
          {enrichedProjects.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-4 text-center">
              <span className="text-sm" style={{ color: "#99a5a3" }}>Žádné projekty v tomto týdnu</span>
            </div>
          ) : (
            enrichedProjects.map(p => {
              const status = getProjectStatus(p.projectId);
              const pct = getLatestPercent(p.projectId);
              const phase = getLatestPhase(p.projectId);
              const isSelected = selectedProjectId === p.projectId;
              const borderColor = statusColors[status];
              return (
                <button
                  key={p.projectId}
                  onClick={() => handleSelectProject(p.projectId)}
                  className="w-full text-left flex items-stretch transition-colors"
                  style={{
                    background: isSelected ? "#ffffff" : "transparent",
                    borderBottom: "1px solid #f0eeea",
                  }}
                >
                  {/* Status color bar */}
                  <div className="w-[3px] shrink-0 rounded-r-sm" style={{ background: borderColor }} />
                  <div className="flex-1 px-2.5 py-2 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate" style={{ fontSize: 13, fontWeight: 500, color: "#1a1a1a" }}>{p.projectName}</span>
                      <span className="font-mono text-xs font-bold shrink-0" style={{ color: borderColor }}>
                        {pct}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono" style={{ fontSize: 11, color: "#99a5a3" }}>{p.projectId}</span>
                      {phase && (
                        <>
                          <span style={{ fontSize: 11, color: "#d0cdc8" }}>·</span>
                          <span style={{ fontSize: 11, color: "#6b7280" }}>{phase}</span>
                        </>
                      )}
                      {p.deadline && (
                        <>
                          <span style={{ fontSize: 11, color: "#d0cdc8" }}>·</span>
                          <span style={{ fontSize: 11, color: "#6b7280" }}>{fmtDateFull(p.deadline)}</span>
                        </>
                      )}
                    </div>
                    {/* 3px progress bar */}
                    <div className="mt-1.5 h-[3px] rounded-full overflow-hidden" style={{ background: "#e5e2dd" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: borderColor }} />
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* ═══ DETAIL PANEL (desktop) ═══ */}
        {!isMobile && (
          <div className="flex-1 flex flex-col min-h-0">
            {!selectedProject ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2" style={{ color: "#99a5a3" }}>
                <ClipboardList className="h-10 w-10" />
                <span className="text-sm">Vyberte projekt ze seznamu</span>
              </div>
            ) : (
              <DetailPanel
                project={selectedProject}
                weekKey={weekKey}
                todayDayIndex={todayDayIndex}
                onOpenLog={openLogModal}
                nextWeekNum={nextWeekNum}
                onSpillAll={handleSpillAll}
                onCompleteAll={handleCompleteAll}
                onToggleItem={toggleItemComplete}
                getCumulativeForDay={(di) => getCumulativeForDay(selectedProject.projectId, di)}
                getExpectedPct={getExpectedPct}
                status={getProjectStatus(selectedProject.projectId)}
                latestPct={getLatestPercent(selectedProject.projectId)}
                latestPhase={getLatestPhase(selectedProject.projectId)}
                logs={getLogsForProject(selectedProject.projectId)}
                expandedMap={expandedMap}
                setExpandedMap={setExpandedMap}
                bundleId={bundleId(selectedProject.projectId)}
              />
            )}
          </div>
        )}
      </div>

      {/* ═══ MOBILE BOTTOM SHEET ═══ */}
      {isMobile && selectedProject && (
        <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
          <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl p-0 overflow-hidden">
            <div className="flex flex-col h-full overflow-y-auto">
              {/* Drag handle */}
              <div className="flex justify-center pt-2 pb-1 shrink-0">
                <div className="w-10 h-1 rounded-full" style={{ background: "#d0cdc8" }} />
              </div>
              <DetailPanel
                project={selectedProject}
                weekKey={weekKey}
                todayDayIndex={todayDayIndex}
                onOpenLog={openLogModal}
                nextWeekNum={nextWeekNum}
                onSpillAll={handleSpillAll}
                onCompleteAll={handleCompleteAll}
                onToggleItem={toggleItemComplete}
                getCumulativeForDay={(di) => getCumulativeForDay(selectedProject.projectId, di)}
                getExpectedPct={getExpectedPct}
                status={getProjectStatus(selectedProject.projectId)}
                latestPct={getLatestPercent(selectedProject.projectId)}
                latestPhase={getLatestPhase(selectedProject.projectId)}
                logs={getLogsForProject(selectedProject.projectId)}
                expandedMap={expandedMap}
                setExpandedMap={setExpandedMap}
                bundleId={bundleId(selectedProject.projectId)}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* ═══ LOG MODAL ═══ */}
      <Dialog open={logModalOpen} onOpenChange={setLogModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="font-mono text-xs" style={{ color: "#6b7280" }}>{selectedProject?.projectId}</span>
              <span>{selectedProject?.projectName}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: "#6b7280" }}>Fáze dnes</div>
              <div className="flex flex-wrap gap-1.5">
                {PHASES.map(p => (
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
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: "#6b7280" }}>Celková hotovost</div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Slider min={0} max={100} step={5} value={[logPercent]} onValueChange={([v]) => setLogPercent(v)} />
                  <div className="flex justify-between text-[9px] mt-1" style={{ color: "#99a5a3" }}>
                    <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                  </div>
                </div>
                <span className="text-2xl font-mono font-bold min-w-[60px] text-right" style={{ color: logPercent >= 100 ? "#3a8a36" : "#1a1a1a" }}>
                  {logPercent}%
                </span>
              </div>
            </div>

            {/* Tab switcher: Poznámky / Foto */}
            <div>
              <div className="flex gap-0 mb-2">
                <button onClick={() => setLogTab("notes")} className="px-3 py-1 text-xs font-medium rounded-l transition-colors"
                  style={{ background: logTab === "notes" ? "#223937" : "#f5f3f0", color: logTab === "notes" ? "#fff" : "#6b7280", border: logTab === "notes" ? "none" : "1px solid #e5e2dd" }}>
                  Poznámky
                </button>
                <button onClick={() => setLogTab("photo")} className="px-3 py-1 text-xs font-medium rounded-r transition-colors"
                  style={{ background: logTab === "photo" ? "#223937" : "#f5f3f0", color: logTab === "photo" ? "#fff" : "#6b7280", border: logTab === "photo" ? "none" : "1px solid #e5e2dd" }}>
                  Foto
                </button>
              </div>
              {logTab === "notes" ? (
                <textarea
                  value={logNotes}
                  onChange={e => setLogNotes(e.target.value)}
                  placeholder="Poznámky k dnešnímu dni..."
                  className="w-full h-20 text-xs rounded-md p-2 resize-none"
                  style={{ border: "1px solid #e5e2dd", background: "#fafaf8" }}
                />
              ) : (
                <VyrobaPhotoTab projectId={selectedProject?.projectId || ""} />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogModalOpen(false)}>Zrušit</Button>
            <Button onClick={handleSaveLog} style={{ background: "#3a8a36" }}>
              + Log dnes ({todayDayIndex >= 0 ? DAY_SHORT[todayDayIndex] : "–"})
            </Button>
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
/* useProjectDetails hook                  */
/* ═══════════════════════════════════════ */
import { useQuery } from "@tanstack/react-query";

function useProjectDetails(projectIds: string[]) {
  return useQuery({
    queryKey: ["vyroba-project-details", projectIds.join(",")],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("project_id, project_name, pm, expedice, montaz, datum_smluvni, status")
        .in("project_id", projectIds);
      if (error) throw error;
      const map = new Map<string, typeof data[0]>();
      for (const row of data || []) map.set(row.project_id, row);
      return map;
    },
  });
}

/* ═══════════════════════════════════════ */
/* DETAIL PANEL                            */
/* ═══════════════════════════════════════ */

interface CumulativeInfo { percent: number; phase: string | null; isCarryForward: boolean; hasLog: boolean }

function DetailPanel({ project, weekKey, todayDayIndex, onOpenLog, nextWeekNum, onSpillAll, onCompleteAll, onToggleItem, getCumulativeForDay, getExpectedPct, status, latestPct, latestPhase, logs, expandedMap, setExpandedMap, bundleId }: {
  project: VyrobaProject;
  weekKey: string;
  todayDayIndex: number;
  onOpenLog: () => void;
  nextWeekNum: number;
  onSpillAll: () => void;
  onCompleteAll: () => void;
  onToggleItem: (id: string, status: string) => void;
  getCumulativeForDay: (dayIndex: number) => CumulativeInfo | null;
  getExpectedPct: (dayIndex: number) => number;
  status: "on-track" | "at-risk" | "behind";
  latestPct: number;
  latestPhase: string | null;
  logs: DailyLog[];
  expandedMap: Record<string, boolean>;
  setExpandedMap: (fn: (m: Record<string, boolean>) => Record<string, boolean>) => void;
  bundleId: string;
}) {
  const expectedPct = todayDayIndex >= 0 ? getExpectedPct(todayDayIndex) : 0;
  const isExpanded = expandedMap[bundleId] ?? true;
  const statusColors = { "on-track": "#3a8a36", "at-risk": "#d97706", "behind": "#dc2626" };
  const statusLabels = { "on-track": "On track", "at-risk": "At risk", "behind": "Pozadu" };
  const statusColor = statusColors[status];
  const activeItems = project.scheduleItems.filter(i => i.status !== "cancelled");
  const completedCount = activeItems.filter(i => i.status === "completed").length;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Header ── */}
      <div className="shrink-0 px-5 py-3" style={{ background: "#ffffff", borderBottom: "1px solid #e5e2dd" }}>
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-mono text-xs" style={{ color: "#6b7280" }}>{project.projectId}</span>
              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}40` }}>
                {statusLabels[status]}
              </span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, color: "#1a1a1a" }}>{project.projectName}</div>
            <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
              {activeItems.length} položek
              {project.deadline && <> · Expedice {fmtDateFull(project.deadline)}</>}
              {project.pm && <> · {project.pm}</>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-mono font-bold" style={{ color: statusColor }}>
              {latestPct}%
            </div>
            {todayDayIndex >= 0 && (
              <div className="text-xs" style={{ color: "#99a5a3" }}>oček. {expectedPct}%</div>
            )}
          </div>
        </div>
        {/* Progress bar 4px */}
        <div className="mt-2 relative">
          <div className="h-1 rounded-full overflow-hidden" style={{ background: "#e5e2dd" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(latestPct, 100)}%`, background: statusColor }} />
          </div>
          {todayDayIndex >= 0 && (
            <div className="absolute top-[-2px] h-[8px] w-[2px]" style={{ left: `${expectedPct}%`, background: "#1a1a1a", opacity: 0.2 }} />
          )}
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ background: "#f8f7f4" }}>

        {/* ── Week Progress ── */}
        <div>
          <div className="text-[10px] uppercase font-semibold mb-2" style={{ color: "#99a5a3" }}>Průběh týdne</div>
          <div className="grid grid-cols-5 gap-2">
            {[0, 1, 2, 3, 4].map(di => (
              <DayCell key={di} dayIndex={di} todayDayIndex={todayDayIndex} cumulative={getCumulativeForDay(di)} onOpenLog={onOpenLog} statusColor={statusColor} />
            ))}
          </div>
        </div>

        {/* ── Phases + Spill ── */}
        <div>
          <div className="text-[10px] uppercase font-semibold mb-2" style={{ color: "#99a5a3" }}>Fáze výroby</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {PHASES.map(p => {
              const isCurrent = latestPhase === p.name;
              const phaseUsed = logs.some(l => l.phase === p.name);
              return (
                <span key={p.name} className="px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{
                    background: isCurrent ? `${p.color}15` : "#f5f3f0",
                    color: isCurrent ? p.color : "#6b7280",
                    border: `1px solid ${isCurrent ? p.color : "#e5e2dd"}`,
                  }}>
                  {phaseUsed && !isCurrent ? "✓ " : ""}{p.name}
                </span>
              );
            })}
            <div className="flex-1" />
            <button
              onClick={onSpillAll}
              className="px-3 py-1 text-[11px] font-semibold rounded transition-colors"
              style={{ background: "#d97706", color: "#fff" }}
            >
              ⇒ Přesunout do T{nextWeekNum}
            </button>
          </div>
        </div>

        {/* ── Items ── */}
        <Collapsible open={isExpanded} onOpenChange={open => setExpandedMap(m => ({ ...m, [bundleId]: open }))}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold cursor-pointer" style={{ color: "#6b7280" }}>
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Položky ({completedCount}/{activeItems.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-1" style={{ maxHeight: 300, overflowY: "auto" }}>
              {activeItems.map(item => {
                const isCompleted = item.status === "completed";
                const isPaused = item.status === "paused";
                const isInProgress = item.status === "in_progress";
                return (
                  <div key={item.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-md" style={{ border: "1px solid #ece8e2", background: "#ffffff", opacity: isCompleted ? 0.55 : 1 }}>
                    <Checkbox
                      className="h-3.5 w-3.5"
                      checked={isCompleted}
                      onCheckedChange={() => onToggleItem(item.id, item.status)}
                    />
                    {item.item_code && <span className="font-mono text-[10px] shrink-0" style={{ color: "#223937" }}>{item.item_code}</span>}
                    <span className="text-[13px] flex-1 truncate" style={{ color: isCompleted ? "#99a5a3" : "#1a1a1a", textDecoration: isCompleted ? "line-through" : undefined }}>
                      {item.item_name}
                    </span>
                    <span className="font-mono text-[11px] shrink-0" style={{ color: "#6b7280" }}>{item.scheduled_hours}h</span>
                    {isInProgress && <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: "rgba(37,99,235,0.1)", color: "#2563eb" }}>probíhá</span>}
                    {isPaused && <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: "rgba(217,119,6,0.12)", color: "#d97706" }}>⏸ čeká</span>}
                    {isCompleted && <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(58,138,54,0.12)", color: "#3a8a36" }}>✓ hotovo</span>}
                  </div>
                );
              })}
            </div>
            {activeItems.some(i => i.status !== "completed") && (
              <div className="flex justify-end mt-2">
                <button onClick={onCompleteAll} className="text-[11px] font-medium px-3 py-1 rounded" style={{ background: "rgba(58,138,54,0.1)", color: "#3a8a36", border: "1px solid rgba(58,138,54,0.2)" }}>
                  Označit vše jako hotovo
                </button>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* ── Daily log shortcut ── */}
        {todayDayIndex >= 0 && (
          <button onClick={onOpenLog} className="w-full py-2.5 rounded-md text-white text-sm font-medium transition-colors hover:opacity-90" style={{ background: "#3a8a36" }}>
            + Log dnes ({DAY_SHORT[todayDayIndex]})
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════ */
/* DAY CELL                                */
/* ═══════════════════════════════════════ */

function DayCell({ dayIndex, todayDayIndex, cumulative, onOpenLog, statusColor }: {
  dayIndex: number;
  todayDayIndex: number;
  cumulative: CumulativeInfo | null;
  onOpenLog: () => void;
  statusColor: string;
}) {
  const isToday = dayIndex === todayDayIndex;
  const isFuture = todayDayIndex >= 0 && dayIndex > todayDayIndex;
  const isPast = todayDayIndex >= 0 && dayIndex < todayDayIndex;
  const notCurrentWeek = todayDayIndex < 0;
  const hasData = cumulative !== null;
  const pct = cumulative?.percent ?? 0;

  let bg = "#ffffff";
  let border = "#e5e2dd";
  let borderStyle = "solid";

  if (isFuture || notCurrentWeek) {
    bg = "#fafaf8";
    border = "#e5e2dd";
    borderStyle = "dashed";
  } else if (isToday) {
    bg = "#ffffff";
    border = "#3a8a36";
  } else if (isPast && !cumulative?.hasLog) {
    bg = "#ffffff";
    border = "#fca5a5";
  }

  return (
    <div className="rounded-lg p-2 flex flex-col gap-1 transition-all" style={{
      background: bg,
      border: `1px ${borderStyle} ${border}`,
      opacity: isFuture ? 0.5 : 1,
    }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium" style={{ color: "#6b7280" }}>{DAY_NAMES[dayIndex]}</span>
        {isToday && <span className="w-2 h-2 rounded-full" style={{ background: "#3a8a36" }} />}
      </div>

      {hasData ? (
        <>
          <div className="text-xl font-mono font-bold text-right" style={{ color: pct >= 100 ? "#3a8a36" : "#1a1a1a" }}>{pct}%</div>
          {cumulative?.phase && (
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: PHASES.find(p => p.name === cumulative.phase)?.color || "#6b7280" }} />
              <span className="text-[9px]" style={{ color: "#6b7280" }}>{cumulative.phase}</span>
            </div>
          )}
          {isToday && (
            <button onClick={onOpenLog} className="mt-0.5 w-full text-[9px] font-medium py-0.5 rounded transition-colors"
              style={{ background: "rgba(58,138,54,0.08)", color: "#3a8a36", border: "1px solid rgba(58,138,54,0.2)" }}>
              Upravit log
            </button>
          )}
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-1">
          {isPast && !isFuture ? (
            <span className="text-[9px]" style={{ color: "#fca5a5", opacity: 0.8 }}>bez logu</span>
          ) : isFuture ? (
            <span className="text-[11px]" style={{ color: "#d0cdc8" }}>–</span>
          ) : isToday ? (
            <button onClick={onOpenLog} className="text-[9px] font-medium py-0.5 px-2 rounded transition-colors"
              style={{ background: "rgba(58,138,54,0.08)", color: "#3a8a36", border: "1px solid rgba(58,138,54,0.2)" }}>
              + Log dnes
            </button>
          ) : (
            <span className="text-[11px]" style={{ color: "#d0cdc8" }}>–</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════ */
/* PHOTO TAB                               */
/* ═══════════════════════════════════════ */

function VyrobaPhotoTab({ projectId }: { projectId: string }) {
  const { filesByCategory, listFiles, uploadFile, deleteFile, uploading } = useSharePointDocs(projectId);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load fotky on mount
  useEffect(() => {
    if (projectId) listFiles("fotky");
  }, [projectId, listFiles]);

  const photos = useMemo(() => {
    const all = filesByCategory["fotky"] || [];
    return all.filter(f => isImageFile(f.name));
  }, [filesByCategory]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      try {
        await uploadFile("fotky", file);
        toast.success(`✓ ${file.name} nahráno`);
      } catch (err: any) {
        toast.error(err.message || "Upload selhal");
      }
    }
    // Refresh list
    listFiles("fotky", true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDelete(fileName: string) {
    try {
      await deleteFile("fotky", fileName);
      toast.success("Foto smazáno");
    } catch {
      toast.error("Smazání selhalo");
    }
  }

  return (
    <div>
      {/* Upload button */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px]" style={{ color: "#99a5a3" }}>{photos.length} fotek</span>
        <label className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium cursor-pointer transition-colors"
          style={{ background: "rgba(58,138,54,0.08)", color: "#3a8a36", border: "1px solid rgba(58,138,54,0.2)" }}>
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Přidat foto
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {/* Photo grid */}
      {photos.length === 0 ? (
        <div className="h-16 rounded-md flex items-center justify-center text-xs" style={{ border: "1px dashed #e5e2dd", color: "#99a5a3" }}>
          Žádné fotky
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5" style={{ maxHeight: 200, overflowY: "auto" }}>
          {photos.map((photo, idx) => (
            <div key={photo.itemId || photo.name} className="relative aspect-square rounded-md overflow-hidden group cursor-pointer"
              style={{ background: "#f0eeea" }}
              onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}>
              <img
                src={photo.thumbnailUrl || photo.downloadUrl || ""}
                alt={photo.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {/* Delete button on hover */}
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(photo.name); }}
                className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: "rgba(0,0,0,0.6)" }}>
                <X className="h-3 w-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <PhotoLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        files={photos}
        initialIndex={lightboxIndex}
        projectName={projectId}
        onDelete={(file) => handleDelete(file.name)}
        canDelete
      />
    </div>
  );
}
