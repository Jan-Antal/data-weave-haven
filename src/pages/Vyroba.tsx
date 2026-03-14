import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { usePeopleManagement } from "@/components/PeopleManagementContext";
import { useProductionSchedule, getISOWeekNumber, type ScheduleItem } from "@/hooks/useProductionSchedule";
import { useProductionDailyLogs, saveDailyLog, type DailyLog } from "@/hooks/useProductionDailyLogs";
import { getProjectColor } from "@/lib/projectColors";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ClipboardList,
  User, UserCog, Settings, Check, LogOut, LayoutDashboard, CalendarRange, Factory,
  Circle, CheckCircle2, X, Plus, Trash2, Loader2, Download, Printer, FileText
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 20);
}

const DAY_NAMES = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek"];
const DAY_SHORT = ["Po", "Út", "St", "Čt", "Pá"];

const PHASES = [
  { name: "Řezání", color: "#f59e0b" },
  { name: "CNC", color: "#6366f1" },
  { name: "Dýha", color: "#e67e22" },
  { name: "Lakování", color: "#8b5cf6" },
  { name: "Kompletace", color: "#3b82f6" },
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
  isSpilled?: boolean;
}

interface CumulativeInfo { percent: number; phase: string | null; isCarryForward: boolean; hasLog: boolean }

/* ═══ Quality checks hook ═══ */
function useQualityChecks(projectId: string) {
  const qc = useQueryClient();
  const { data: checks = [], refetch } = useQuery({
    queryKey: ["quality-checks", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_quality_checks" as any)
        .select("*")
        .eq("project_id", projectId);
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const checkItem = useCallback(async (itemId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await (supabase.from("production_quality_checks" as any) as any).insert({
      item_id: itemId,
      project_id: projectId,
      checked_by: user?.id,
    });
    if (error) throw error;
    refetch();
  }, [projectId, refetch]);

  return { checks, checkItem };
}

/* ═══ Profile name lookup ═══ */
function useProfileName(userId: string | null) {
  const { data } = useQuery({
    queryKey: ["profile-name", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", userId!)
        .maybeSingle();
      return data?.full_name || data?.email || "–";
    },
  });
  return data || null;
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

  // Build projects from schedule for this week + spilled from previous weeks
  const projects = useMemo<VyrobaProject[]>(() => {
    if (!scheduleData) return [];
    const result: VyrobaProject[] = [];
    const currentMondayTime = currentMonday.getTime();

    // Current week bundles
    const silo = scheduleData.get(weekKey);
    if (silo) {
      for (const b of silo.bundles) {
        if (b.items.some(i => i.status === "scheduled" || i.status === "in_progress")) {
          result.push({
            projectId: b.project_id,
            projectName: b.project_name,
            totalHours: b.total_hours,
            scheduleItems: b.items,
            color: getProjectColor(b.project_id),
            isSpilled: false,
          });
        }
      }
    }

    // Spilled: items from past weeks still active
    for (const [wk, ws] of scheduleData) {
      const wkDate = new Date(wk);
      if (wkDate.getTime() >= currentMondayTime) continue;
      for (const b of ws.bundles) {
        const activeItems = b.items.filter(i => i.status === "scheduled" || i.status === "in_progress");
        if (activeItems.length === 0) continue;
        // Don't duplicate if already in current week
        if (result.some(r => r.projectId === b.project_id)) continue;
        result.push({
          projectId: b.project_id,
          projectName: b.project_name,
          totalHours: activeItems.reduce((s, i) => s + i.scheduled_hours, 0),
          scheduleItems: activeItems,
          color: getProjectColor(b.project_id),
          isSpilled: true,
        });
      }
    }

    // Sort: spilled first
    result.sort((a, b) => (b.isSpilled ? 1 : 0) - (a.isSpilled ? 1 : 0));
    return result;
  }, [scheduleData, weekKey, currentMonday]);

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
  const [logDayIndex, setLogDayIndex] = useState(-1);
  const [logPhase, setLogPhase] = useState("Řezání");
  const [logPercent, setLogPercent] = useState(0);
  const [logTab, setLogTab] = useState<"notes" | "photo">("notes");
  const [logNotes, setLogNotes] = useState("");

  // Expedice confirmation dialog
  const [expediceDialogOpen, setExpediceDialogOpen] = useState(false);
  const [expediceChecks, setExpediceChecks] = useState({ vyroba: false, kvalita: false, dokumentace: false });

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

  // Get ALL items for a project across ALL weeks
  function getAllItemsForProject(pid: string): { item: ScheduleItem; weekKey: string; weekNum: number }[] {
    if (!scheduleData) return [];
    const items: { item: ScheduleItem; weekKey: string; weekNum: number }[] = [];
    const seen = new Set<string>();
    for (const [wk, silo] of scheduleData) {
      for (const bundle of silo.bundles) {
        if (bundle.project_id !== pid) continue;
        for (const item of bundle.items) {
          if (item.status === "cancelled") continue;
          // Deduplicate by item_code + item_name within same week
          const dedupeKey = `${wk}::${item.item_code || ""}::${item.item_name}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          items.push({ item, weekKey: wk, weekNum: silo.week_number });
        }
      }
    }
    return items;
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
  function openLogModal(dayIdx?: number) {
    if (!selectedProject) return;
    const di = dayIdx ?? todayDayIndex;
    setLogDayIndex(di);
    const latestPhase = getLatestPhase(selectedProject.projectId);
    setLogPhase(latestPhase || "Řezání");
    setLogPercent(getLatestPercent(selectedProject.projectId));
    setLogTab("notes");
    setLogNotes("");
    setLogModalOpen(true);
  }

  async function handleSaveLog() {
    if (!selectedProject || logDayIndex < 0) return;
    try {
      await saveDailyLog(bundleId(selectedProject.projectId), weekKey, logDayIndex, logPhase, logPercent);
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

  /* ── Expedice confirmation flow ── */
  function openExpediceDialog() {
    setExpediceChecks({ vyroba: false, kvalita: false, dokumentace: false });
    setExpediceDialogOpen(true);
  }

  async function handleConfirmExpedice() {
    if (!selectedProject) return;
    const { data: { user } } = await supabase.auth.getUser();
    // Complete all active items
    const activeItems = selectedProject.scheduleItems.filter(i => i.status !== "completed" && i.status !== "cancelled");
    if (activeItems.length > 0) {
      const ids = activeItems.map(i => i.id);
      await supabase.from("production_schedule").update({
        status: "completed", completed_at: new Date().toISOString(), completed_by: user?.id || null,
      }).in("id", ids);
    }
    // Update project status
    await supabase.from("projects").update({ status: "Expedice" }).eq("project_id", selectedProject.projectId);
    qc.invalidateQueries({ queryKey: ["production-schedule"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["vyroba-project-details"] });
    toast.success(`${selectedProject.projectName} → Expedice`, { duration: 4000 });
    setExpediceDialogOpen(false);
  }

  /* ── Toggle single item complete ── */
  async function toggleItemComplete(itemId: string, currentStatus: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (currentStatus === "completed") {
      await supabase.from("production_schedule").update({ status: "scheduled", completed_at: null, completed_by: null }).eq("id", itemId);
    } else {
      await supabase.from("production_schedule").update({
        status: "completed", completed_at: new Date().toISOString(), completed_by: user?.id || null,
      }).eq("id", itemId);
    }
    qc.invalidateQueries({ queryKey: ["production-schedule"] });
    // Individual checkbox does NOT change project status
  }

  function handleSelectProject(pid: string) {
    setSelectedProjectId(pid);
    if (isMobile) setMobileDetailOpen(true);
  }

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Načítání...</p></div>;
  }
  if (!isOwner && !isAdmin) return null;

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
              const borderColor = p.isSpilled ? "#d97706" : status === "behind" ? "#dc2626" : status === "at-risk" ? "#d97706" : p.color;
              return (
                <button
                  key={p.projectId}
                  onClick={() => handleSelectProject(p.projectId)}
                  className="w-full text-left flex items-stretch transition-colors"
                  style={{
                    background: isSelected ? "#ffffff" : "transparent",
                    borderBottom: "1px solid #f0eeea",
                    outline: isSelected ? "2px solid #d97706" : undefined,
                    outlineOffset: -2,
                  }}
                >
                  {/* Status color bar */}
                  <div className="w-[4px] shrink-0 rounded-r-sm" style={{ background: borderColor }} />
                  <div className="flex-1 px-2.5 py-[5px] min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate" style={{ fontSize: 14, fontWeight: 500, color: "#1a1a1a" }}>{p.projectName}</span>
                        {p.isSpilled && (
                          <span className="text-[8px] font-bold px-1 py-[1px] rounded shrink-0" style={{ backgroundColor: "rgba(217,119,6,0.1)", color: "#D97706" }}>
                            Omeškaní
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-xs font-bold shrink-0" style={{ color: statusColors[status] }}>
                        {pct}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono" style={{ fontSize: 11, color: "#99a5a3" }}>{p.projectId}</span>
                      {p.deadline && (
                        <>
                          <span style={{ fontSize: 11, color: "#d0cdc8" }}>·</span>
                          <span style={{ fontSize: 11, color: "#6b7280" }}>{fmtDateFull(p.deadline)}</span>
                        </>
                      )}
                      {phase && (
                        <>
                          <span style={{ fontSize: 11, color: "#d0cdc8" }}>·</span>
                          <span style={{ fontSize: 11, color: PHASES.find(ph => ph.name === phase)?.color || "#6b7280", fontWeight: 500 }}>{phase}</span>
                        </>
                      )}
                    </div>
                    {/* 3px progress bar */}
                    <div className="mt-1.5 h-[3px] rounded-full overflow-hidden" style={{ background: "#e5e2dd" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: statusColors[status] }} />
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
                currentMonday={currentMonday}
                todayDayIndex={todayDayIndex}
                onOpenLog={openLogModal}
                nextWeekNum={nextWeekNum}
                onSpillAll={handleSpillAll}
                onOpenExpedice={openExpediceDialog}
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
                allItems={getAllItemsForProject(selectedProject.projectId)}
                scheduleData={scheduleData}
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
                currentMonday={currentMonday}
                todayDayIndex={todayDayIndex}
                onOpenLog={openLogModal}
                nextWeekNum={nextWeekNum}
                onSpillAll={handleSpillAll}
                onOpenExpedice={openExpediceDialog}
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
                allItems={getAllItemsForProject(selectedProject.projectId)}
                scheduleData={scheduleData}
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
              {logDayIndex >= 0 && logDayIndex !== todayDayIndex && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}>doplněno</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: "#6b7280" }}>
                {logDayIndex >= 0 ? DAY_NAMES[logDayIndex] : "Dnes"} — Fáze
              </div>
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
              + Log {logDayIndex >= 0 ? DAY_SHORT[logDayIndex] : "–"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ EXPEDICE CONFIRMATION DIALOG ═══ */}
      <Dialog open={expediceDialogOpen} onOpenChange={setExpediceDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Potvrdit → Expedice</DialogTitle>
          </DialogHeader>
          <p className="text-sm" style={{ color: "#6b7280" }}>
            Před přesunem projektu <strong>{selectedProject?.projectName}</strong> do Expedice potvrďte:
          </p>
          <div className="space-y-3 py-3">
            <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
              <Checkbox checked={expediceChecks.vyroba} onCheckedChange={(v) => setExpediceChecks(c => ({ ...c, vyroba: !!v }))} />
              <span className="text-sm">Výroba dokončena</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
              <Checkbox checked={expediceChecks.kvalita} onCheckedChange={(v) => setExpediceChecks(c => ({ ...c, kvalita: !!v }))} />
              <span className="text-sm">Kvalita zkontrolována</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
              <Checkbox checked={expediceChecks.dokumentace} onCheckedChange={(v) => setExpediceChecks(c => ({ ...c, dokumentace: !!v }))} />
              <span className="text-sm">Dokumentace v pořádku</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpediceDialogOpen(false)}>Zrušit</Button>
            <Button
              disabled={!expediceChecks.vyroba || !expediceChecks.kvalita || !expediceChecks.dokumentace}
              onClick={handleConfirmExpedice}
              style={{ background: "#3a8a36" }}
            >
              Potvrdit → Expedice
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

function DetailPanel({ project, weekKey, currentMonday, todayDayIndex, onOpenLog, nextWeekNum, onSpillAll, onOpenExpedice, onToggleItem, getCumulativeForDay, getExpectedPct, status, latestPct, latestPhase, logs, expandedMap, setExpandedMap, bundleId, allItems, scheduleData }: {
  project: VyrobaProject;
  weekKey: string;
  currentMonday: Date;
  todayDayIndex: number;
  onOpenLog: (dayIdx?: number) => void;
  nextWeekNum: number;
  onSpillAll: () => void;
  onOpenExpedice: () => void;
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
  allItems: { item: ScheduleItem; weekKey: string; weekNum: number }[];
  scheduleData: Map<string, any> | undefined;
}) {
  const isMobile = useIsMobile();
  const expectedPct = todayDayIndex >= 0 ? getExpectedPct(todayDayIndex) : 0;
  const isExpanded = expandedMap[bundleId] ?? true;
  const statusColors = { "on-track": "#3a8a36", "at-risk": "#d97706", "behind": "#dc2626" };
  const statusLabels = { "on-track": "On track", "at-risk": "At risk", "behind": "Pozadu" };
  const statusColor = statusColors[status];

  // Group all items by category
  const { currentItems, futureItems, completedItems } = useMemo(() => {
    const current: { item: ScheduleItem; weekKey: string; weekNum: number }[] = [];
    const future: { item: ScheduleItem; weekKey: string; weekNum: number }[] = [];
    const completed: { item: ScheduleItem; weekKey: string; weekNum: number }[] = [];
    
    for (const entry of allItems) {
      if (entry.item.status === "completed") {
        completed.push(entry);
      } else if (entry.weekKey === weekKey) {
        current.push(entry);
      } else if (new Date(entry.weekKey) > new Date(weekKey)) {
        future.push(entry);
      } else {
        // Past week active items → treat as current (spilled)
        current.push(entry);
      }
    }
    return { currentItems: current, futureItems: future, completedItems: completed };
  }, [allItems, weekKey]);

  const totalActiveItems = currentItems.length + futureItems.length + completedItems.length;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Header ── */}
      <div className="shrink-0 px-5 py-3" style={{ background: "#ffffff", borderBottom: "1px solid #e5e2dd" }}>
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-mono text-xs" style={{ color: "#6b7280" }}>{project.projectId}</span>
              <span className="text-[8px] font-bold px-1 py-[1px] rounded shrink-0" style={{ backgroundColor: `${statusColor}18`, color: statusColor }}>
                {statusLabels[status]}
              </span>
              {project.isSpilled && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(217,119,6,0.1)", color: "#D97706" }}>
                  Omeškaní
                </span>
              )}
            </div>
            <div style={{ fontSize: 16, fontWeight: 500, color: "#1a1a1a" }}>{project.projectName}</div>
            <div className="text-xs mt-0.5" style={{ color: "#6b7280" }}>
              {totalActiveItems} položek
              {project.deadline && <> · Expedice {fmtDateFull(project.deadline)}</>}
              {project.pm && <> · {project.pm}</>}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-mono font-bold" style={{ color: statusColor }}>
              {latestPct}%
            </div>
            {todayDayIndex >= 0 && (
              <div className="text-xs" style={{ color: "#99a5a3" }}>Cíl: 100%</div>
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
              <DayCell
                key={di}
                dayIndex={di}
                todayDayIndex={todayDayIndex}
                cumulative={getCumulativeForDay(di)}
                onOpenLog={() => onOpenLog(di)}
                statusColor={statusColor}
                logs={logs}
              />
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

        {/* ── AKTUÁLNÍ items ── */}
        <Collapsible open={isExpanded} onOpenChange={open => setExpandedMap(m => ({ ...m, [bundleId]: open }))}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold cursor-pointer" style={{ color: "#6b7280" }}>
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Aktuální ({currentItems.filter(i => i.item.status === "completed").length}/{currentItems.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 space-y-1">
              {currentItems.map(({ item }) => (
                <ItemRow key={item.id} item={item} onToggle={onToggleItem} interactive projectId={project.projectId} />
              ))}
            </div>
            {/* Quality check per item */}
            <QualitySection projectId={project.projectId} items={currentItems.map(e => e.item)} />
          </CollapsibleContent>
        </Collapsible>

        {/* ── NAPLÁNOVANÉ (future) ── */}
        {futureItems.length > 0 && (
          <div>
            <div className="text-[10px] uppercase font-semibold mb-2" style={{ color: "#99a5a3" }}>Naplánované</div>
            <div className="space-y-1">
              {futureItems.map(({ item, weekNum: wn }) => (
                <div key={item.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-md" style={{ border: "1px solid #ece8e2", background: "#f5f3f0", opacity: 0.5 }}>
                  {item.item_code && <span className="font-mono text-[10px] shrink-0" style={{ color: "#223937" }}>{item.item_code}</span>}
                  <span className="text-[13px] flex-1 truncate" style={{ color: "#6b7280" }}>{item.item_name}</span>
                  <span className="font-mono text-[10px] shrink-0" style={{ color: "#99a5a3" }}>T{wn}</span>
                  <span className="font-mono text-[11px] shrink-0" style={{ color: "#99a5a3" }}>{item.scheduled_hours}h</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── HOTOVÉ ── */}
        {completedItems.length > 0 && (
          <div>
            <div className="text-[10px] uppercase font-semibold mb-2" style={{ color: "#99a5a3" }}>Hotové</div>
            <div className="space-y-1">
              {completedItems.map(({ item }) => (
                <div key={item.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-md" style={{ border: "1px solid #ece8e2", background: "#ffffff", opacity: 0.55 }}>
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: "#3a8a36" }} />
                  {item.item_code && <span className="font-mono text-[10px] shrink-0" style={{ color: "#223937" }}>{item.item_code}</span>}
                  <span className="text-[13px] flex-1 truncate" style={{ color: "#99a5a3", textDecoration: "line-through" }}>{item.item_name}</span>
                  <span className="font-mono text-[11px] shrink-0" style={{ color: "#99a5a3" }}>{item.scheduled_hours}h</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Daily log shortcut — directly below quality section ── */}
        {todayDayIndex >= 0 && (
          <button onClick={() => onOpenLog()} className={`w-full py-2.5 rounded-md text-white text-sm font-medium transition-colors hover:opacity-90 ${isMobile ? "min-h-[44px]" : ""}`} style={{ background: "#3a8a36" }}>
            + Log dnes ({DAY_SHORT[todayDayIndex]})
          </button>
        )}

        {/* ── Expedice button ── */}
        {currentItems.some(i => i.item.status !== "completed") && (
          <button onClick={onOpenExpedice} className={`w-full py-2.5 rounded-md text-sm font-medium transition-colors ${isMobile ? "min-h-[44px]" : ""}`}
            style={{ background: "rgba(58,138,54,0.1)", color: "#3a8a36", border: "1px solid rgba(58,138,54,0.2)" }}>
            Označit vše jako hotovo
          </button>
        )}

        {/* ── Výkresy Section ── */}
        <VykresynSection projectId={project.projectId} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════ */
/* ITEM ROW                                */
/* ═══════════════════════════════════════ */

function ItemRow({ item, onToggle, interactive, projectId }: {
  item: ScheduleItem;
  onToggle: (id: string, status: string) => void;
  interactive: boolean;
  projectId: string;
}) {
  const isCompleted = item.status === "completed";
  const isPaused = item.status === "paused";
  const isInProgress = item.status === "in_progress";
  const isSplit = item.split_part != null && item.split_total != null;

  return (
    <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-md" style={{ border: "1px solid #ece8e2", background: "#ffffff", opacity: isCompleted ? 0.55 : 1 }}>
      {interactive && (
        <Checkbox
          className="h-3.5 w-3.5"
          checked={isCompleted}
          onCheckedChange={() => onToggle(item.id, item.status)}
        />
      )}
      {item.item_code && <span className="font-mono text-[10px] shrink-0" style={{ color: "#223937" }}>{item.item_code}</span>}
      <span className="text-[13px] flex-1 truncate" style={{ color: isCompleted ? "#99a5a3" : "#1a1a1a", textDecoration: isCompleted ? "line-through" : undefined }}>
        {item.item_name}
        {isSplit && (
          <span className="text-[10px] ml-1" style={{ color: "#6b7280" }}>
            část {item.split_part}/{item.split_total}
          </span>
        )}
      </span>
      <span className="font-mono text-[11px] shrink-0" style={{ color: "#6b7280" }}>{item.scheduled_hours}h</span>
      {isInProgress && <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: "rgba(37,99,235,0.1)", color: "#2563eb" }}>probíhá</span>}
      {isPaused && <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: "rgba(217,119,6,0.12)", color: "#d97706" }}>⏸ čeká</span>}
      {isCompleted && <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(58,138,54,0.12)", color: "#3a8a36" }}>✓ hotovo</span>}
    </div>
  );
}

/* ═══════════════════════════════════════ */
/* QUALITY SECTION                         */
/* ═══════════════════════════════════════ */

function QualitySection({ projectId, items }: { projectId: string; items: ScheduleItem[] }) {
  const { checks, checkItem } = useQualityChecks(projectId);
  const [loading, setLoading] = useState<string | null>(null);

  const checkMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of checks) m.set(c.item_id, c);
    return m;
  }, [checks]);

  async function handleCheck(itemId: string) {
    setLoading(itemId);
    try {
      await checkItem(itemId);
      toast.success("✓ Zkontrolováno");
    } catch {
      toast.error("Chyba kontroly");
    } finally {
      setLoading(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="mt-3">
      <div className="text-[10px] uppercase font-semibold mb-1.5" style={{ color: "#99a5a3" }}>Kontrola kvality</div>
      <div className="space-y-1">
        {items.map(item => {
          const check = checkMap.get(item.id);
          return (
            <div key={item.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md" style={{ border: "1px solid #ece8e2", background: "#ffffff" }}>
              <span className="text-[12px] flex-1 truncate" style={{ color: "#4b5563" }}>
                {item.item_code ? `${item.item_code} · ` : ""}{item.item_name}
              </span>
              {check ? (
                <QualityCheckDisplay check={check} />
              ) : (
                <button
                  onClick={() => handleCheck(item.id)}
                  disabled={loading === item.id}
                  className="px-2 py-1 text-[11px] font-medium rounded transition-colors min-h-[36px]"
                  style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb", border: "1px solid rgba(37,99,235,0.2)" }}
                >
                  {loading === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "✓ Zkontrolovat"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QualityCheckDisplay({ check }: { check: any }) {
  const name = useProfileName(check.checked_by);
  const date = new Date(check.checked_at);
  const dateStr = `${date.getDate()}.${date.getMonth() + 1}.`;
  return (
    <span className="text-[10px] shrink-0" style={{ color: "#3a8a36" }}>
      ✓ {name || "–"} {dateStr}
    </span>
  );
}

/* ═══════════════════════════════════════ */
/* VÝKRESY SECTION                         */
/* ═══════════════════════════════════════ */

function VykresynSection({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const { filesByCategory, listFiles } = useSharePointDocs(projectId);

  useEffect(() => {
    if (open && projectId) listFiles("vykresy");
  }, [open, projectId, listFiles]);

  const files = filesByCategory["vykresy"] || [];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold cursor-pointer" style={{ color: "#6b7280" }}>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <FileText className="h-3 w-3" />
        Výkresy ({files.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-1">
          {files.length === 0 ? (
            <div className="text-xs py-3 text-center" style={{ color: "#99a5a3" }}>Žádné výkresy</div>
          ) : (
            files.map(file => (
              <div key={file.itemId || file.name} className="flex items-center gap-2 px-2.5 py-2 rounded-md" style={{ border: "1px solid #ece8e2", background: "#ffffff" }}>
                {file.thumbnailUrl && (
                  <img src={file.thumbnailUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                )}
                <span className="text-[12px] flex-1 truncate" style={{ color: "#1a1a1a" }}>{file.name}</span>
                {file.downloadUrl && (
                  <a href={file.downloadUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-muted transition-colors">
                    <Download className="h-3.5 w-3.5" style={{ color: "#6b7280" }} />
                  </a>
                )}
                {file.webUrl && (
                  <a href={file.webUrl} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-muted transition-colors" title="Tisk">
                    <Printer className="h-3.5 w-3.5" style={{ color: "#6b7280" }} />
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/* ═══════════════════════════════════════ */
/* DAY CELL                                */
/* ═══════════════════════════════════════ */

function DayCell({ dayIndex, todayDayIndex, cumulative, onOpenLog, statusColor, logs }: {
  dayIndex: number;
  todayDayIndex: number;
  cumulative: CumulativeInfo | null;
  onOpenLog: () => void;
  statusColor: string;
  logs: DailyLog[];
}) {
  const isToday = dayIndex === todayDayIndex;
  const isFuture = todayDayIndex >= 0 && dayIndex > todayDayIndex;
  const isPast = todayDayIndex >= 0 && dayIndex < todayDayIndex;
  const notCurrentWeek = todayDayIndex < 0;
  const hasData = cumulative !== null;
  const pct = cumulative?.percent ?? 0;

  // Check if log was added retroactively (logged_at date != the actual day)
  const exactLog = logs.find(l => l.day_index === dayIndex);
  const isRetroactive = useMemo(() => {
    if (!exactLog || !isPast) return false;
    // Compare logged_at date with the actual day
    const loggedDate = new Date(exactLog.logged_at);
    const actualDay = new Date();
    actualDay.setDate(actualDay.getDate() - (todayDayIndex - dayIndex));
    return loggedDate.toDateString() !== actualDay.toDateString();
  }, [exactLog, isPast, todayDayIndex, dayIndex]);

  let bg = "#ffffff";
  let border = "#e5e2dd";
  let borderStyle = "solid";
  let borderWidth = "1px";

  if (isFuture || notCurrentWeek) {
    bg = "#fafaf8";
    border = "#e5e2dd";
    borderStyle = "dashed";
  } else if (isToday) {
    bg = "rgba(58,138,54,0.03)";
    border = "#3a8a36";
    borderWidth = "2px";
  } else if (isPast && !cumulative?.hasLog) {
    bg = "#ffffff";
    border = "#e5a8a8";
    borderWidth = "1px";
  } else if (isPast && cumulative?.hasLog) {
    bg = "#ffffff";
    border = "#86c083";
  }

  const clickable = isToday || (isPast && !isFuture);

  return (
    <div
      className={`rounded-lg p-2 flex flex-col gap-1 transition-all ${clickable ? "cursor-pointer hover:shadow-sm" : ""}`}
      style={{
        background: bg,
        border: `${borderWidth} ${borderStyle} ${border}`,
        opacity: (isFuture ? 0.5 : (isPast && !cumulative?.hasLog) ? 0.6 : 1),
      }}
      onClick={clickable ? onOpenLog : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium" style={{ color: "#6b7280" }}>{DAY_NAMES[dayIndex]}</span>
        {isToday && (
          <span className="text-[7px] font-bold px-1 py-[1px] rounded" style={{ background: "rgba(58,138,54,0.15)", color: "#3a8a36" }}>DNES</span>
        )}
      </div>

      {hasData ? (
        <>
          <div className="flex items-center justify-between">
            <div className="text-xl font-mono font-bold" style={{ color: pct >= 100 ? "#3a8a36" : "#1a1a1a" }}>{pct}%</div>
            {isRetroactive && (
              <span className="text-[7px] font-bold px-1 py-[1px] rounded" style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626" }}>doplněno</span>
            )}
          </div>
          {cumulative?.phase && (
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: PHASES.find(p => p.name === cumulative.phase)?.color || "#6b7280" }} />
              <span className="text-[9px]" style={{ color: "#6b7280" }}>{cumulative.phase}</span>
            </div>
          )}
          {isToday && (
            <span className="mt-0.5 w-full text-[9px] font-medium py-0.5 rounded transition-colors text-center"
              style={{ background: "rgba(58,138,54,0.08)", color: "#3a8a36", border: "1px solid rgba(58,138,54,0.2)" }}>
              Upravit log
            </span>
          )}
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-1">
          {isPast && !isFuture ? (
            <span className="text-[9px]" style={{ color: "#fca5a5", opacity: 0.8 }}>bez logu</span>
          ) : isFuture ? (
            <span className="text-[11px]" style={{ color: "#d0cdc8" }}>–</span>
          ) : isToday ? (
            <span className="text-[9px] font-medium py-0.5 px-2 rounded transition-colors"
              style={{ background: "rgba(58,138,54,0.08)", color: "#3a8a36", border: "1px solid rgba(58,138,54,0.2)" }}>
              + Log dnes
            </span>
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
  const isMobile = useIsMobile();
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
    return all.filter(f => isImageFile(f.name)).sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
  }, [filesByCategory]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      // Auto-name: {project_id}-{slug}-Vyroba-{date}-{time}.{ext}
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const timeStr = `${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
      const ext = file.name.split(".").pop() || "jpg";
      const autoName = `${projectId}-${slugify(projectId)}-Vyroba-${dateStr}-${timeStr}.${ext}`;
      const renamedFile = new File([file], autoName, { type: file.type });
      try {
        await uploadFile("fotky", renamedFile);
        toast.success(`✓ ${autoName} nahráno`);
      } catch (err: any) {
        toast.error(err.message || "Upload selhal");
      }
    }
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
        <label className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium cursor-pointer transition-colors min-h-[36px]"
          style={{ background: "rgba(58,138,54,0.08)", color: "#3a8a36", border: "1px solid rgba(58,138,54,0.2)" }}>
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Přidat foto
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
            {...(isMobile ? { capture: "environment" as any } : {})}
          />
        </label>
      </div>

      {/* Photo grid */}
      {photos.length === 0 ? (
        <div className="h-16 rounded-md flex items-center justify-center text-xs" style={{ border: "1px dashed #e5e2dd", color: "#99a5a3" }}>
          Žádné fotky
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5" style={{ maxHeight: 200, overflowY: "auto" }}>
          {photos.map((photo, idx) => {
            const date = new Date(photo.lastModified);
            const dateLabel = `${date.getDate()}.${date.getMonth() + 1}.`;
            return (
              <div key={photo.itemId || photo.name} className="relative group cursor-pointer"
                onClick={() => { setLightboxIndex(idx); setLightboxOpen(true); }}>
                <div className="aspect-square rounded-md overflow-hidden" style={{ background: "#f0eeea" }}>
                  <img
                    src={photo.thumbnailUrl || photo.downloadUrl || ""}
                    alt={photo.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="text-[9px] text-center mt-0.5" style={{ color: "#99a5a3" }}>{dateLabel}</div>
                {/* Delete button on hover */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(photo.name); }}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: "rgba(0,0,0,0.6)" }}>
                  <X className="h-3 w-3 text-white" />
                </button>
              </div>
            );
          })}
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
