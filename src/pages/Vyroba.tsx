import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { usePeopleManagement } from "@/components/PeopleManagementContext";
import { useProductionSchedule, getISOWeekNumber, type ScheduleItem } from "@/hooks/useProductionSchedule";
import { useProductionDailyLogs, saveDailyLog, type DailyLog } from "@/hooks/useProductionDailyLogs";
import { useWeeklyCapacity } from "@/hooks/useWeeklyCapacity";
import { getProjectColor } from "@/lib/projectColors";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, ClipboardList,
  User, UserCog, Settings, Check, LogOut, LayoutDashboard, CalendarRange, Factory,
  CheckCircle2, X, Plus, Trash2, Loader2, Download, Printer, FileText,
  AlertTriangle, Camera, ArrowRight, Shield, Undo2, Redo2, Clock, Image as ImageIcon
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
import { ProductionContextMenu, type ContextMenuAction } from "@/components/production/ProductionContextMenu";
import { ProjectDetailDialog } from "@/components/ProjectDetailDialog";
import { PauseItemDialog } from "@/components/production/PauseItemDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQualityDefects, type QualityDefect } from "@/hooks/useQualityDefects";
import { logActivity } from "@/lib/activityLog";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { MobileHeader } from "@/components/mobile/MobileHeader";

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
  { name: "Řezání", color: "#f59e0b", pct: 15 },
  { name: "Dýha", color: "#e67e22", pct: 25 },
  { name: "CNC", color: "#6366f1", pct: 40 },
  { name: "Lakování", color: "#8b5cf6", pct: 55 },
  { name: "Kompletace", color: "#3b82f6", pct: 85 },
  { name: "Expedice", color: "#16a34a", pct: 95 },
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
  isPaused?: boolean;
  pauseReason?: string | null;
  pauseExpectedDate?: string | null;
  projectStatus?: string | null;
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

  const uncheckItem = useCallback(async (checkId: string) => {
    const { error } = await (supabase.from("production_quality_checks" as any) as any).delete().eq("id", checkId);
    if (error) throw error;
    refetch();
  }, [refetch]);

  return { checks, checkItem, uncheckItem };
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

/* ═══ swipe-to-dismiss hook ═══ */
function useDragToDismiss(onDismiss: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const isDragging = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    isDragging.current = true;
    if (ref.current) ref.current.style.transition = "none";
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const delta = Math.max(0, e.touches[0].clientY - startY.current);
    currentY.current = delta;
    if (ref.current) {
      ref.current.style.transform = `translateY(${delta}px)`;
      const height = ref.current.offsetHeight;
      const progress = Math.min(delta / (height * 0.5), 1);
      const backdrop = ref.current.closest('[role="dialog"]')?.previousElementSibling as HTMLElement;
      if (backdrop) backdrop.style.opacity = String(1 - progress);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    isDragging.current = false;
    if (!ref.current) return;
    const height = ref.current.offsetHeight;
    if (currentY.current > height * 0.3) {
      ref.current.style.transition = "transform 0.25s ease";
      ref.current.style.transform = `translateY(${height}px)`;
      const backdrop = ref.current.closest('[role="dialog"]')?.previousElementSibling as HTMLElement;
      if (backdrop) {
        backdrop.style.transition = "opacity 0.25s ease";
        backdrop.style.opacity = "0";
      }
      setTimeout(onDismiss, 250);
    } else {
      ref.current.style.transition = "transform 0.25s ease";
      ref.current.style.transform = "translateY(0)";
      const backdrop = ref.current.closest('[role="dialog"]')?.previousElementSibling as HTMLElement;
      if (backdrop) {
        backdrop.style.transition = "opacity 0.25s ease";
        backdrop.style.opacity = "1";
      }
    }
    currentY.current = 0;
  }, [onDismiss]);

  return { ref, onTouchStart, onTouchMove, onTouchEnd };
}

/* ═══ MAIN PAGE ═══ */
export default function Vyroba({ embedded = false }: { embedded?: boolean } = {}) {
  const { isOwner, isAdmin, isTestUser, loading, profile, signOut, canAccessSettings, canManageUsers, canManagePeople, canManageExchangeRates, canManageStatuses, canAccessRecycleBin, realRole, simulatedRole, setSimulatedRole, role } = useAuth();
  const { openPeopleManagement } = usePeopleManagement();
  const navigate = useNavigate();
  const location = useLocation();
  const openProjectIdFromState = (location.state as any)?.openProjectId as string | undefined;
  const qc = useQueryClient();
  const { pushUndo, undo, redo, canUndo, canRedo, lastUndoDescription, lastRedoDescription, setCurrentPage } = useUndoRedo();
  const isMobile = useIsMobile();

  // Set undo page context
  useEffect(() => {
    setCurrentPage("vyroba");
    return () => setCurrentPage(null);
  }, [setCurrentPage]);

  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [userMgmtOpen, setUserMgmtOpen] = useState(false);
  const [exchangeRateOpen, setExchangeRateOpen] = useState(false);
  const [statusMgmtOpen, setStatusMgmtOpen] = useState(false);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [costPresetsOpen, setCostPresetsOpen] = useState(false);
  const [dataLogOpen, setDataLogOpen] = useState(() => {
    try { return localStorage.getItem("datalog-panel-vyroba") === "true"; } catch { return false; }
  });
  const toggleDataLog = useCallback(() => {
    setDataLogOpen(prev => {
      const next = !prev;
      try { localStorage.setItem("datalog-panel-vyroba", String(next)); } catch {}
      return next;
    });
  }, []);
  const [capacitySettingsOpen, setCapacitySettingsOpen] = useState(false);

  // Owner/Admin/Tester guard
  const isTester = role === "tester";
  useEffect(() => {
    if (!loading && !isOwner && !isAdmin && !isTester) navigate("/", { replace: true });
  }, [loading, isOwner, isAdmin, isTester, navigate]);

  // Close all overlays when mobile bottom nav changes module
  useEffect(() => {
    const handler = () => {
      setMobileDetailOpen(false);
      setLogModalOpen(false);
      setNoProductionOpen(false);
      setDetailDialogOpen(false);
      setDataLogOpen(false);
      setCtxMenu(null);
      setWeekPickerOpen(false);
    };
    window.addEventListener("mobile-nav-change", handler);
    return () => window.removeEventListener("mobile-nav-change", handler);
  }, []);

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
        const isPaused = b.items.every(i => i.status === "paused");
        if (b.items.some(i => i.status === "scheduled" || i.status === "in_progress" || i.status === "paused" || i.status === "completed")) {
          result.push({
            projectId: b.project_id,
            projectName: b.project_name,
            totalHours: b.total_hours,
            scheduleItems: b.items,
            color: getProjectColor(b.project_id),
            isSpilled: false,
            isPaused,
            pauseReason: isPaused ? b.items[0]?.pause_reason : null,
            pauseExpectedDate: isPaused ? b.items[0]?.pause_expected_date : null,
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

    // Sort: spilled first, paused last
    result.sort((a, b) => {
      if (a.isPaused && !b.isPaused) return 1;
      if (!a.isPaused && b.isPaused) return -1;
      return (b.isSpilled ? 1 : 0) - (a.isSpilled ? 1 : 0);
    });
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
      return { ...p, pm: detail.pm, expedice: detail.expedice, deadline: deadlineDate, projectStatus: detail.status };
    });
  }, [projects, projectDetails]);

  // Capacity for this week
  const weekCapacity = useMemo(() => {
    if (!scheduleData) return { used: 0, total: 760 };
    const silo = scheduleData.get(weekKey);
    const used = silo ? silo.bundles.reduce((s, b) => {
      // Don't count paused items
      const activeHours = b.items.filter(i => i.status !== "paused" && i.status !== "cancelled").reduce((h, i) => h + i.scheduled_hours, 0);
      return s + activeHours;
    }, 0) : 0;
    return { used, total: 760 };
  }, [scheduleData, weekKey]);

  const capacityPct = weekCapacity.total > 0 ? Math.round((weekCapacity.used / weekCapacity.total) * 100) : 0;
  const capacityColor = capacityPct > 100 ? "#dc2626" : capacityPct > 85 ? "#d97706" : "#3a8a36";

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

  // Week picker
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const weekPickerRef = useRef<HTMLDivElement>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; projectId: string } | null>(null);

  // Project detail dialog
  const [detailProject, setDetailProject] = useState<any | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  // Close overlays on mobile nav change
  useEffect(() => {
    const handler = () => {
      setDataLogOpen(false);
      setMobileDetailOpen(false);
      setDetailDialogOpen(false);
      setDetailProject(null);
    };
    window.addEventListener("mobile-nav-change", handler);
    return () => window.removeEventListener("mobile-nav-change", handler);
  }, []);

  // Pause dialog
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [pauseTarget, setPauseTarget] = useState<{ id: string; name: string; code?: string | null }>({ id: "", name: "" });

  // Return from expedice confirm
  const [returnExpediceConfirm, setReturnExpediceConfirm] = useState<string | null>(null);

  // Dýha dismissal per project
  const [dyhaDismissed, setDyhaDismissed] = useState<Set<string>>(new Set());

  // Auto-select first
  useEffect(() => {
    if (enrichedProjects.length > 0 && !enrichedProjects.find(p => p.projectId === selectedProjectId)) {
      setSelectedProjectId(enrichedProjects[0].projectId);
    }
  }, [enrichedProjects, selectedProjectId]);

  // Handle openProjectId from DataLog navigation
  const openProjectIdHandled = useRef(false);
  useEffect(() => {
    if (openProjectIdFromState && !openProjectIdHandled.current && enrichedProjects.length > 0) {
      openProjectIdHandled.current = true;
      setSelectedProjectId(openProjectIdFromState);
      if (isMobile) {
        setMobileDetailOpen(true);
      }
      window.history.replaceState({}, "");
    }
  }, [openProjectIdFromState, enrichedProjects, isMobile]);

  // Log modal
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logDayIndex, setLogDayIndex] = useState(-1);
  const [logPhase, setLogPhase] = useState("Řezání");
  const [logPercent, setLogPercent] = useState(0);
  const [logNotes, setLogNotes] = useState("");
  const logNotesUndoStack = useRef<string[]>([]);
  const [hotovostTouched, setHotovostTouched] = useState(false);
  const [logPhaseWarning, setLogPhaseWarning] = useState<string | null>(null);
  const [noProductionOpen, setNoProductionOpen] = useState(false);
  const [noProductionReason, setNoProductionReason] = useState("dovolenka");

  // Expedice confirmation dialog
  const [expediceDialogOpen, setExpediceDialogOpen] = useState(false);

  // Spill dialog
  const [spillDialogOpen, setSpillDialogOpen] = useState(false);
  const [spillSelected, setSpillSelected] = useState<Set<string>>(new Set());
  const [spillFullHours, setSpillFullHours] = useState<Set<string>>(new Set());

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

  // Get ALL items for a project across ALL weeks (non-cancelled)
  function getAllItemsForProject(pid: string): { item: ScheduleItem; weekKey: string; weekNum: number }[] {
    if (!scheduleData) return [];
    const items: { item: ScheduleItem; weekKey: string; weekNum: number }[] = [];
    const seen = new Set<string>();
    for (const [wk, silo] of scheduleData) {
      for (const bundle of silo.bundles) {
        if (bundle.project_id !== pid) continue;
        for (const item of bundle.items) {
          if (item.status === "cancelled") continue;
          const dedupeKey = `${wk}::${item.id}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          items.push({ item, weekKey: wk, weekNum: silo.week_number });
        }
      }
    }
    return items;
  }

  // ── BUNDLE PROGRESS: prefer latest daily log percent, fallback to completed hours ──
  function getBundleProgress(pid: string): { totalHours: number; completedHours: number; bundleProgress: number } {
    const allItems = getAllItemsForProject(pid);
    const totalHours = allItems.reduce((s, e) => s + e.item.scheduled_hours, 0);
    const completedHours = allItems.filter(e => e.item.status === "completed").reduce((s, e) => s + e.item.scheduled_hours, 0);

    // Check daily logs for the latest percent — this reflects actual logged progress
    const latestLogPct = getLatestPercent(pid);
    const completionPct = totalHours > 0 ? Math.round((completedHours / totalHours) * 100) : 0;
    // Use whichever is higher: logged progress or completion-based progress
    const bundleProgress = Math.max(latestLogPct, completionPct);
    return { totalHours, completedHours, bundleProgress };
  }

  // ── WEEKLY GOAL: this week's hours / total hours across all weeks ──
  function getWeeklyGoal(pid: string): number {
    if (!scheduleData) return 100;
    let thisWeekHours = 0;
    let totalHours = 0;
    for (const [wk, silo] of scheduleData) {
      for (const bundle of silo.bundles) {
        if (bundle.project_id !== pid) continue;
        const activeHours = bundle.items
          .filter((i: ScheduleItem) => i.status !== "cancelled")
          .reduce((s: number, i: ScheduleItem) => s + i.scheduled_hours, 0);
        totalHours += activeHours;
        if (wk === weekKey) thisWeekHours += activeHours;
      }
    }
    if (totalHours <= 0) return 100;
    return Math.round((thisWeekHours / totalHours) * 100);
  }

  // ── Check if weekly goal is met (this week's completed hours >= this week's total hours) ──
  function isWeeklyGoalMet(pid: string): boolean {
    if (!scheduleData) return false;
    const silo = scheduleData.get(weekKey);
    if (!silo) return false;
    const bundle = silo.bundles.find(b => b.project_id === pid);
    if (!bundle) return false;
    const activeItems = bundle.items.filter(i => i.status !== "cancelled");
    const thisWeekHours = activeItems.reduce((s, i) => s + i.scheduled_hours, 0);
    const thisWeekCompleted = activeItems.filter(i => i.status === "completed").reduce((s, i) => s + i.scheduled_hours, 0);
    return thisWeekHours > 0 && thisWeekCompleted >= thisWeekHours;
  }

  // ── Check if ALL parts of an item_code are completed across ALL weeks ──
  function areAllPartsCompleted(pid: string, itemCode: string | null, itemName: string): boolean {
    if (!scheduleData) return false;
    const allItems = getAllItemsForProject(pid);
    const stripSuffix = (n: string) => n.replace(/\s*\(\d+\/\d+\)$/, '').trim();
    const matching = allItems.filter(e => {
      if (itemCode && e.item.item_code === itemCode) return true;
      if (!itemCode && stripSuffix(e.item.item_name) === stripSuffix(itemName)) return true;
      return false;
    });
    if (matching.length === 0) return false;
    return matching.every(e => e.item.status === "completed");
  }

  // ── Get incomplete parts info for an item_code across ALL weeks ──
  function getIncompletePartsInfo(pid: string, itemCode: string | null, itemName: string): { incomplete: number; total: number; weekNums: number[] } {
    if (!scheduleData) return { incomplete: 0, total: 0, weekNums: [] };
    const allItems = getAllItemsForProject(pid);
    const stripSuffix = (n: string) => n.replace(/\s*\(\d+\/\d+\)$/, '').trim();
    const matching = allItems.filter(e => {
      if (itemCode && e.item.item_code === itemCode) return true;
      if (!itemCode && stripSuffix(e.item.item_name) === stripSuffix(itemName)) return true;
      return false;
    });
    const incomplete = matching.filter(e => e.item.status !== "completed");
    const weekNums = [...new Set(incomplete.map(e => e.weekNum))];
    return { incomplete: incomplete.length, total: matching.length, weekNums };
  }

  function getExpectedPct(_dayIndex: number, weeklyGoal: number = 100): number {
    const today = new Date();
    const dow = today.getDay(); // 0=Sun..6=Sat
    const workingDaysElapsed = (dow === 0 || dow === 6) ? 5 : dow; // weekend → treat as Friday
    return Math.round(weeklyGoal * (workingDaysElapsed / 5));
  }

  function getProjectStatus(pid: string): "on-track" | "at-risk" | "behind" {
    const { bundleProgress } = getBundleProgress(pid);
    const goal = getWeeklyGoal(pid);
    if (bundleProgress >= goal) return "on-track";
    if (todayDayIndex < 0) return "on-track";
    const expected = getExpectedPct(todayDayIndex, goal);
    if (bundleProgress >= expected - 10) return "on-track";
    if (bundleProgress >= expected - 25) return "at-risk";
    return "behind";
  }

  /* ── Stats ── */
  const stats = useMemo(() => {
    const activeProjects = enrichedProjects.filter(p => !p.isPaused);
    const total = activeProjects.length;
    const avgPct = total > 0 ? Math.round(activeProjects.reduce((s, p) => s + getBundleProgress(p.projectId).bundleProgress, 0) / total) : 0;
    const onTrack = activeProjects.filter(p => getProjectStatus(p.projectId) === "on-track").length;
    const behind = activeProjects.filter(p => getProjectStatus(p.projectId) === "behind").length;
    const todayLogged = todayDayIndex >= 0 ? activeProjects.filter(p => getLogsForProject(p.projectId).some(l => l.day_index === todayDayIndex)).length : 0;
    return { total, avgPct, onTrack, behind, todayLogged };
  }, [enrichedProjects, dailyLogsMap, todayDayIndex, scheduleData]);

  /* ── Log modal ── */
  function openLogModal(dayIdx?: number) {
    if (!selectedProject) return;
    const di = dayIdx ?? todayDayIndex;
    setLogDayIndex(di);
    setLogPhaseWarning(null);
    setHotovostTouched(false);
    logNotesUndoStack.current = [];

    // Load log data specifically for the clicked day
    const logs = getLogsForProject(selectedProject.projectId);
    const existingLog = logs.find(l => l.day_index === di);

    if (existingLog) {
      // Day has an existing log — populate from it
      setLogPhase(existingLog.phase || "Řezání");
      setLogPercent(existingLog.percent);
      setLogNotes(existingLog.note_text || "");
    } else {
      // No log for this day — find most recent previous day's log
      const previousLogs = logs
        .filter(l => l.day_index < di)
        .sort((a, b) => b.day_index - a.day_index);
      const prevLog = previousLogs[0];
      if (prevLog) {
        // Pre-fill from previous day's values as starting point
        setLogPhase(prevLog.phase || "Řezání");
        setLogPercent(prevLog.percent);
      } else {
        // No previous logs at all — use current bundle progress
        setLogPhase("Řezání");
        setLogPercent(getLatestPercent(selectedProject.projectId));
      }
      setLogNotes("");
    }

    setLogModalOpen(true);
  }

  async function handleSaveLog() {
    if (!selectedProject || logDayIndex < 0) return;
    try {
      // Push undo for log note + phase change
      const existingLogs = getLogsForProject(selectedProject.projectId);
      const existingLog = existingLogs.find(l => l.day_index === logDayIndex);
      const prevPhase = getLatestPhase(selectedProject.projectId) || "Řezání";
      const prevPercent = getLatestPercent(selectedProject.projectId);
      const bId = bundleId(selectedProject.projectId);
      const capturedDay = logDayIndex;
      const capturedPhase = logPhase;
      const capturedPct = logPercent;
      const capturedNotes = logNotes || null;
      pushUndo({
        page: "vyroba",
        actionType: "phase_change",
        description: "změna fáze/logu",
        undo: async () => {
          if (existingLog) {
            await saveDailyLog(bId, weekKey, capturedDay, existingLog.phase || prevPhase, existingLog.percent, existingLog.note_text || null);
          } else {
            await (supabase.from("production_daily_logs") as any).delete().eq("bundle_id", bId).eq("day_index", capturedDay).eq("week_key", weekKey);
          }
          qc.invalidateQueries({ queryKey: ["production-daily-logs", weekKey] });
        },
        redo: async () => {
          await saveDailyLog(bId, weekKey, capturedDay, capturedPhase, capturedPct, capturedNotes);
          qc.invalidateQueries({ queryKey: ["production-daily-logs", weekKey] });
        },
      });

      await saveDailyLog(bId, weekKey, logDayIndex, logPhase, logPercent, logNotes || null);
      qc.invalidateQueries({ queryKey: ["production-daily-logs", weekKey] });
      
      // Log "Nad plán" activity if over weekly goal
      const wGoal = getWeeklyGoal(selectedProject.projectId);
      if (logPercent > wGoal) {
        const { data: { user: logUser } } = await supabase.auth.getUser();
        if (logUser) {
          await supabase.from("data_log").insert({
            project_id: selectedProject.projectId,
            user_id: logUser.id,
            action_type: "log_nad_plan",
            detail: `Nad plán: ${logPercent}% (cíl byl ${wGoal}%)`,
          });
        }
      }
      
      // Log vyroba_log_saved
      logActivity({ projectId: selectedProject.projectId, actionType: "vyroba_log_saved", newValue: `${logPercent}%`, detail: logPhase || "" });

      // Log phase_changed if phase changed
      const prevPhaseVal = getLatestPhase(selectedProject.projectId) || "Řezání";
      if (logPhase !== prevPhaseVal) {
        logActivity({ projectId: selectedProject.projectId, actionType: "phase_changed", oldValue: prevPhaseVal, newValue: logPhase, detail: `${logPercent}%` });
      }

      setLogModalOpen(false);
    } catch (err: any) {
      toast.error(`Chyba při ukládání logu: ${err?.message || "neznámá chyba"}`);
    }
  }

  /* ── Spill dialog ── */
  const nextWeekKey = weekKeyStr(addWeeks(currentMonday, 1));
  const nextWeekNum = getISOWeekNumber(addWeeks(currentMonday, 1));

  function openSpillDialog() {
    if (!selectedProject) return;
    const pct = getLatestPercent(selectedProject.projectId);
    const doneIds = new Set(selectedProject.scheduleItems.filter(i => i.status === "completed").map(i => i.id));
    const selected = new Set(
      selectedProject.scheduleItems
        .filter(i => i.status !== "cancelled" && !doneIds.has(i.id) && getRemainingHours(i, pct) > 0)
        .map(i => i.id)
    );
    setSpillSelected(selected);
    setSpillFullHours(new Set());
    setSpillDialogOpen(true);
  }

  function getRemainingHours(item: ScheduleItem, progressPct: number): number {
    return Math.round(item.scheduled_hours * (1 - progressPct / 100));
  }

  async function handleSpillConfirm() {
    if (!selectedProject || spillSelected.size === 0) {
      toast.error("Vyberte alespoň jednu položku");
      return;
    }
    const ids = Array.from(spillSelected);
    const pct = getLatestPercent(selectedProject.projectId);

    const prevWeeks = selectedProject.scheduleItems
      .filter(i => ids.includes(i.id))
      .map(i => ({ id: i.id, prevWeek: i.scheduled_week }));
    pushUndo({
      page: "vyroba",
      actionType: "move_items",
      description: `přesun ${ids.length} položek do T${nextWeekNum}`,
      undo: async () => {
        for (const pw of prevWeeks) {
          await supabase.from("production_schedule").update({ scheduled_week: pw.prevWeek }).eq("id", pw.id);
        }
        qc.invalidateQueries({ queryKey: ["production-schedule"] });
      },
      redo: async () => {
        for (const pw of prevWeeks) {
          await supabase.from("production_schedule").update({ scheduled_week: nextWeekKey }).eq("id", pw.id);
        }
        qc.invalidateQueries({ queryKey: ["production-schedule"] });
      },
    });

    const itemsToMove = selectedProject.scheduleItems.filter(i => ids.includes(i.id));
    let movedCount = 0;
    for (const item of itemsToMove) {
      const useFull = spillFullHours.has(item.id);
      const hours = useFull ? item.scheduled_hours : getRemainingHours(item, pct);
      if (hours <= 0) continue;
      const czk = useFull ? item.scheduled_czk : Math.round(item.scheduled_czk * (1 - pct / 100));
      const { error } = await supabase.from("production_schedule").insert({
        project_id: item.project_id,
        item_name: item.item_name,
        item_code: item.item_code,
        stage_id: item.stage_id,
        scheduled_week: nextWeekKey,
        scheduled_hours: hours,
        scheduled_czk: czk,
        status: "scheduled",
        is_blocker: false,
      });
      if (error) { toast.error(error.message); return; }
      movedCount++;
    }

    qc.invalidateQueries({ queryKey: ["production-schedule"] });
    toast.success(`⇒ ${movedCount} položek přesunuto do T${nextWeekNum}`, { duration: 2000 });
    if (selectedProject) {
      logActivity({ projectId: selectedProject.projectId, actionType: "item_moved_next_week", newValue: `T${nextWeekNum}`, detail: `${movedCount} položek` });
    }
    setSpillDialogOpen(false);
  }

  /* ── Expedice confirmation flow ── */
  function openExpediceDialog() {
    setExpediceDialogOpen(true);
  }

  async function handleConfirmExpedice() {
    if (!selectedProject) return;
    const allItems = selectedProject.scheduleItems;
    const prevStatus = selectedProject.projectStatus || "Ve výrobě";
    const snapshots = allItems.map(i => ({ id: i.id, prevStatus: i.status }));
    const pid = selectedProject.projectId;
    const pName = selectedProject.projectName;
    pushUndo({
      page: "vyroba",
      actionType: "expedice",
      description: `${pName} → Expedice`,
      undo: async () => {
        await supabase.from("projects").update({ status: prevStatus }).eq("project_id", pid);
        for (const snap of snapshots) {
          await supabase.from("production_schedule").update({ status: snap.prevStatus, completed_at: null, completed_by: null }).eq("id", snap.id);
        }
        qc.invalidateQueries({ queryKey: ["production-schedule"] });
        qc.invalidateQueries({ queryKey: ["projects"] });
        qc.invalidateQueries({ queryKey: ["vyroba-project-details"] });
      },
      redo: async () => {
        const { data: { user } } = await supabase.auth.getUser();
        const ids = snapshots.filter(s => s.prevStatus !== "completed" && s.prevStatus !== "cancelled").map(s => s.id);
        if (ids.length > 0) {
          await supabase.from("production_schedule").update({ status: "completed", completed_at: new Date().toISOString(), completed_by: user?.id || null }).in("id", ids);
        }
        await supabase.from("projects").update({ status: "Expedice" }).eq("project_id", pid);
        qc.invalidateQueries({ queryKey: ["production-schedule"] });
        qc.invalidateQueries({ queryKey: ["projects"] });
        qc.invalidateQueries({ queryKey: ["vyroba-project-details"] });
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    const activeItems = selectedProject.scheduleItems.filter(i => i.status !== "completed" && i.status !== "cancelled");
    if (activeItems.length > 0) {
      const ids = activeItems.map(i => i.id);
      await supabase.from("production_schedule").update({
        status: "completed", completed_at: new Date().toISOString(), completed_by: user?.id || null,
      }).in("id", ids);
    }
    await supabase.from("projects").update({ status: "Expedice" }).eq("project_id", pid);
    qc.invalidateQueries({ queryKey: ["production-schedule"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["vyroba-project-details"] });
    qc.invalidateQueries({ queryKey: ["production-statuses", pid] });
    toast.success(`✓ ${pName} odoslaný do Expedice`, { duration: 4000 });
    logActivity({ projectId: pid, actionType: "item_expedice", detail: "Odesláno do Expedice" });
    setExpediceDialogOpen(false);
  }

  /* ── Toggle single item complete ── */
  async function toggleItemComplete(itemId: string, currentStatus: string) {
    const newStatus = currentStatus === "completed" ? "scheduled" : "completed";
    pushUndo({
      page: "vyroba",
      actionType: "item_hotovo",
      description: newStatus === "completed" ? "označení jako hotovo" : "vrácení položky",
      undo: async () => {
        if (currentStatus === "completed") {
          const { data: { user } } = await supabase.auth.getUser();
          await supabase.from("production_schedule").update({ status: "completed", completed_at: new Date().toISOString(), completed_by: user?.id || null }).eq("id", itemId);
        } else {
          await supabase.from("production_schedule").update({ status: currentStatus, completed_at: null, completed_by: null }).eq("id", itemId);
        }
        qc.invalidateQueries({ queryKey: ["production-schedule"] });
      },
      redo: async () => {
        if (newStatus === "completed") {
          const { data: { user } } = await supabase.auth.getUser();
          await supabase.from("production_schedule").update({ status: "completed", completed_at: new Date().toISOString(), completed_by: user?.id || null }).eq("id", itemId);
        } else {
          await supabase.from("production_schedule").update({ status: "scheduled", completed_at: null, completed_by: null }).eq("id", itemId);
        }
        qc.invalidateQueries({ queryKey: ["production-schedule"] });
      },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (currentStatus === "completed") {
      await supabase.from("production_schedule").update({ status: "scheduled", completed_at: null, completed_by: null }).eq("id", itemId);
    } else {
      await supabase.from("production_schedule").update({
        status: "completed", completed_at: new Date().toISOString(), completed_by: user?.id || null,
      }).eq("id", itemId);
    }
    qc.invalidateQueries({ queryKey: ["production-schedule"] });
    // Log item hotovo
    if (newStatus === "completed" && selectedProject) {
      const item = selectedProject.scheduleItems.find(i => i.id === itemId);
      logActivity({ projectId: selectedProject.projectId, actionType: "item_hotovo", newValue: item?.item_code || item?.item_name || itemId, detail: "Označeno jako hotovo" });
    }
  }

  // Drag-to-dismiss hooks
  const dragMobileDetail = useDragToDismiss(useCallback(() => setMobileDetailOpen(false), []));
  const dragLogModal = useDragToDismiss(useCallback(() => setLogModalOpen(false), []));
  const dragNoProduction = useDragToDismiss(useCallback(() => setNoProductionOpen(false), []));


  /* ── Return from Expedice ── */
  async function handleReturnFromExpedice(pid: string) {
    const items = getAllItemsForProject(pid);
    const completedIds = items.filter(e => e.item.status === "completed").map(e => e.item.id);
    if (completedIds.length > 0) {
      await supabase.from("production_schedule").update({ status: "in_progress", completed_at: null, completed_by: null, expediced_at: null }).in("id", completedIds);
    }
    await supabase.from("projects").update({ status: "Ve výrobě" }).eq("project_id", pid);
    qc.invalidateQueries({ queryKey: ["production-schedule"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["vyroba-project-details"] });
    toast.success("↩ Vráceno z Expedice", { duration: 2000 });
    setReturnExpediceConfirm(null);
  }

  /* ── Context menu ── */
  function handleContextMenu(e: React.MouseEvent, pid: string) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, projectId: pid });
  }

  function getContextMenuActions(pid: string): ContextMenuAction[] {
    const p = enrichedProjects.find(pr => pr.projectId === pid);
    const actions: ContextMenuAction[] = [
      { label: "Zobrazit detail projektu", icon: "📋", onClick: () => openProjectDetail(pid) },
      { label: "Zobrazit položky", icon: "📦", onClick: () => { setSelectedProjectId(pid); } },
    ];
    if (p && !p.isPaused) {
      actions.push({
        label: "⏸ Pozastavit", icon: "⏸",
        onClick: () => {
          const allIds = p.scheduleItems.filter(i => i.status === "scheduled" || i.status === "in_progress").map(i => i.id);
          setPauseTarget({ id: allIds.join(","), name: p.projectName });
          setPauseDialogOpen(true);
        },
      });
    }
    if (p?.projectStatus === "Expedice") {
      actions.push({
        label: "↩ Vrátit z Expedice", icon: "↩",
        onClick: () => setReturnExpediceConfirm(pid),
        dividerBefore: true,
      });
    }
    return actions;
  }

  function openProjectDetail(pid: string) {
    const detail = projectDetails?.get(pid);
    if (detail) {
      setDetailProject({ ...detail, project_id: pid });
      setDetailDialogOpen(true);
    }
  }

  function handleSelectProject(pid: string) {
    setSelectedProjectId(pid);
    if (isMobile) setMobileDetailOpen(true);
  }

  /* ── No production today ── */
  async function handleNoProduction() {
    if (!selectedProject || logDayIndex < 0) return;
    try {
      const bId = bundleId(selectedProject.projectId);
      const capturedDay = logDayIndex;
      const capturedReason = noProductionReason;
      const capturedPct = getLatestPercent(selectedProject.projectId);
      pushUndo({
        page: "vyroba",
        actionType: "no_activity",
        description: "žádná aktivita",
        undo: async () => {
          await (supabase.from("production_daily_logs") as any).delete().eq("bundle_id", bId).eq("day_index", capturedDay).eq("week_key", weekKey);
          qc.invalidateQueries({ queryKey: ["production-daily-logs", weekKey] });
        },
        redo: async () => {
          await saveDailyLog(bId, weekKey, capturedDay, `Bez výroby: ${capturedReason}`, capturedPct);
          qc.invalidateQueries({ queryKey: ["production-daily-logs", weekKey] });
        },
      });
      await saveDailyLog(bId, weekKey, logDayIndex, `Bez výroby: ${noProductionReason}`, capturedPct);
      qc.invalidateQueries({ queryKey: ["production-daily-logs", weekKey] });
      logActivity({ projectId: selectedProject.projectId, actionType: "vyroba_no_activity", detail: noProductionReason });
      setNoProductionOpen(false);
      setLogModalOpen(false);
    } catch {
      toast.error("Chyba");
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Načítání...</p></div>;
  }
  if (!isOwner && !isAdmin && !isTester) return null;

  const statusColors = { "on-track": "#3a8a36", "at-risk": "#d97706", "behind": "#dc2626" };

  // Split projects into sections
  const spilledProjects = enrichedProjects.filter(p => p.isSpilled && !p.isPaused);
  const normalProjects = enrichedProjects.filter(p => !p.isSpilled && !p.isPaused);
  const pausedProjects = enrichedProjects.filter(p => p.isPaused);

  /* ═══ RENDER ═══ */
  return (
    <div className={cn(embedded ? "h-full flex flex-col overflow-hidden" : "h-screen flex flex-col overflow-hidden", !embedded && isMobile && "pb-[72px]")} style={{ background: "#f8f7f4" }}>
      {/* ═══ MOBILE HEADER ═══ */}
      {!embedded && isMobile && (
        <MobileHeader
          onDataLog={toggleDataLog}
          showDataLog={isAdmin || role === "pm" || isOwner}
        />
      )}
      {/* ═══ HEADER (desktop) ═══ */}
      <header className="border-b bg-primary px-4 md:px-6 py-4 shrink-0 z-50 hidden md:block">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 shrink-0">
            <h1 className="text-xl font-serif text-primary-foreground tracking-wide">
              A→M <span className="font-sans font-normal text-base opacity-80">Interior</span>
            </h1>
            <span className="text-primary-foreground/40 text-sm hidden md:inline">|</span>
            <span className="text-primary-foreground/70 text-sm font-sans hidden md:inline">Výroba</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Undo/Redo arrows */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => undo("vyroba")}
                  disabled={!canUndo("vyroba")}
                  className="p-2 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {canUndo("vyroba") ? `Zpět: ${lastUndoDescription("vyroba")}` : "Nic k vrácení"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => redo("vyroba")}
                  disabled={!canRedo("vyroba")}
                  className="p-2 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {canRedo("vyroba") ? `Obnovit: ${lastRedoDescription("vyroba")}` : "Nic k obnovení"}
              </TooltipContent>
            </Tooltip>

            <span className="w-px h-5 bg-primary-foreground/20 mx-1 hidden md:block" />

            <button className="p-2 rounded-md text-primary-foreground bg-primary-foreground/10 transition-colors cursor-default" title="Výroba">
              <Factory className="h-5 w-5" />
            </button>
            {(isAdmin || isOwner) && (
              <button onClick={() => navigate("/plan-vyroby")} className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors" title="Plán Výroby">
                <CalendarRange className="h-5 w-5" />
              </button>
            )}
            <button onClick={() => navigate("/")} className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors" title="Přehled">
              <LayoutDashboard className="h-5 w-5" />
            </button>

            {/* DataLog icon button */}
            {(isAdmin || role === "pm" || isOwner) && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleDataLog}
                    className={cn(
                      "p-2 rounded-md transition-colors",
                      dataLogOpen
                        ? "text-primary-foreground bg-primary-foreground/10"
                        : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                    )}
                    title="Data Log"
                  >
                    <Clock className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Data Log</TooltipContent>
              </Tooltip>
            )}

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

      {/* TEST MODE banner */}
      {isTestUser && (
        <div className="bg-orange-500 text-white px-6 flex items-center justify-center gap-2 font-bold tracking-wide shrink-0" style={{ height: 32 }}>
          <span>⚠ TEST MODE — Testovací prostředí — data nejsou produkční</span>
        </div>
      )}

      <div className="shrink-0 flex items-center gap-2 px-3 text-xs overflow-x-auto scrollbar-hide whitespace-nowrap" style={{ height: 40, background: "#f5f3f0", borderBottom: "1px solid #e5e2dd" }}>
        {isMobile ? (
          /* Mobile: compact single row */
          <>
            <div className="relative flex items-center gap-1" ref={weekPickerRef}>
              <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 rounded hover:bg-muted transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center" style={{ color: "#223937" }}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  if (weekOffset !== 0) {
                    setWeekOffset(0);
                  } else {
                    setWeekPickerOpen(o => !o);
                  }
                }}
                className={cn(
                  "font-mono select-none px-1.5 py-0.5 rounded hover:bg-muted transition-colors cursor-pointer font-bold",
                  weekOffset !== 0 && "underline decoration-dotted underline-offset-2"
                )}
                style={{ fontSize: 13, color: "#223937" }}
              >
                T{weekNum}
              </button>
              <button onClick={() => setWeekOffset(w => w + 1)} className="p-1 rounded hover:bg-muted transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center" style={{ color: "#223937" }}>
                <ChevronRight className="h-4 w-4" />
              </button>
              {weekPickerOpen && (
                <WeekPickerPopup
                  currentWeekOffset={weekOffset}
                  onSelectOffset={(offset) => { setWeekOffset(offset); setWeekPickerOpen(false); }}
                  onClose={() => setWeekPickerOpen(false)}
                  containerRef={weekPickerRef}
                />
              )}
            </div>
            <span className="w-px h-4" style={{ background: "#d0cdc8" }} />
            <span style={{ color: "#3a8a36", fontSize: 12 }}>✓ {stats.onTrack} on track</span>
            <span className="w-px h-4" style={{ background: "#d0cdc8" }} />
            <span style={{ color: "#dc2626", fontSize: 12 }}>⚠ {stats.behind} pozadu</span>
            <span className="w-px h-4" style={{ background: "#d0cdc8" }} />
            <span className="font-mono" style={{ color: "#2563eb", fontSize: 12 }}>ø {stats.avgPct}%</span>
          </>
        ) : (
          /* Desktop: full stats */
          <>
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
            <div className="flex-1" />
            <div className="relative flex items-center gap-1" ref={weekPickerRef}>
              <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 rounded hover:bg-muted transition-colors" style={{ color: "#223937" }}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setWeekPickerOpen(o => !o)}
                className="font-mono select-none px-1.5 py-0.5 rounded hover:bg-muted transition-colors cursor-pointer"
                style={{ fontSize: 13, color: "#223937" }}
              >
                T{weekNum} · {fmtDate(currentMonday)}–{fmtDate(friday)}{currentMonday.getFullYear()}
              </button>
              <button onClick={() => setWeekOffset(w => w + 1)} className="p-1 rounded hover:bg-muted transition-colors" style={{ color: "#223937" }}>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              {weekOffset !== 0 && (
                <button
                  onClick={() => setWeekOffset(0)}
                  className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
                  style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", fontSize: 11 }}
                >
                  Dnes
                </button>
              )}
              {weekPickerOpen && (
                <WeekPickerPopup
                  currentWeekOffset={weekOffset}
                  onSelectOffset={(offset) => { setWeekOffset(offset); setWeekPickerOpen(false); }}
                  onClose={() => setWeekPickerOpen(false)}
                  containerRef={weekPickerRef}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* ═══ BODY ═══ */}
      <div
        className="flex flex-1 min-h-0 overflow-hidden"
        {...(isMobile ? {
          onTouchStart: (e: React.TouchEvent) => {
            const t = e.touches[0];
            if (t.clientX < 30) return;
            (e.currentTarget as any)._swipeX = t.clientX;
            (e.currentTarget as any)._swipeT = Date.now();
          },
          onTouchEnd: (e: React.TouchEvent) => {
            const startX = (e.currentTarget as any)._swipeX;
            const startT = (e.currentTarget as any)._swipeT;
            if (startX == null) return;
            const diff = e.changedTouches[0].clientX - startX;
            const elapsed = Date.now() - startT;
            if (Math.abs(diff) > 80 && elapsed < 400) {
              const dir = diff > 0 ? -1 : 1;
              const el = e.currentTarget.querySelector('.week-content-area') as HTMLElement;
              if (el) {
                el.style.setProperty('--slide-dir', dir > 0 ? '30px' : '-30px');
                el.classList.remove('week-slide-enter');
                void el.offsetWidth;
                el.classList.add('week-slide-enter');
              }
              setWeekOffset(w => w + dir);
            }
            (e.currentTarget as any)._swipeX = null;
          },
        } : {})}
      >
      <div className="flex-1 min-w-0 flex min-h-0">
        {/* ═══ LEFT PANEL ═══ */}
        <div className={`shrink-0 flex flex-col overflow-y-auto week-content-area ${isMobile ? "w-full" : "w-[252px]"}`} style={{ borderRight: isMobile ? "none" : "1px solid #e5e2dd", background: isMobile ? "hsl(var(--background))" : "#ffffff", paddingTop: isMobile ? 8 : 0, paddingBottom: isMobile ? 100 : 0 }}>
          {/* Capacity bar — hidden on mobile */}
          {!isMobile && (
            <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid #f0eeea", background: "#fafaf8" }}>
              <span className="text-[10px] font-mono font-semibold" style={{ color: "#6b7280" }}>T{weekNum}</span>
              <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: "#e5e2dd" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(capacityPct, 100)}%`, background: capacityColor }} />
              </div>
              <span className="text-[10px] font-mono" style={{ color: capacityColor }}>{weekCapacity.used}h/{weekCapacity.total}h · {capacityPct}%</span>
            </div>
          )}

          <div className="px-3 py-1.5 text-[10px] uppercase font-semibold" style={{ color: "#6b7280", borderBottom: "1px solid #f0eeea" }}>
            Projekty v T{weekNum} ({enrichedProjects.filter(p => !p.isPaused).length})
          </div>

          {enrichedProjects.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-4 text-center">
              <span className="text-sm" style={{ color: "#99a5a3" }}>Žádné projekty v tomto týdnu</span>
            </div>
          ) : (
            <>
              {/* Spilled section */}
              {spilledProjects.length > 0 && (
                <div className="px-3 py-1 text-[9px] uppercase font-semibold" style={{ color: "#d97706", borderBottom: "1px solid #f0eeea" }}>
                  Přelité z minulého týdne ({spilledProjects.length})
                </div>
              )}
              {spilledProjects.map(p => (
                <ProjectRow key={p.projectId} project={p} isSelected={selectedProjectId === p.projectId}
                  onSelect={handleSelectProject} onContextMenu={handleContextMenu} getProjectStatus={getProjectStatus}
                  getBundleProgress={() => getBundleProgress(p.projectId)} getLatestPhase={getLatestPhase} statusColors={statusColors} weeklyGoal={getWeeklyGoal(p.projectId)} isMobile={isMobile} />
              ))}

              {/* Normal section */}
              {normalProjects.length > 0 && spilledProjects.length > 0 && (
                <div className="px-3 py-1 text-[9px] uppercase font-semibold" style={{ color: "#6b7280", borderBottom: "1px solid #f0eeea" }}>
                  Naplánované v T{weekNum} ({normalProjects.length})
                </div>
              )}
              {normalProjects.map(p => (
                <ProjectRow key={p.projectId} project={p} isSelected={selectedProjectId === p.projectId}
                  onSelect={handleSelectProject} onContextMenu={handleContextMenu} getProjectStatus={getProjectStatus}
                  getBundleProgress={() => getBundleProgress(p.projectId)} getLatestPhase={getLatestPhase} statusColors={statusColors} weeklyGoal={getWeeklyGoal(p.projectId)} isMobile={isMobile} />
              ))}

              {/* Paused section */}
              {pausedProjects.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[9px] uppercase font-semibold" style={{ color: "#99a5a3", borderBottom: "1px solid #f0eeea" }}>
                    ⏸ Pozastavené ({pausedProjects.length})
                  </div>
                  {pausedProjects.map(p => {
                    const isSelected = selectedProjectId === p.projectId;
                    const expectedDate = p.pauseExpectedDate ? new Date(p.pauseExpectedDate) : null;
                    const now = new Date();
                    const daysUntil = expectedDate ? Math.ceil((expectedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
                    const dateColor = daysUntil === null ? "#99a5a3" : daysUntil < 0 ? "#dc2626" : daysUntil <= 7 ? "#d97706" : "#3a8a36";
                    return (
                      <button
                        key={p.projectId}
                        onClick={() => handleSelectProject(p.projectId)}
                        onContextMenu={(e) => handleContextMenu(e, p.projectId)}
                        className="w-full text-left flex items-stretch transition-colors"
                        style={{
                          background: isSelected ? "#fafaf8" : "transparent",
                          borderBottom: "1px solid #f0eeea",
                          outline: isSelected ? "2px solid #99a5a3" : undefined,
                          outlineOffset: -2,
                          opacity: 0.7,
                        }}
                      >
                        <div className="w-[4px] shrink-0 rounded-r-sm" style={{ background: "#99a5a3" }} />
                        <div className="flex-1 px-2.5 py-[5px] min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate" style={{ fontSize: 14, fontWeight: 500, color: "#6b7280" }}>{p.projectName}</span>
                            <span className="text-[8px] font-bold px-1 py-[1px] rounded shrink-0" style={{ backgroundColor: "rgba(107,122,120,0.1)", color: "#6b7280" }}>⏸</span>
                            {daysUntil !== null && daysUntil < 0 && (
                              <span className="text-[8px] font-bold px-1 py-[1px] rounded shrink-0" style={{ backgroundColor: "rgba(220,38,38,0.1)", color: "#dc2626" }}>!</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono" style={{ fontSize: 11, color: "#99a5a3" }}>{p.projectId}</span>
                            {p.pauseReason && (
                              <>
                                <span style={{ fontSize: 11, color: "#d0cdc8" }}>·</span>
                                <span style={{ fontSize: 11, color: "#99a5a3" }}>{p.pauseReason}</span>
                              </>
                            )}
                            {expectedDate && (
                              <>
                                <span style={{ fontSize: 11, color: "#d0cdc8" }}>·</span>
                                <span style={{ fontSize: 11, color: dateColor }}>{fmtDateFull(expectedDate)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </>
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
                onSpillAll={openSpillDialog}
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
                pushUndo={pushUndo}
                onOpenProjectDetail={() => openProjectDetail(selectedProject.projectId)}
                dyhaDismissed={dyhaDismissed.has(selectedProject.projectId)}
                onDismissDyha={() => setDyhaDismissed(prev => new Set(prev).add(selectedProject.projectId))}
                weeklyGoal={getWeeklyGoal(selectedProject.projectId)}
                bundleProgress={getBundleProgress(selectedProject.projectId)}
                isWeeklyGoalMet={isWeeklyGoalMet(selectedProject.projectId)}
                areAllPartsCompleted={(itemCode, itemName) => areAllPartsCompleted(selectedProject.projectId, itemCode, itemName)}
                getIncompletePartsInfo={(itemCode, itemName) => getIncompletePartsInfo(selectedProject.projectId, itemCode, itemName)}
              />
            )}
          </div>
        )}
      </div>

      {/* ═══ MOBILE BOTTOM SHEET ═══ */}
      {isMobile && selectedProject && (
        <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
          <SheetContent
            side="bottom"
            className="h-[85vh] rounded-t-2xl p-0 overflow-hidden"
            style={{ paddingBottom: "calc(56px + env(safe-area-inset-bottom, 0px))", touchAction: "none" }}
            onTouchStart={(e: React.TouchEvent) => {
              const el = e.currentTarget as HTMLElement;
              el.dataset.startY = String(e.touches[0].clientY);
              el.style.transition = "none";
              const overlay = el.previousElementSibling as HTMLElement;
              if (overlay) overlay.style.transition = "none";
            }}
            onTouchMove={(e: React.TouchEvent) => {
              const el = e.currentTarget as HTMLElement;
              const startY = Number(el.dataset.startY);
              const delta = Math.max(0, e.touches[0].clientY - startY);
              el.style.transform = `translateY(${delta}px)`;
              const progress = Math.min(delta / (el.offsetHeight * 0.5), 1);
              const overlay = el.previousElementSibling as HTMLElement;
              if (overlay) overlay.style.opacity = String(1 - progress);
            }}
            onTouchEnd={(e: React.TouchEvent) => {
              const el = e.currentTarget as HTMLElement;
              const startY = Number(el.dataset.startY);
              const delta = e.changedTouches[0].clientY - startY;
              el.style.transition = "transform 0.25s ease";
              const overlay = el.previousElementSibling as HTMLElement;
              if (overlay) overlay.style.transition = "opacity 0.25s ease";
              if (delta > el.offsetHeight * 0.3) {
                el.style.transform = `translateY(${el.offsetHeight}px)`;
                if (overlay) overlay.style.opacity = "0";
                setTimeout(() => setMobileDetailOpen(false), 250);
              } else {
                el.style.transform = "translateY(0)";
                if (overlay) overlay.style.opacity = "1";
              }
            }}
          >
            <div ref={dragMobileDetail.ref} className="flex flex-col h-full">
              <div
                className="flex items-center justify-between px-4 pt-2 pb-1 shrink-0 cursor-grab active:cursor-grabbing"
                onTouchStart={dragMobileDetail.onTouchStart}
                onTouchMove={dragMobileDetail.onTouchMove}
                onTouchEnd={dragMobileDetail.onTouchEnd}
              >
                <button
                  onClick={() => setMobileDetailOpen(false)}
                  className="text-xs font-medium flex items-center gap-1 min-h-[36px]"
                  style={{ color: "#6b7280" }}
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Zpět
                </button>
                <div className="w-10 h-1 rounded-full" style={{ background: "#d0cdc8" }} />
                <div className="w-[50px]" />
              </div>
              <div className="flex-1 overflow-y-auto">
                <DetailPanel
                  project={selectedProject}
                  weekKey={weekKey}
                  currentMonday={currentMonday}
                  todayDayIndex={todayDayIndex}
                  onOpenLog={openLogModal}
                  nextWeekNum={nextWeekNum}
                  onSpillAll={openSpillDialog}
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
                  pushUndo={pushUndo}
                  onOpenProjectDetail={() => openProjectDetail(selectedProject.projectId)}
                  dyhaDismissed={dyhaDismissed.has(selectedProject.projectId)}
                  onDismissDyha={() => setDyhaDismissed(prev => new Set(prev).add(selectedProject.projectId))}
                  weeklyGoal={getWeeklyGoal(selectedProject.projectId)}
                  bundleProgress={getBundleProgress(selectedProject.projectId)}
                  isWeeklyGoalMet={isWeeklyGoalMet(selectedProject.projectId)}
                  areAllPartsCompleted={(itemCode, itemName) => areAllPartsCompleted(selectedProject.projectId, itemCode, itemName)}
                  getIncompletePartsInfo={(itemCode, itemName) => getIncompletePartsInfo(selectedProject.projectId, itemCode, itemName)}
                  hideLogButton
                />
              </div>
              {/* Fixed bottom Log button */}
              {todayDayIndex >= 0 && (
                <div className="shrink-0 px-4 py-3 border-t border-border bg-background">
                  <button
                    onClick={() => openLogModal()}
                    className="w-full py-2.5 rounded-md text-white text-sm font-medium transition-colors hover:opacity-90 min-h-[44px]"
                    style={{ background: "#3a8a36" }}
                  >
                    + Log dnes ({DAY_SHORT[todayDayIndex]})
                  </button>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* ═══ LOG MODAL ═══ */}
      {(() => {
        const logModalContent = (
          <>
            {/* Scrollable content */}
            <div className={isMobile ? "flex-1 overflow-y-auto px-4 pb-4" : ""}>
              <DialogHeader className={isMobile ? "pb-2" : ""}>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{selectedProject?.projectId}</span>
                  <span>{selectedProject?.projectName}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-5 py-2">
                <div>
                  <div className="text-xs font-semibold mb-2 text-muted-foreground">
                    {logDayIndex >= 0 ? DAY_NAMES[logDayIndex] : "Dnes"}{" "}
                    {(() => {
                      if (logDayIndex >= 0) {
                        const d = new Date(currentMonday);
                        d.setDate(d.getDate() + logDayIndex);
                        return `${d.getDate()}.${d.getMonth() + 1}.`;
                      }
                      const now = new Date();
                      return `${now.getDate()}.${now.getMonth() + 1}.`;
                    })()}{" "}
                    — Operace
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PHASES.map(p => (
                      <button key={p.name} onClick={() => {
                        setLogPhase(p.name);
                        if (!hotovostTouched) {
                          setLogPercent(p.pct);
                        }
                      }}
                        className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                        style={{
                          background: logPhase === p.name ? p.color : "hsl(var(--muted))",
                          color: logPhase === p.name ? "#fff" : "hsl(var(--foreground))",
                          border: `1px solid ${logPhase === p.name ? p.color : "hsl(var(--border))"}`,
                          cursor: "pointer",
                        }}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                  {logPhaseWarning && (
                    <div className="mt-1.5 text-[11px] font-medium text-destructive">
                      ⚠ {logPhaseWarning}
                    </div>
                  )}
                </div>
                {(() => {
                  const logWeeklyGoal = selectedProject ? getWeeklyGoal(selectedProject.projectId) : 100;
                  return (
                    <div>
                      <div className="text-xs font-semibold mb-2 text-muted-foreground">Celková hotovost</div>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <Slider min={0} max={100} step={5} value={[logPercent]} onValueChange={([v]) => {
                            setHotovostTouched(true);
                            setLogPercent(v);
                          }} />
                          <div className="flex justify-between text-[9px] mt-1 text-muted-foreground">
                            <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
                          </div>
                        </div>
                        <span className="text-2xl font-mono font-bold min-w-[60px] text-right" style={{ color: logPercent >= logWeeklyGoal ? "#3a8a36" : "hsl(var(--foreground))" }}>
                          {logPercent}%
                        </span>
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        Týdenní cíl: <span className="font-semibold" style={{ color: logPercent >= logWeeklyGoal ? "#3a8a36" : "#d97706" }}>{logWeeklyGoal}%</span> · Celkem: 100%
                      </div>
                      {logPercent > logWeeklyGoal && (
                        <div className="mt-1 text-[10px] font-medium" style={{ color: "#3a8a36" }}>
                          🎉 Nad plán! Výborně!
                        </div>
                      )}
                      {hotovostTouched && (
                        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span>% ručně nastaveno — operace nezmění hodnotu</span>
                          <button
                            className="font-medium underline"
                            style={{ color: "#d97706" }}
                            onClick={() => {
                              setHotovostTouched(false);
                              const phasePct = PHASES.find(p => p.name === logPhase)?.pct || 0;
                              setLogPercent(phasePct);
                            }}
                          >× Reset</button>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Poznámky section */}
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-medium mb-1 text-muted-foreground">Poznámky</div>
                  <textarea
                    value={logNotes}
                    onChange={e => {
                      logNotesUndoStack.current = [...logNotesUndoStack.current.slice(-49), logNotes];
                      setLogNotes(e.target.value);
                    }}
                    onKeyDown={e => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (logNotesUndoStack.current.length > 0) {
                          const prev = logNotesUndoStack.current[logNotesUndoStack.current.length - 1];
                          logNotesUndoStack.current = logNotesUndoStack.current.slice(0, -1);
                          setLogNotes(prev);
                        }
                      }
                    }}
                    placeholder="Čeho jste dnes dosáhli? Problémy, poznámky..."
                    className="w-full h-20 text-xs rounded-md p-2 resize-none border border-input bg-background"
                  />
                </div>

                {/* Foto section */}
                <div>
                  <VyrobaPhotoTab projectId={selectedProject?.projectId || ""} />
                </div>
              </div>
            </div>

            {/* Fixed footer */}
            <div className={isMobile ? "shrink-0 px-4 py-3 border-t border-border bg-background space-y-2" : ""}>
              <DialogFooter className={isMobile ? "flex-col gap-2" : "flex-col sm:flex-row gap-2"}>
                {logDayIndex === todayDayIndex && (
                  <Button variant="outline" onClick={() => setNoProductionOpen(true)} className="text-xs">
                    Dnes nebyla výroba
                  </Button>
                )}
                {!isMobile && <div className="flex-1" />}
                <Button variant="outline" onClick={() => setLogModalOpen(false)}>Zrušit</Button>
                <Button onClick={handleSaveLog} style={{ background: "#3a8a36" }} className="text-white">
                  💾 Uložit
                </Button>
              </DialogFooter>
            </div>
          </>
        );

        if (isMobile) {
          return (
            <Sheet open={logModalOpen} onOpenChange={setLogModalOpen}>
              <SheetContent side="bottom" className="rounded-t-2xl p-0 flex flex-col" style={{ maxHeight: "92dvh", paddingBottom: "calc(56px + env(safe-area-inset-bottom, 0px))" }}>
                <div className="flex justify-center pt-2 pb-1 shrink-0">
                  <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
                </div>
                {logModalContent}
              </SheetContent>
            </Sheet>
          );
        }

        return (
          <Dialog open={logModalOpen} onOpenChange={setLogModalOpen}>
            <DialogContent className="sm:max-w-md p-0 gap-0">
              {logModalContent}
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ═══ NO PRODUCTION DIALOG ═══ */}
      <Dialog open={noProductionOpen} onOpenChange={setNoProductionOpen}>
        <DialogContent
          className={isMobile ? "p-0 gap-0 border-0 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:!slide-in-from-top-0 data-[state=closed]:!slide-out-to-top-0" : "sm:max-w-xs"}
          style={isMobile ? {
            position: "fixed",
            top: "auto",
            bottom: "calc(56px + env(safe-area-inset-bottom, 0px))",
            left: 0,
            right: 0,
            width: "100%",
            maxWidth: "100%",
            borderRadius: "16px 16px 0 0",
            margin: 0,
            transform: "none",
          } : undefined}
        >
          <div ref={dragNoProduction.ref} className={isMobile ? "flex flex-col" : "contents"}>
            {isMobile && (
              <div
                className="flex items-center justify-center pt-2 pb-1 shrink-0 cursor-grab active:cursor-grabbing"
                onTouchStart={dragNoProduction.onTouchStart}
                onTouchMove={dragNoProduction.onTouchMove}
                onTouchEnd={dragNoProduction.onTouchEnd}
              >
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>
            )}
            <div className={isMobile ? "px-4 pb-4" : ""}>
              <DialogHeader><DialogTitle>Důvod bez výroby</DialogTitle></DialogHeader>
              <div className="space-y-2 py-2">
                {["dovolenka", "nemoc", "čeká na materiál", "jiný důvod"].map(r => (
                  <label key={r} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={noProductionReason === r} onChange={() => setNoProductionReason(r)} className="accent-amber-600" />
                    <span className="text-sm capitalize">{r}</span>
                  </label>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNoProductionOpen(false)}>Zrušit</Button>
                <Button onClick={handleNoProduction}>Potvrdit</Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ EXPEDICE CONFIRMATION DIALOG ═══ */}
      <Dialog open={expediceDialogOpen} onOpenChange={setExpediceDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Přesunout do Expedice?</DialogTitle>
          </DialogHeader>
          {(() => {
            if (!selectedProject) return null;
            const allItemsForProject = getAllItemsForProject(selectedProject.projectId);
            const incompleteItems = allItemsForProject.filter(e => e.item.status !== "completed");
            const hasIncomplete = incompleteItems.length > 0;
            const incompleteWeeks = [...new Set(incompleteItems.map(e => e.weekNum))];
            return (
              <div className="space-y-3">
                <p className="text-sm" style={{ color: "#6b7280" }}>
                  Projekt <strong>{selectedProject.projectName}</strong> bude přesunut do Expedice.
                </p>
                {hasIncomplete && (
                  <div className="rounded-md px-3 py-2 text-[12px]" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)" }}>
                    <div className="font-semibold" style={{ color: "#dc2626" }}>
                      ⚠ {incompleteItems.length} nedokončených částí v T{incompleteWeeks.join(", T")}
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: "#92400e" }}>
                      Nedokončené části zůstanou v plánu.
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {!hasIncomplete && (
                    <Button onClick={handleConfirmExpedice} style={{ background: "#3a8a36" }} className="w-full">
                      Ano — přesunout do Expedice
                    </Button>
                  )}
                  {hasIncomplete && (
                    <Button onClick={handleConfirmExpedice} variant="outline" className="w-full text-xs" style={{ borderColor: "#dc2626", color: "#dc2626" }}>
                      Expedovat jen dokončené části
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setExpediceDialogOpen(false)} className="w-full">
                    Ne
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ═══ SPILL DIALOG ═══ */}
      <Dialog open={spillDialogOpen} onOpenChange={setSpillDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Přesunout do T{nextWeekNum}</DialogTitle>
          </DialogHeader>
          {selectedProject && (() => {
            const rawItems = selectedProject.scheduleItems.filter(i => i.status !== "cancelled");
            const pct = getLatestPercent(selectedProject.projectId);

            // Deduplicate spill items by item_code
            const spillMergeKey = (i: ScheduleItem) => i.item_code ? `code::${i.item_code}` : `name::${i.item_name}`;
            const spillGrouped = new Map<string, { item: ScheduleItem; mergedIds: string[]; totalHours: number }>();
            for (const item of rawItems) {
              const key = spillMergeKey(item);
              const existing = spillGrouped.get(key);
              if (existing) {
                existing.totalHours += item.scheduled_hours;
                existing.mergedIds.push(item.id);
                existing.item = { ...existing.item, item_name: existing.item.item_name.replace(/\s*\(\d+\/\d+\)$/, '').trim(), scheduled_hours: existing.totalHours };
              } else {
                spillGrouped.set(key, { item: { ...item, item_name: item.item_name.replace(/\s*\(\d+\/\d+\)$/, '').trim() }, mergedIds: [item.id], totalHours: item.scheduled_hours });
              }
            }
            const allItems = Array.from(spillGrouped.values());

            const nextSilo = scheduleData?.get(nextWeekKey);
            const nextUsed = nextSilo ? nextSilo.bundles.reduce((s, b) => s + b.total_hours, 0) : 0;

            // Calculate selected hours respecting full-hours toggle (check any merged id)
            const selectedHoursToMove = allItems
              .filter(g => g.mergedIds.some(id => spillSelected.has(id)))
              .reduce((s, g) => {
                const useFull = g.mergedIds.some(id => spillFullHours.has(id));
                if (useFull) return s + g.totalHours;
                return s + Math.round(g.totalHours * (1 - pct / 100));
              }, 0);

            const nextTotal = nextUsed + selectedHoursToMove;
            const nextPct = Math.round((nextTotal / 760) * 100);
            const nextColor = nextPct > 100 ? "#dc2626" : nextPct > 80 ? "#d97706" : "#3a8a36";

            return (
              <div className="space-y-3 py-1">
                {/* Progress summary header */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px]" style={{ background: "hsl(var(--muted))" }}>
                  <span style={{ color: "hsl(var(--muted-foreground))" }}>Bundle:</span>
                  <span className="font-semibold" style={{ color: "hsl(var(--foreground))" }}>{pct}% dokončeno</span>
                  <span style={{ color: "hsl(var(--muted-foreground))" }}>·</span>
                  <span style={{ color: "hsl(var(--muted-foreground))" }}>Přesouvám zbývající kapacitu</span>
                </div>

                {/* Item checklist */}
                <div className="space-y-1 max-h-[320px] overflow-y-auto">
                  {allItems.map(({ item, mergedIds: mids, totalHours }) => {
                    const isDone = mids.every(id => {
                      const orig = rawItems.find(ri => ri.id === id);
                      return orig?.status === "completed";
                    });
                    const remaining = Math.round(totalHours * (1 - pct / 100));
                    const isFull = mids.some(id => spillFullHours.has(id));
                    const isSelected = mids.some(id => spillSelected.has(id));
                    const hoursShown = isFull ? totalHours : remaining;

                    return (
                      <div
                        key={mids.join("-")}
                        className="flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer select-none"
                        style={{
                          border: `1px solid ${isDone ? "hsl(var(--border))" : isFull ? "rgba(217,119,6,0.4)" : "hsl(var(--border))"}`,
                          background: isDone ? "hsl(var(--muted))" : isFull ? "rgba(217,119,6,0.06)" : isSelected ? "rgba(217,119,6,0.03)" : "hsl(var(--card))",
                          opacity: isDone ? 0.5 : 1,
                        }}
                        onClick={() => {
                          if (isDone) return;
                          setSpillSelected(prev => {
                            const next = new Set(prev);
                            const allIn = mids.every(id => next.has(id));
                            if (allIn) mids.forEach(id => next.delete(id));
                            else mids.forEach(id => next.add(id));
                            return next;
                          });
                        }}
                      >
                        <Checkbox
                          className="h-4 w-4 shrink-0"
                          checked={isSelected}
                          disabled={isDone}
                          onCheckedChange={() => {}}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {item.item_code && <span className="font-mono text-[10px] font-bold" style={{ color: "hsl(var(--foreground))" }}>{item.item_code}</span>}
                            <span className="text-[12px] truncate min-w-0 flex-1" style={{ color: "hsl(var(--foreground))" }}>{item.item_name}</span>
                            {mids.length > 1 && (
                              <span className="text-[9px] font-medium px-1 py-[1px] rounded shrink-0" style={{ background: "rgba(217,119,6,0.1)", color: "#d97706" }}>
                                {mids.length} částí
                              </span>
                            )}
                          </div>
                          {isDone ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded mt-0.5" style={{ background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>Hotovo</span>
                          ) : (
                            <span className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))" }}>
                              {isFull
                                ? <span className="font-semibold" style={{ color: "#d97706" }}>{totalHours}h (plná kapacita)</span>
                                : <>{remaining}h zbývá (z {totalHours}h)</>
                              }
                            </span>
                          )}
                        </div>
                        {/* Hours badge */}
                        <span className="font-mono text-[11px] font-semibold shrink-0 px-1.5 py-0.5 rounded" style={{
                          color: isDone ? "hsl(var(--muted-foreground))" : isFull ? "#92400e" : "#d97706",
                          background: isDone ? "transparent" : isFull ? "rgba(217,119,6,0.12)" : "transparent",
                        }}>
                          {isDone ? "—" : `${hoursShown}h`}
                        </span>
                        {/* Full capacity toggle */}
                        {!isDone && (
                          <button
                            className="text-[10px] font-medium px-2 py-1 rounded shrink-0 transition-colors"
                            style={{
                              background: isFull ? "#d97706" : "hsl(var(--muted))",
                              color: isFull ? "#fff" : "hsl(var(--muted-foreground))",
                              border: isFull ? "1px solid #d97706" : "1px solid hsl(var(--border))",
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              const allInFull = mids.every(id => spillFullHours.has(id));
                              setSpillFullHours(prev => {
                                const next = new Set(prev);
                                if (allInFull) mids.forEach(id => next.delete(id));
                                else mids.forEach(id => next.add(id));
                                return next;
                              });
                              if (!allInFull) {
                                setSpillSelected(prev => {
                                  const next = new Set(prev);
                                  mids.forEach(id => next.add(id));
                                  return next;
                                });
                              }
                            }}
                          >
                            Plná kapacita
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Capacity bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex-1 h-[6px] rounded-full overflow-hidden" style={{ background: "hsl(var(--border))" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(nextPct, 100)}%`, background: nextColor }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>
                      T{nextWeekNum}: <span className="font-semibold" style={{ color: nextColor }}>{selectedHoursToMove}h přidáno</span> · {nextTotal}h / 760h celkem
                    </span>
                    <span className="font-mono font-semibold" style={{ color: nextColor }}>{nextPct}% využito</span>
                  </div>
                  {nextPct > 100 && (
                    <div className="flex items-center gap-1 text-[11px] px-2 py-1 rounded" style={{ background: "rgba(220,38,38,0.06)", color: "#dc2626" }}>
                      <AlertTriangle className="h-3 w-3" /> Překročí kapacitu cílového týdne
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSpillDialogOpen(false)}>Zrušit</Button>
            <Button onClick={handleSpillConfirm} disabled={spillSelected.size === 0} style={{ background: "#d97706" }}>
              Přesunout {spillSelected.size} položek
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ CONTEXT MENU ═══ */}
      {ctxMenu && (
        <ProductionContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          actions={getContextMenuActions(ctxMenu.projectId)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* ═══ PAUSE DIALOG ═══ */}
      <PauseItemDialog
        open={pauseDialogOpen}
        onOpenChange={setPauseDialogOpen}
        itemId={pauseTarget.id}
        itemName={pauseTarget.name}
        itemCode={pauseTarget.code}
        source="schedule"
      />

      {/* ═══ PROJECT DETAIL DIALOG ═══ */}
      {detailProject && (
        <ProjectDetailDialog
          project={detailProject}
          open={detailDialogOpen}
          onOpenChange={(open) => { setDetailDialogOpen(open); if (!open) setDetailProject(null); }}
        />
      )}

      {/* ═══ RETURN FROM EXPEDICE CONFIRM ═══ */}
      <ConfirmDialog
        open={!!returnExpediceConfirm}
        onConfirm={() => returnExpediceConfirm && handleReturnFromExpedice(returnExpediceConfirm)}
        onCancel={() => setReturnExpediceConfirm(null)}
        title="Vrátit z Expedice?"
        description="Projekt bude vrácen do výroby a všechny položky budou nastaveny na 'in_progress'."
        confirmLabel="Vrátit"
        cancelLabel="Zrušit"
        variant="default"
      />

      <AccountSettings open={accountSettingsOpen} onOpenChange={setAccountSettingsOpen} />
      <UserManagement open={userMgmtOpen} onOpenChange={setUserMgmtOpen} />
      <ExchangeRateSettings open={exchangeRateOpen} onOpenChange={setExchangeRateOpen} />
      <StatusManagement open={statusMgmtOpen} onOpenChange={setStatusMgmtOpen} />
      <RecycleBin open={recycleBinOpen} onOpenChange={setRecycleBinOpen} />
      <CostBreakdownPresetsDialog open={costPresetsOpen} onOpenChange={setCostPresetsOpen} />
      <CapacitySettings open={capacitySettingsOpen} onOpenChange={setCapacitySettingsOpen} />
      <div className={cn("transition-all duration-200 ease-in-out overflow-hidden shrink-0", dataLogOpen ? "w-[360px] border-l border-border" : "w-0")}>
        {dataLogOpen && <DataLogPanel open={dataLogOpen} onOpenChange={setDataLogOpen} defaultCategory="vyroba" />}
      </div>
      </div>{/* end outer flex */}
      {!embedded && isMobile && <MobileBottomNav />}
    </div>
  );
}

/* ═══════════════════════════════════════ */
/* PROJECT ROW (left panel)                */
/* ═══════════════════════════════════════ */

function ProjectRow({ project, isSelected, onSelect, onContextMenu, getProjectStatus, getBundleProgress: getBP, getLatestPhase, statusColors, weeklyGoal = 100, isMobile = false }: {
  project: VyrobaProject;
  isSelected: boolean;
  onSelect: (pid: string) => void;
  onContextMenu: (e: React.MouseEvent, pid: string) => void;
  getProjectStatus: (pid: string) => "on-track" | "at-risk" | "behind";
  getBundleProgress: () => { totalHours: number; completedHours: number; bundleProgress: number };
  getLatestPhase: (pid: string) => string | null;
  statusColors: Record<string, string>;
  weeklyGoal?: number;
  isMobile?: boolean;
}) {
  const status = getProjectStatus(project.projectId);
  const { bundleProgress: pct } = getBP();
  const phase = getLatestPhase(project.projectId);
  const borderColor = project.color;

  // Goal-based color logic
  const goalDiff = pct - weeklyGoal;
  const progressColor = goalDiff >= 0 ? "#3a8a36" : goalDiff >= -10 ? "#d97706" : "#dc2626";

  // Deadline urgency color for project name
  const now = new Date();
  const deadlinePast = project.deadline && project.deadline < now;
  const deadlineSoon = project.deadline && !deadlinePast && project.deadline.getTime() - now.getTime() < 14 * 24 * 60 * 60 * 1000;
  const nameColor = deadlinePast ? "#dc2626" : deadlineSoon ? "#d97706" : "#1a1a1a";

  return (
    <div className="overflow-hidden" style={{
      borderRadius: isMobile ? 10 : 8,
      margin: isMobile ? "0 12px 8px 12px" : "0 6px 4px 6px",
      backgroundColor: isSelected ? "rgba(217,119,6,0.04)" : "#ffffff",
      border: isMobile
        ? (isSelected ? "2px solid #d97706" : "0.5px solid #e5e3df")
        : (isSelected ? "2px solid #d97706" : "1px solid hsl(var(--border))"),
      borderLeft: isSelected ? "4px solid #d97706" : `4px solid ${borderColor}`,
      boxShadow: isSelected ? "0 0 0 2px rgba(217,119,6,0.15)" : "none",
      transition: "border-color 150ms, box-shadow 150ms",
    }}>
      <button
        onClick={() => onSelect(project.projectId)}
        onContextMenu={(e) => onContextMenu(e, project.projectId)}
        className="w-full flex items-center gap-1.5 text-left transition-colors"
        style={{ padding: isMobile ? 12 : "5px 10px" }}
        onMouseEnter={(e) => !isMobile && (e.currentTarget.style.backgroundColor = "#f8f7f5")}
        onMouseLeave={(e) => !isMobile && (e.currentTarget.style.backgroundColor = "transparent")}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate" style={{ fontSize: 14, fontWeight: 500, color: nameColor }}>{project.projectName}</span>
              {project.isSpilled && (
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
            <span className="font-mono" style={{ fontSize: 11, color: "#6b7280" }}>{project.projectId}</span>
            {project.deadline && (
              <span style={{ fontSize: 11, color: "#6b7280" }}>· {fmtDateFull(project.deadline)}</span>
            )}
            {phase && (
              <span style={{ fontSize: 11, color: PHASES.find(ph => ph.name === phase)?.color || "#6b7280", fontWeight: 500 }}>· {phase}</span>
            )}
          </div>
          <div className="mt-1.5 relative">
            <div className="h-[3px] rounded-full overflow-hidden" style={{ background: "hsl(var(--border))" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: progressColor }} />
            </div>
            {/* Weekly goal marker — teal */}
            {weeklyGoal < 100 && (
              <div className="absolute top-[-1px] h-[5px] w-[1.5px] rounded-full" style={{ left: `${weeklyGoal}%`, background: "#0d9488", opacity: 0.8 }} />
            )}
            {/* Expected progress marker — blue/muted */}
            {(() => {
              const now = new Date();
              const dow = now.getDay();
              const wde = (dow === 0 || dow === 6) ? 5 : dow;
              const exp = Math.round(weeklyGoal * (wde / 5));
              return exp > 0 && exp < 100 ? (
                <div className="absolute top-[-1px] h-[5px] w-[1.5px] rounded-full" style={{ left: `${exp}%`, background: "#6b7280", opacity: 0.5 }} />
              ) : null;
            })()}
          </div>
        </div>
      </button>
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

function DetailPanel({ project, weekKey, currentMonday, todayDayIndex, onOpenLog, nextWeekNum, onSpillAll, onOpenExpedice, onToggleItem, getCumulativeForDay, getExpectedPct, status, latestPct, latestPhase, logs, expandedMap, setExpandedMap, bundleId, allItems, scheduleData, pushUndo, onOpenProjectDetail, dyhaDismissed, onDismissDyha, weeklyGoal, bundleProgress, isWeeklyGoalMet, areAllPartsCompleted, getIncompletePartsInfo, hideLogButton = false }: {
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
  getExpectedPct: (dayIndex: number, weeklyGoal?: number) => number;
  status: "on-track" | "at-risk" | "behind";
  latestPct: number;
  latestPhase: string | null;
  logs: DailyLog[];
  expandedMap: Record<string, boolean>;
  setExpandedMap: (fn: (m: Record<string, boolean>) => Record<string, boolean>) => void;
  bundleId: string;
  allItems: { item: ScheduleItem; weekKey: string; weekNum: number }[];
  scheduleData: Map<string, any> | undefined;
  pushUndo: (entry: Omit<import("@/hooks/useUndoRedo").UndoEntry, "id" | "timestamp">) => void;
  onOpenProjectDetail: () => void;
  dyhaDismissed: boolean;
  onDismissDyha: () => void;
  weeklyGoal: number;
  bundleProgress: { totalHours: number; completedHours: number; bundleProgress: number };
  isWeeklyGoalMet: boolean;
  areAllPartsCompleted: (itemCode: string | null, itemName: string) => boolean;
  getIncompletePartsInfo: (itemCode: string | null, itemName: string) => { incomplete: number; total: number; weekNums: number[] };
  hideLogButton?: boolean;
}) {
  const isMobile = useIsMobile();
  const expectedPct = todayDayIndex >= 0 ? getExpectedPct(todayDayIndex, weeklyGoal) : 0;
  const isExpanded = expandedMap[bundleId] ?? true;
  const statusColors = { "on-track": "#3a8a36", "at-risk": "#d97706", "behind": "#dc2626" };
  const statusLabels = { "on-track": "On track", "at-risk": "At risk", "behind": "Pozadu" };
  const statusColor = statusColors[status];

  // QC checks for hotové section
  const { checks: hotoveChecks } = useQualityChecks(project.projectId);
  const hotoveCheckMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of hotoveChecks) m.set(c.item_id, c);
    return m;
  }, [hotoveChecks]);

  // Collapsible states for sections
  const [futureOpen, setFutureOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);

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
        current.push(entry);
      }
    }
    return { currentItems: current, futureItems: future, completedItems: completed };
  }, [allItems, weekKey]);

  // Auto-expand Hotové when Aktuální has 0 items but progress > 0
  const autoExpandHotove = currentItems.length === 0 && bundleProgress.bundleProgress > 0;
  useEffect(() => {
    if (autoExpandHotove) setCompletedOpen(true);
  }, [autoExpandHotove]);

  const totalActiveItems = currentItems.length + futureItems.length + completedItems.length;

  // PM initials
  const pmInitials = project.pm ? project.pm.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) : null;

  // Future weeks summary
  const futureWeekNums = [...new Set(futureItems.map(i => i.weekNum))].sort();

  // Show Dýha warning
  const showDyhaWarning = latestPhase === "Dýha" && !dyhaDismissed;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Header ── */}
      <div className="shrink-0 px-5 py-3" style={{ background: "#ffffff", borderBottom: "1px solid #e5e2dd" }}>
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <button onClick={onOpenProjectDetail} className="font-mono text-xs hover:underline cursor-pointer" style={{ color: "#6b7280" }}>{project.projectId}</button>
              <span className="text-[8px] font-bold px-1 py-[1px] rounded shrink-0" style={{ backgroundColor: `${statusColor}18`, color: statusColor }}>
                {statusLabels[status]}
              </span>
              {project.isSpilled && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(217,119,6,0.1)", color: "#D97706" }}>
                  Omeškaní
                </span>
              )}
            </div>
            <button onClick={onOpenProjectDetail} className="hover:underline cursor-pointer text-left" style={{ fontSize: 16, fontWeight: 500, color: "#1a1a1a" }}>
              {project.projectName}
            </button>
            <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: "#6b7280" }}>
              {totalActiveItems} položek
              {project.deadline && <> · Expedice {fmtDateFull(project.deadline)}</>}
              {project.pm && (
                <span className="inline-flex items-center gap-1">
                  · <span>{project.pm}</span>
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-mono font-bold" style={{ color: statusColor }}>
              {bundleProgress.bundleProgress}%
            </div>
            <div className="text-xs" style={{ color: isWeeklyGoalMet ? "#3a8a36" : "#99a5a3" }}>
              Týdenní cíl: {weeklyGoal}%
            </div>
            {isWeeklyGoalMet && (
              <div className="text-[10px] font-medium" style={{ color: "#3a8a36" }}>🎉 Týdenní cíl splněn!</div>
            )}
          </div>
        </div>
        {/* Progress bar 4px */}
        <div className="mt-2 relative">
          <div className="h-1 rounded-full overflow-hidden" style={{ background: "#e5e2dd" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(bundleProgress.bundleProgress, 100)}%`, background: statusColor }} />
          </div>
          {/* Weekly goal marker — teal/green */}
          {weeklyGoal < 100 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="absolute top-[-3px] h-[10px] w-[2px] rounded-full cursor-help" style={{ left: `${weeklyGoal}%`, background: "#0d9488", opacity: 0.7 }} />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Cíl pro tento týden: {weeklyGoal.toFixed(0)}%</TooltipContent>
            </Tooltip>
          )}
          {/* Expected progress marker — blue/muted */}
          {(() => {
            const DAY_NAMES = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"];
            const now = new Date();
            const dow = now.getDay();
            const wde = (dow === 0 || dow === 6) ? 5 : dow;
            const exp = Math.round(weeklyGoal * (wde / 5));
            const dayName = DAY_NAMES[dow] || "dnes";
            if (exp <= 0) return null;
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="absolute top-[-2px] h-[8px] w-[2px] cursor-help" style={{ left: `${exp}%`, background: "#6b7280", opacity: 0.35 }} />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Očekávaný stav k {dayName}: {exp}%</TooltipContent>
              </Tooltip>
            );
          })()}
        </div>

        {/* ── Výkresy inline ── */}
        <VykresynSection projectId={project.projectId} />
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
                weeklyGoal={weeklyGoal}
              />
            ))}
          </div>
        </div>

        {/* ── Phases (read-only display) ── */}
        <div>
          <div className="text-[10px] uppercase font-semibold mb-2" style={{ color: "#99a5a3" }}>Operace</div>
          <div className={`flex items-center gap-1.5 ${isMobile ? "overflow-x-auto flex-nowrap pb-1" : "flex-wrap"}`}>
            {PHASES.map(p => {
              const isCurrent = latestPhase === p.name;
              const phasePctDone = latestPct >= p.pct;
              return (
                <span key={p.name}
                  className="px-2.5 py-1 rounded-full text-xs font-medium cursor-default pointer-events-none select-none whitespace-nowrap shrink-0"
                  style={{
                    background: isCurrent ? `${p.color}15` : "#f5f3f0",
                    color: isCurrent ? "#3a8a36" : phasePctDone ? "#3a8a36" : "#6b7280",
                    border: isCurrent ? `1.5px solid #3a8a36` : `1px solid ${phasePctDone ? "rgba(58,138,54,0.3)" : "#e5e2dd"}`,
                  }}>
                  {phasePctDone && !isCurrent ? "✓ " : ""}{p.name}
                </span>
              );
            })}
            {!isMobile && (
              <>
                <div className="flex-1" />
                <button
                  onClick={onSpillAll}
                  className="px-3 py-1 text-[11px] font-semibold rounded transition-colors"
                  style={{ background: "#d97706", color: "#fff" }}
                >
                  ⇒ Přesunout do T{nextWeekNum}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── DÝHA WARNING ── */}
        {showDyhaWarning && (
          <div className="rounded-lg p-3" style={{ background: "rgba(230,126,34,0.08)", border: "1.5px solid rgba(230,126,34,0.3)" }}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#e67e22" }} />
              <div className="flex-1">
                <div className="text-[12px] font-semibold" style={{ color: "#e67e22" }}>⚠ Kritická operace: Dýha vyžaduje kontrolu kvality</div>
                <div className="flex gap-2 mt-2">
                  <button className={`px-3 py-1.5 text-[11px] font-medium rounded transition-colors ${isMobile ? "min-h-[44px]" : ""}`}
                    style={{ background: "#e67e22", color: "#fff" }}
                    onClick={() => { /* Photo upload handled via VyrobaPhotoTab */ }}>
                    📷 Odeslat fotku
                  </button>
                  <button className={`px-3 py-1.5 text-[11px] font-medium rounded transition-colors ${isMobile ? "min-h-[44px]" : ""}`}
                    style={{ border: "1px solid #e5e2dd", color: "#6b7280" }}
                    onClick={onDismissDyha}>
                    Pokračovat na vlastní riziko
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Empty Aktuální message ── */}
        {currentItems.length === 0 && bundleProgress.bundleProgress > 0 && (
          <div className="rounded-md px-3 py-3 text-[12px] text-center" style={{ background: "rgba(58,138,54,0.05)", border: "1px solid rgba(58,138,54,0.15)", color: "#3a8a36" }}>
            Všechny položky tohoto týdne jsou dokončeny nebo přesunuty
          </div>
        )}

        {/* ── AKTUÁLNÍ items (unified with QC) ── */}
        <UnifiedItemList
          projectId={project.projectId}
          currentItems={currentItems}
          onToggleItem={onToggleItem}
          isExpanded={isExpanded}
          onToggleExpand={open => setExpandedMap(m => ({ ...m, [bundleId]: open }))}
          bundleId={bundleId}
          onOpenExpedice={onOpenExpedice}
          isMobile={isMobile}
          pushUndo={pushUndo}
          areAllPartsCompleted={areAllPartsCompleted}
          getIncompletePartsInfo={getIncompletePartsInfo}
        />

        {/* ── NAPLÁNOVANÉ (future) — collapsible ── */}
        {futureItems.length > 0 && (
          <Collapsible open={futureOpen} onOpenChange={setFutureOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold cursor-pointer" style={{ color: "#666666" }}>
              {futureOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Naplánované ({futureItems.length} položek)
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-1">
                {futureItems.map(({ item, weekNum: wn }) => (
                  <div key={item.id} className="flex items-center gap-2.5 px-2.5 py-2 rounded-md" style={{ border: "1px solid #ece8e2", background: "#f5f3f0" }}>
                    <span className="text-[9px] font-mono font-bold px-1 py-[1px] rounded shrink-0" style={{ background: "rgba(37,99,235,0.08)", color: "#2563eb" }}>T{wn}</span>
                    {item.item_code && <span className="font-mono text-[10px] shrink-0" style={{ color: "#223937" }}>{item.item_code}</span>}
                    <span className="text-[13px] flex-1 truncate" style={{ color: "#666666" }}>{item.item_name}</span>
                    <span className="font-mono text-[11px] shrink-0" style={{ color: "#99a5a3" }}>{item.scheduled_hours}h</span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* ── HOTOVÉ — collapsible ── */}
        {completedItems.length > 0 && (
          <Collapsible open={completedOpen} onOpenChange={setCompletedOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold cursor-pointer" style={{ color: "#3a8a36" }}>
              {completedOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              ✓ Hotové ({completedItems.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-1">
                {completedItems.map(({ item }) => {
                  const qcCheck = hotoveCheckMap.get(item.id);
                  return (
                    <div key={item.id} className="px-2.5 py-2 rounded-md" style={{ border: "1px solid #ece8e2", background: "#ffffff" }}>
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: "#3a8a36" }} />
                        {item.item_code && <span className="font-mono text-[10px] shrink-0" style={{ color: "#3a8a36" }}>{item.item_code}</span>}
                        <span className="text-[13px] flex-1 truncate" style={{ color: "#5a9a58" }}>{item.item_name}</span>
                        {qcCheck && <QualityCheckFullDisplay check={qcCheck} />}
                        <span className="font-mono text-[11px] shrink-0" style={{ color: "#99a5a3" }}>{item.scheduled_hours}h</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* ── Mobile spill button (moved from Operace row) ── */}
        {isMobile && (
          <button
            onClick={onSpillAll}
            className="w-full py-2.5 rounded-md text-sm font-medium transition-colors min-h-[44px]"
            style={{ background: "#d97706", color: "#fff" }}
          >
            ⇒ Přesunout do T{nextWeekNum}
          </button>
        )}

        {/* ── Daily log shortcut ── */}
        {todayDayIndex >= 0 && !hideLogButton && (
          <button onClick={() => onOpenLog()} className={`w-full py-2.5 rounded-md text-white text-sm font-medium transition-colors hover:opacity-90 ${isMobile ? "min-h-[44px] mb-4" : ""}`} style={{ background: "#3a8a36" }}>
            + Log dnes ({DAY_SHORT[todayDayIndex]})
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════ */
/* UNIFIED ITEM LIST (Items + QC merged)   */
/* ═══════════════════════════════════════ */

function UnifiedItemList({ projectId, currentItems, onToggleItem, isExpanded, onToggleExpand, bundleId, onOpenExpedice, isMobile, pushUndo, areAllPartsCompleted, getIncompletePartsInfo }: {
  projectId: string;
  currentItems: { item: ScheduleItem; weekKey: string; weekNum: number }[];
  onToggleItem: (id: string, status: string) => void;
  isExpanded: boolean;
  onToggleExpand: (open: boolean) => void;
  bundleId: string;
  onOpenExpedice: () => void;
  isMobile: boolean;
  pushUndo: (entry: Omit<import("@/hooks/useUndoRedo").UndoEntry, "id" | "timestamp">) => void;
  areAllPartsCompleted: (itemCode: string | null, itemName: string) => boolean;
  getIncompletePartsInfo: (itemCode: string | null, itemName: string) => { incomplete: number; total: number; weekNums: number[] };
}) {
  const { checks, checkItem, uncheckItem } = useQualityChecks(projectId);
  const { defects, addDefect, resolveDefect } = useQualityDefects(projectId);
  const { profile } = useAuth();
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [qcModalOpen, setQcModalOpen] = useState(false);
  const [qcModalItems, setQcModalItems] = useState<{ item: ScheduleItem }[]>([]);
  const [qcSubmitting, setQcSubmitting] = useState(false);
  const [singleQcItem, setSingleQcItem] = useState<ScheduleItem | null>(null);
  const [singleQcMergedIds, setSingleQcMergedIds] = useState<string[]>([]);
  const [singleQcModalOpen, setSingleQcModalOpen] = useState(false);
  const [uncheckConfirmItemId, setUncheckConfirmItemId] = useState<string | null>(null);
  const [uncheckConfirmCode, setUncheckConfirmCode] = useState<string>("");
  // Defect form state
  const [defectOpen, setDefectOpen] = useState(false);
  const [defectType, setDefectType] = useState("");
  const [defectDesc, setDefectDesc] = useState("");
  const [defectSeverity, setDefectSeverity] = useState<"minor" | "blocking" | "">("");
  const [defectResolution, setDefectResolution] = useState("");
  const [defectItemId, setDefectItemId] = useState<string>("__bundle__");
  const [defectPhotos, setDefectPhotos] = useState<string[]>([]);
  // Reset defect form when project changes or QC dialogs close
  useEffect(() => {
    setDefectOpen(false); setDefectType(""); setDefectDesc(""); setDefectSeverity(""); setDefectResolution(""); setDefectItemId("__bundle__"); setDefectPhotos([]);
  }, [projectId]);
  const qc = useQueryClient();
  const qcUserFirstName = profile?.full_name?.split(" ")[0]?.slice(0, 8) || "–";

  // Deduplicate by id, then merge splits by item_code within same week
  const stripSplitSuffix = (name: string) => name.replace(/\s*\(\d+\/\d+\)$/, '').trim();

  const dedupedItems = useMemo(() => {
    // Step 1: deduplicate by id
    const seenIds = new Set<string>();
    const unique = currentItems.filter(({ item }) => {
      if (seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      return true;
    });

    // Step 2: merge splits sharing item_code in the same week (item_code only, ignore name variations)
    const mergeKey = (i: ScheduleItem) => {
      if (i.item_code) return `code::${i.item_code}::${i.scheduled_week}`;
      return `name::${i.item_name}::${i.scheduled_week}`;
    };
    const grouped = new Map<string, { item: ScheduleItem; weekKey: string; weekNum: number; mergedIds: string[]; totalHoursAllSplits: number; thisWeekHours: number; partsThisWeek: number; splitTotalFromRow: number | null }>();
    for (const entry of unique) {
      const key = mergeKey(entry.item);
      const existing = grouped.get(key);
      if (existing) {
        existing.thisWeekHours += entry.item.scheduled_hours;
        existing.mergedIds.push(entry.item.id);
        existing.partsThisWeek += 1;
        if (entry.item.split_total != null) existing.splitTotalFromRow = entry.item.split_total;
        // Update representative item with stripped name and summed hours
        existing.item = { ...existing.item, item_name: stripSplitSuffix(existing.item.item_name), scheduled_hours: existing.thisWeekHours };
      } else {
        grouped.set(key, {
          ...entry,
          mergedIds: [entry.item.id],
          totalHoursAllSplits: 0,
          thisWeekHours: entry.item.scheduled_hours,
          partsThisWeek: 1,
          splitTotalFromRow: entry.item.split_total,
          item: { ...entry.item, item_name: stripSplitSuffix(entry.item.item_name) },
        });
      }
    }
    return Array.from(grouped.values());
  }, [currentItems]);

  const checkMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of checks) m.set(c.item_id, c);
    return m;
  }, [checks]);




  function toggleSelect(mergedIds: string[]) {
    setSelectedItems(prev => {
      const next = new Set(prev);
      const allIn = mergedIds.every(id => next.has(id));
      if (allIn) mergedIds.forEach(id => next.delete(id));
      else mergedIds.forEach(id => next.add(id));
      return next;
    });
  }

  const allMergedIds = useMemo(() => dedupedItems.flatMap(d => d.mergedIds), [dedupedItems]);
  const completedCount = dedupedItems.filter(i => i.item.status === "completed").length;
  const allSelected = dedupedItems.length > 0 && dedupedItems.every(i => i.mergedIds.every(id => selectedItems.has(id)));

  // "Označit jako hotovo" — targets selected or all
  function handleMarkHotovo() {
    const targetItems = selectedItems.size > 0
      ? dedupedItems.filter(d => d.mergedIds.some(id => selectedItems.has(id)) && d.item.status !== "completed")
      : dedupedItems.filter(d => d.item.status !== "completed");

    if (targetItems.length === 0) return;

    const missingQC = targetItems.filter(({ item }) => !checkMap.has(item.id));

    if (missingQC.length === 0) {
      // All have QC — mark as hotovo directly
      (async () => {
        const ids = targetItems.flatMap(({ mergedIds }) => mergedIds);
        const snapshots = targetItems.map(({ mergedIds: mids, item }) => mids.map(mid => ({ id: mid, prevStatus: item.status }))).flat();
        pushUndo({
          page: "vyroba",
          actionType: "item_hotovo",
          description: `${ids.length} položek dokončeno`,
          undo: async () => {
            for (const snap of snapshots) {
              await supabase.from("production_schedule").update({ status: snap.prevStatus, completed_at: null, completed_by: null }).eq("id", snap.id);
            }
            qc.invalidateQueries({ queryKey: ["production-schedule"] });
          },
          redo: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            await supabase.from("production_schedule").update({ status: "completed", completed_at: new Date().toISOString(), completed_by: user?.id || null }).in("id", ids);
            qc.invalidateQueries({ queryKey: ["production-schedule"] });
          },
        });
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("production_schedule").update({
          status: "completed", completed_at: new Date().toISOString(), completed_by: user?.id || null,
        }).in("id", ids);
        qc.invalidateQueries({ queryKey: ["production-schedule"] });
        setSelectedItems(new Set());
        // Check if ALL items are now completed
        const allNowCompleted = dedupedItems.every(({ item }) => item.status === "completed" || ids.includes(item.id));
        if (allNowCompleted) {
          onOpenExpedice();
        }
      })();
    } else {
      // Open QC modal for items missing QC
      setQcModalItems(missingQC);
      setQcModalOpen(true);
      setDefectOpen(false); setDefectType(""); setDefectDesc(""); setDefectSeverity(""); setDefectResolution(""); setDefectItemId("__bundle__"); setDefectPhotos([]);
    }
  }

  async function handleQcModalConfirm() {
    if (qcSubmitting) return;
    setQcSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Push undo for QC confirm
      const qcItemIds = qcModalItems.filter(({ item }) => !checkMap.has(item.id)).map(({ item }) => item.id);
      if (qcItemIds.length > 0) {
        pushUndo({
          page: "vyroba",
          actionType: "qc_confirm",
          description: `QC potvrzení (${qcItemIds.length} položek)`,
          undo: async () => {
            const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
            for (const itemId of qcItemIds) {
              await (supabase.from("production_quality_checks" as any) as any).delete().eq("item_id", itemId).gte("checked_at", oneMinuteAgo);
            }
            qc.invalidateQueries({ queryKey: ["production-schedule"] });
            qc.invalidateQueries({ queryKey: ["quality-checks", projectId] });
          },
          redo: async () => {
            const { data: { user: u } } = await supabase.auth.getUser();
            for (const itemId of qcItemIds) {
              await (supabase.from("production_quality_checks" as any) as any).insert({ item_id: itemId, project_id: projectId, checked_by: u?.id });
            }
            qc.invalidateQueries({ queryKey: ["quality-checks", projectId] });
          },
        });
      }
      // Record QC for all items in modal
      for (const { item } of qcModalItems) {
        if (!checkMap.has(item.id)) {
          await (supabase.from("production_quality_checks" as any) as any).insert({
            item_id: item.id,
            project_id: projectId,
            checked_by: user?.id,
          });
        }
      }
      // Now mark ALL target items (selected or all) as completed
      const targetItems2 = selectedItems.size > 0
        ? dedupedItems.filter(d => d.mergedIds.some(id => selectedItems.has(id)) && d.item.status !== "completed")
        : dedupedItems.filter(d => d.item.status !== "completed");
      const ids = targetItems2.flatMap(({ mergedIds }) => mergedIds);
      if (ids.length > 0) {
        await supabase.from("production_schedule").update({
          status: "completed", completed_at: new Date().toISOString(), completed_by: user?.id || null,
        }).in("id", ids);
      }
      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["quality-checks", projectId] });
      const qcItemCodes = qcModalItems.filter(({ item }) => !checkMap.has(item.id)).map(({ item }) => item.item_code || item.item_name);
      logActivity({ projectId, actionType: "item_qc_confirmed", newValue: qcItemCodes.join(", "), detail: profile?.full_name || profile?.email || "" });
      setSelectedItems(new Set());
      setQcModalOpen(false);
      // Check if ALL items are now completed
      const allNowCompleted = dedupedItems.every(({ item }) => item.status === "completed" || ids.includes(item.id));
      if (allNowCompleted) {
        onOpenExpedice();
      }
    } catch {
      toast.error("Chyba při dokončování");
    } finally {
      setQcSubmitting(false);
    }
  }

  // Get project name from first item
  const projectName = dedupedItems[0]?.item.project_name || projectId;

  return (
    <>
      <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
        <div className="flex items-center gap-2" style={{ minHeight: 24 }}>
          {selectedItems.size > 0 ? (
            <>
              <span className="text-xs font-semibold" style={{ color: "#2563eb" }}>✓ {selectedItems.size} vybráno</span>
              <button onClick={() => setSelectedItems(new Set())} className="px-2 py-0.5 rounded text-[11px]" style={{ color: "#6b7280", border: "1px solid #e5e2dd" }}>
                Zrušit výběr
              </button>
            </>
          ) : (
            <>
              <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold cursor-pointer" style={{ color: "#6b7280" }}>
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Aktuální ({completedCount}/{dedupedItems.length})
              </CollapsibleTrigger>
              {dedupedItems.length > 0 && (
                <label className="flex items-center gap-1 text-[10px] cursor-pointer" style={{ color: "#99a5a3" }}>
                  <Checkbox
                    className="h-3.5 w-3.5"
                    checked={allSelected}
                    onCheckedChange={(v) => {
                       if (v) setSelectedItems(new Set(dedupedItems.flatMap(i => i.mergedIds)));
                      else setSelectedItems(new Set());
                    }}
                  />
                  Vše
                </label>
              )}
            </>
          )}
        </div>
        <CollapsibleContent>
          <div className="mt-2 space-y-1">
            {dedupedItems.map(({ item, mergedIds: mids, thisWeekHours, partsThisWeek, splitTotalFromRow }) => {
              const isCompleted = mids.every(id => {
                const orig = currentItems.find(ci => ci.item.id === id);
                return orig?.item.status === "completed";
              });
              const isPaused = item.status === "paused";
              const isSplit = mids.length > 1 || (item.split_part != null && item.split_total != null);
              const hasQC = mids.every(id => checkMap.has(id));
              const qcCheck = checkMap.get(mids[0]);
              const isSelected = mids.every(id => selectedItems.has(id));

              const bothDone = isCompleted && hasQC;
              const rowBg = bothDone ? "rgba(58,138,54,0.06)" : isSelected ? "rgba(37,99,235,0.04)" : "#ffffff";
              const rowBorder = bothDone ? "1px solid rgba(58,138,54,0.2)" : isSelected ? "1px solid rgba(37,99,235,0.2)" : "1px solid #ece8e2";

              const splitBadgeY = splitTotalFromRow || partsThisWeek;


              return (
                <div key={mids.join("-")}>
                  <div
                    className="flex items-center gap-2 px-2.5 rounded-md cursor-pointer transition-colors"
                    style={{ border: rowBorder, background: rowBg, height: 42 }}
                    onClick={() => toggleSelect(mids)}
                  >
                    {/* Select checkbox */}
                    <Checkbox
                      className="h-4 w-4 shrink-0"
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(mids)}
                      onClick={(e) => e.stopPropagation()}
                    />

                    {/* Item info */}
                    <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
                      {item.item_code && (
                        <span className="font-mono text-[12px] font-bold shrink-0" style={{ color: "#223937" }}>{item.item_code}</span>
                      )}
                      <span className="text-[13px] truncate" style={{
                        color: bothDone ? "#3a8a36" : isCompleted ? "#99a5a3" : "#1a1a1a",
                      }}>
                        {item.item_name}
                      </span>
                      {isSplit && (
                        <span className="text-[9px] font-medium px-1 py-[1px] rounded shrink-0" style={{ background: "rgba(217,119,6,0.1)", color: "#d97706" }}>
                          část {partsThisWeek}/{splitBadgeY}
                        </span>
                      )}
                      {isPaused && (
                        <span className="text-[8px] font-medium px-1 py-[1px] rounded shrink-0" style={{ background: "rgba(217,119,6,0.12)", color: "#d97706" }}>⏸</span>
                      )}
                      {/* Defect badges */}
                      {(() => {
                        const itemDefects = defects.filter(d => mids.includes(d.item_id));
                        const unresolvedBlocking = itemDefects.filter(d => !d.resolved && d.severity === "blocking");
                        const unresolvedMinor = itemDefects.filter(d => !d.resolved && d.severity === "minor");
                        const resolved = itemDefects.filter(d => d.resolved);
                        return (
                          <>
                            {unresolvedBlocking.length > 0 && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button onClick={e => e.stopPropagation()} className="text-[9px] font-semibold px-1.5 py-[2px] rounded shrink-0" style={{ background: "rgba(220,38,38,0.1)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.2)" }}>
                                    ⛔ Vada k oprave
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-72 text-xs space-y-2" onClick={e => e.stopPropagation()}>
                                  {unresolvedBlocking.map(d => (
                                    <div key={d.id} className="space-y-1 border-b pb-2 last:border-0">
                                      <div className="font-semibold">{d.defect_type}</div>
                                      <div className="text-muted-foreground">{d.description}</div>
                                      <button className="px-2 py-1 rounded text-[11px] font-medium" style={{ background: "#16a34a", color: "#fff" }}
                                        onClick={async () => {
                                          const { data: { user } } = await supabase.auth.getUser();
                                          resolveDefect.mutate({ defectId: d.id, userId: user?.id || "" });
                                          logActivity({ projectId, actionType: "defect_resolved", newValue: d.defect_type, detail: d.item_code || "" });
                                        }}>Označiť ako opravenú</button>
                                    </div>
                                  ))}
                                </PopoverContent>
                              </Popover>
                            )}
                            {unresolvedMinor.length > 0 && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button onClick={e => e.stopPropagation()} className="text-[9px] font-semibold px-1.5 py-[2px] rounded shrink-0" style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #f59e0b" }}>
                                    ⚠ Drobná Vada
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-72 text-xs space-y-2" onClick={e => e.stopPropagation()}>
                                  {unresolvedMinor.map(d => (
                                    <div key={d.id} className="space-y-1 border-b pb-2 last:border-0">
                                      <div className="font-semibold">{d.defect_type}</div>
                                      <div className="text-muted-foreground">{d.description}</div>
                                      
                                      <button className="px-2 py-1 rounded text-[11px] font-medium" style={{ background: "#16a34a", color: "#fff" }}
                                        onClick={async () => {
                                          const { data: { user } } = await supabase.auth.getUser();
                                          resolveDefect.mutate({ defectId: d.id, userId: user?.id || "" });
                                          logActivity({ projectId, actionType: "defect_resolved", newValue: d.defect_type, detail: d.item_code || "" });
                                        }}>Označiť ako opravenú</button>
                                    </div>
                                  ))}
                                </PopoverContent>
                              </Popover>
                            )}
                            {resolved.length > 0 && unresolvedBlocking.length === 0 && unresolvedMinor.length === 0 && (
                              <span className="text-[9px] font-medium px-1.5 py-[2px] rounded shrink-0" style={{ background: "rgba(22,163,74,0.1)", color: "#16a34a" }}>
                                ✓ Opravená
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {/* Hours */}
                    <span className="font-mono text-[11px] shrink-0" style={{ color: "#99a5a3" }}>{thisWeekHours}h</span>

                    {/* QC badge — clickable only if ALL parts completed across all weeks */}
                    <div onClick={(e) => e.stopPropagation()}>
                      {hasQC ? (
                        <button className="cursor-pointer" onClick={() => { setUncheckConfirmItemId(mids[0]); setUncheckConfirmCode(`${item.item_code || ""} ${item.item_name}`.trim()); }}>
                          <QualityCheckDisplay check={checkMap.get(mids[0])} />
                        </button>
                      ) : (() => {
                        const allDone = areAllPartsCompleted(item.item_code, item.item_name);
                        return (
                          <button className="cursor-pointer" onClick={() => {
                            // Pre-select this item if not already selected
                            setSelectedItems(prev => {
                              const next = new Set(prev);
                              for (const id of mids) next.add(id);
                              return next;
                            });
                            setSingleQcItem(item); setSingleQcMergedIds(mids); setSingleQcModalOpen(true); setDefectItemId(item.id); setDefectOpen(false); setDefectType(""); setDefectDesc(""); setDefectSeverity(""); setDefectResolution(""); setDefectPhotos([]);
                          }}>
                            {!allDone ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center justify-center gap-1 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                                    style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #f59e0b", padding: "6px 12px", minHeight: 36, minWidth: 60, borderRadius: "9999px", fontSize: "12px", fontWeight: 600, lineHeight: 1 }}>
                                    <Shield className="h-3.5 w-3.5" /> QC
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[250px] text-xs">
                                  {(() => { const info = getIncompletePartsInfo(item.item_code, item.item_name); return `Čeká na dokončení části ${info.total - info.incomplete}/${info.total} v T${info.weekNums.join(", T")} — QC lze zahájit`; })()}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <QualityCheckBadgeEmpty />
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Inline uncheck confirm */}
                  {uncheckConfirmItemId === mids[0] && (
                    <div className="flex items-center gap-2 px-3 py-2 mt-1 rounded-md text-[12px]" style={{ background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.15)" }}>
                      <span style={{ color: "#92400e" }}>Zrušit QC kontrolu pro <strong>{uncheckConfirmCode}</strong>?</span>
                      <button className="px-3 py-1 rounded text-[12px] font-medium" style={{ background: "#dc2626", color: "#fff", minHeight: '44px', minWidth: '44px' }}
                        onClick={async () => {
                          for (const mid of mids) {
                            const check = checkMap.get(mid);
                            if (check) await uncheckItem(check.id);
                          }
                          setUncheckConfirmItemId(null);
                        }}>Ano</button>
                      <button className="px-3 py-1 rounded text-[12px] font-medium" style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))", minHeight: '44px', minWidth: '44px' }}
                        onClick={() => setUncheckConfirmItemId(null)}>Ne</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Blocking defects warning */}
      {(() => {
        const allItemIds = dedupedItems.flatMap(d => d.mergedIds);
        const blockingDefects = defects.filter(d => !d.resolved && d.severity === "blocking" && allItemIds.includes(d.item_id));
        if (blockingDefects.length === 0) return null;
        return (
          <div className="rounded-md px-3 py-2 space-y-1.5 text-[12px]" style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)" }}>
            <div className="font-semibold" style={{ color: "#dc2626" }}>⛔ Blokujúce vady ({blockingDefects.length})</div>
            {blockingDefects.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-2">
                <span className="truncate" style={{ color: "#92400e" }}>{d.item_code || ""} — {d.defect_type}</span>
                <button className="px-2 py-0.5 rounded text-[10px] font-medium shrink-0" style={{ background: "#16a34a", color: "#fff" }}
                  onClick={async () => {
                    const { data: { user } } = await supabase.auth.getUser();
                    resolveDefect.mutate({ defectId: d.id, userId: user?.id || "" });
                    logActivity({ projectId, actionType: "defect_resolved", newValue: d.defect_type, detail: d.item_code || "" });
                  }}>Označiť ako opravenú</button>
              </div>
            ))}
          </div>
        );
      })()}

      {/* "Označit jako hotovo" button */}
      {(() => {
        const allItemIds = dedupedItems.flatMap(d => d.mergedIds);
        const hasBlockingDefects = defects.some(d => !d.resolved && d.severity === "blocking" && allItemIds.includes(d.item_id));
        const hasIncomplete = dedupedItems.some(i => i.item.status !== "completed");
        const isDisabled = !hasIncomplete || hasBlockingDefects;
        return (
          <button
            onClick={handleMarkHotovo}
            disabled={isDisabled}
            className={`w-full py-2.5 rounded-md text-sm font-medium transition-colors ${isMobile ? "min-h-[44px]" : ""}`}
            style={{
              background: isDisabled ? "#f5f3f0" : "rgba(58,138,54,0.1)",
              color: isDisabled ? "#b0b7c3" : "#3a8a36",
              border: isDisabled ? "1px solid #e5e2dd" : "1px solid rgba(58,138,54,0.2)",
              cursor: isDisabled ? "not-allowed" : "pointer",
            }}
          >
            {hasBlockingDefects ? "Blokované — najskôr opravte vady" : `Označit ${selectedItems.size > 0 ? `${selectedItems.size} položek` : "vše"} jako hotovo`}
          </button>
        );
      })()}

      {/* QC MODE POPUP */}
      <Dialog open={qcModalOpen} onOpenChange={setQcModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Kontrola kvality — {projectName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <QcWarningBox />

            {/* Defect section */}
            <QcDefectForm
              defectOpen={defectOpen}
              setDefectOpen={setDefectOpen}
              defectType={defectType} setDefectType={setDefectType}
              defectDesc={defectDesc} setDefectDesc={setDefectDesc}
              defectSeverity={defectSeverity} setDefectSeverity={setDefectSeverity}
              defectResolution={defectResolution} setDefectResolution={setDefectResolution}
              defectItemId={defectItemId} setDefectItemId={setDefectItemId}
              defectPhotos={defectPhotos} setDefectPhotos={setDefectPhotos}
              availableItems={qcModalItems.map(({ item }) => item)}
              projectId={projectId}
              onSave={async () => {
                const { data: { user } } = await supabase.auth.getUser();
                const selectedItem = defectItemId === "__bundle__" ? null : qcModalItems.find(({ item }) => item.id === defectItemId)?.item;
                const targetItemId = selectedItem?.id || qcModalItems[0]?.item.id;
                if (!targetItemId) return;
                await addDefect.mutateAsync({
                  project_id: projectId,
                  item_id: targetItemId,
                  item_code: selectedItem?.item_code || null,
                  defect_type: defectType,
                  description: defectDesc,
                  severity: defectSeverity as "minor" | "blocking",
                  resolution_type: defectSeverity === "blocking" ? defectResolution : null,
                  photo_url: defectPhotos.length > 0 ? JSON.stringify(defectPhotos) : null,
                  reported_by: user?.id || "",
                });
                
                logActivity({ projectId, actionType: "defect_reported", newValue: defectType, detail: `${selectedItem?.item_code || "bundle"} — ${defectSeverity}` });
                setDefectType(""); setDefectDesc(""); setDefectSeverity(""); setDefectResolution(""); setDefectItemId("__bundle__"); setDefectPhotos([]); setDefectOpen(false);
              }}
            />

            {/* Items requiring QC */}
            <div>
              <div className="text-[10px] uppercase font-semibold mb-1.5" style={{ color: "#99a5a3" }}>Položky ({qcModalItems.length})</div>
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {qcModalItems.map(({ item }) => (
                  <div key={item.id} className="flex items-center gap-2 px-2.5 py-2 rounded-md" style={{ border: "1px solid #ece8e2", background: "#fafaf8" }}>
                    {item.item_code && <span className="font-mono text-[11px] font-bold shrink-0" style={{ color: "#223937" }}>{item.item_code}</span>}
                    <span className="text-[12px] flex-1 truncate" style={{ color: "#1a1a1a" }}>{item.item_name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setQcModalOpen(false); setDefectOpen(false); }}>Zrušit</Button>
            <Button
              disabled={qcSubmitting}
              onClick={handleQcModalConfirm}
              style={{ background: "#3a8a36" }}
            >
              {qcSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Potvrdit QC — {qcUserFirstName}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single-item QC modal (also shows other selected items) */}
      {(() => {
        // Gather all selected items that need QC
        const selectedQcItems = selectedItems.size > 0
          ? dedupedItems.filter(d => d.mergedIds.some(id => selectedItems.has(id)) && !d.mergedIds.every(id => checkMap.has(id)))
          : [];
        const showMultiple = selectedQcItems.length > 1;
        const modalTitle = showMultiple
          ? `Kontrola kvality — ${selectedQcItems.length} položek`
          : `Kontrola kvality — ${singleQcItem?.item_code || ""} ${singleQcItem?.item_name || ""}`;

        return (
          <Dialog open={singleQcModalOpen} onOpenChange={setSingleQcModalOpen}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{modalTitle}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {showMultiple && (
                  <div className="space-y-1 text-[12px]">
                    <div className="font-semibold text-muted-foreground">Položky k QC kontrole:</div>
                    {selectedQcItems.map(({ item }) => (
                      <div key={item.id} className="flex items-center gap-2 px-2 py-1 rounded" style={{ background: "hsl(var(--muted))" }}>
                        <Check className="h-3 w-3" style={{ color: "hsl(var(--success))" }} />
                        <span>{item.item_code} {item.item_name}</span>
                      </div>
                    ))}
                  </div>
                )}
                <QcWarningBox />

                {/* Defect section */}
                <QcDefectForm
                  defectOpen={defectOpen}
                  setDefectOpen={setDefectOpen}
                  defectType={defectType} setDefectType={setDefectType}
                  defectDesc={defectDesc} setDefectDesc={setDefectDesc}
                  defectSeverity={defectSeverity} setDefectSeverity={setDefectSeverity}
                  defectResolution={defectResolution} setDefectResolution={setDefectResolution}
                  defectItemId={defectItemId} setDefectItemId={setDefectItemId}
                  defectPhotos={defectPhotos} setDefectPhotos={setDefectPhotos}
                  availableItems={singleQcItem ? [singleQcItem] : []}
                  projectId={projectId}
                  onSave={async () => {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!singleQcItem) return;
                    const selectedItem = defectItemId === "__bundle__" ? null : (defectItemId === singleQcItem.id ? singleQcItem : null);
                    await addDefect.mutateAsync({
                      project_id: projectId,
                      item_id: selectedItem?.id || singleQcItem.id,
                      item_code: selectedItem?.item_code || singleQcItem.item_code || null,
                      defect_type: defectType,
                      description: defectDesc,
                      severity: defectSeverity as "minor" | "blocking",
                      resolution_type: defectSeverity === "blocking" ? defectResolution : null,
                      photo_url: defectPhotos.length > 0 ? JSON.stringify(defectPhotos) : null,
                      reported_by: user?.id || "",
                    });
                    
                    logActivity({ projectId, actionType: "defect_reported", newValue: defectType, detail: `${selectedItem?.item_code || singleQcItem.item_code || "item"} — ${defectSeverity}` });
                    setDefectType(""); setDefectDesc(""); setDefectSeverity(""); setDefectResolution(""); setDefectItemId("__bundle__"); setDefectPhotos([]); setDefectOpen(false);
                  }}
                  singleItemMode
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setSingleQcModalOpen(false); setDefectOpen(false); }}>Zrušit</Button>
                <Button
                  style={{ background: "#3a8a36" }}
                  onClick={async () => {
                    // QC all selected items (or just the single one)
                    const itemsToQc = showMultiple ? selectedQcItems : (singleQcItem ? [{ item: singleQcItem, mergedIds: singleQcMergedIds }] : []);
                    for (const { mergedIds: ids } of itemsToQc) {
                      for (const id of ids) {
                        if (!checkMap.has(id)) await checkItem(id);
                      }
                    }
                    const qcNames = itemsToQc.map(({ item }) => item.item_code || item.item_name).join(", ");
                    logActivity({ projectId, actionType: "item_qc_confirmed", newValue: qcNames, detail: profile?.full_name || profile?.email || "" });
                    setSingleQcModalOpen(false);
                    setSingleQcItem(null);
                    setSingleQcMergedIds([]);
                    setSelectedItems(new Set());
                    setDefectOpen(false);
                  }}
                >
                  Potvrdit QC — {qcUserFirstName}{showMultiple ? ` (${selectedQcItems.length})` : ""}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </>
  );
}

/* ═══ QC Warning Box ═══ */
function QcWarningBox() {
  return (
    <div className="rounded-md px-3 py-3 text-[13px] space-y-2" style={{ background: "#fef3c7", border: "1px solid #f59e0b", color: "#92400e" }}>
      <div className="font-semibold">Pred odoslaním do Expedície skontrolujte:</div>
      <div>
        <div className="font-bold mt-1">Materiálová kvalita</div>
        <ul className="list-disc ml-4 space-y-0.5">
          <li>Dýha — vizuálna kontrola povrchu, hrany</li>
          <li>Lak — rovnomernosť, zhoda so vzorkou, bez škvŕn, lesk</li>
          <li>Škrabance a drobné poškodenie</li>
        </ul>
      </div>
      <div>
        <div className="font-bold mt-1">Kvalita výroby</div>
        <ul className="list-disc ml-4 space-y-0.5">
          <li>Presnosť osadenia — nič nepresahuje, nič nie je krivé</li>
          <li>Funkčnosť — zásuvky, výsuvy, závesy, kovanie</li>
        </ul>
      </div>
      <div>
        <div className="font-bold mt-1">Kvalita expedície</div>
        <ul className="list-disc ml-4 space-y-0.5">
          <li>Kompletnosť — všetky diely sú priložené</li>
          <li>Balenie — ochrana hrán, bez rizika poškodenia</li>
        </ul>
      </div>
    </div>
  );
}

/* ═══ QC Defect Form ═══ */
const DEFECT_TYPES = ["Škrabanec", "Nerovnosť laku", "Poškodenie dýhy", "Chýbajúci diel", "Funkčná vada", "Iné"];

function QcDefectForm({ defectOpen, setDefectOpen, defectType, setDefectType, defectDesc, setDefectDesc, defectSeverity, setDefectSeverity, defectResolution, setDefectResolution, defectItemId, setDefectItemId, defectPhotos, setDefectPhotos, availableItems, projectId, onSave, singleItemMode = false }: {
  defectOpen: boolean; setDefectOpen: (v: boolean) => void;
  defectType: string; setDefectType: (v: string) => void;
  defectDesc: string; setDefectDesc: (v: string) => void;
  defectSeverity: "minor" | "blocking" | ""; setDefectSeverity: (v: "minor" | "blocking" | "") => void;
  defectResolution: string; setDefectResolution: (v: string) => void;
  defectItemId: string; setDefectItemId: (v: string) => void;
  defectPhotos: string[]; setDefectPhotos: (v: string[]) => void;
  availableItems: ScheduleItem[];
  projectId: string;
  onSave: () => Promise<void>;
  singleItemMode?: boolean;
}) {
  const isMobile = useIsMobile();
  const { uploadFile } = useSharePointDocs(projectId);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const isIne = defectType === "Iné";
  const descRequired = isIne;
  const hasSeverity = defectSeverity === "minor" || defectSeverity === "blocking";
  const canSave = defectType && hasSeverity && (!descRequired || defectDesc.trim()) && (defectSeverity !== "blocking" || defectResolution);

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setPhotoUploading(true);
    try {
      for (const file of Array.from(files)) {
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
        const timeStr = `${String(now.getHours()).padStart(2,"0")}-${String(now.getMinutes()).padStart(2,"0")}`;
        const itemLabel = defectItemId === "__bundle__" ? "bundle" : (availableItems.find(i => i.id === defectItemId)?.item_code || "item");
        const ext = file.name.split(".").pop() || "jpg";
        const autoName = `${projectId}-Vada-${itemLabel}-${dateStr}-${timeStr}.${ext}`;
        const renamedFile = new File([file], autoName, { type: file.type });
        const result = await uploadFile("fotky", renamedFile);
        if (result?.downloadUrl) {
          setDefectPhotos([...defectPhotos, result.downloadUrl]);
        } else if (result?.webUrl) {
          setDefectPhotos([...defectPhotos, result.webUrl]);
        }
      }
    } catch (err) {
      toast.error("Chyba pri nahrávaní fotky");
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  return (
    <Collapsible open={defectOpen} onOpenChange={setDefectOpen}>
      <CollapsibleTrigger asChild>
        <button
          className="flex items-center gap-1.5 text-[13px] font-medium cursor-pointer rounded-md transition-colors"
          style={{
            color: "#92400e",
            border: "1px solid #f59e0b",
            background: defectOpen ? "#fef3c7" : "transparent",
            padding: "6px 14px",
            borderRadius: "6px",
          }}
          onMouseEnter={(e) => { if (!defectOpen) (e.currentTarget as HTMLElement).style.background = "#fef3c7"; }}
          onMouseLeave={(e) => { if (!defectOpen) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Zaznamenať vadu
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-3 rounded-md p-3" style={{ border: "1px solid #e5e2dd", background: "#fafaf8" }}>
          {/* Item selector — only in multi-item mode */}
          {!singleItemMode && (
            <div>
              <Label className="text-[11px] font-semibold mb-1 block">Prvok s vadou *</Label>
              <Select value={defectItemId} onValueChange={setDefectItemId}>
                <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Vyberte prvok..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__bundle__">Celý bundle</SelectItem>
                  {availableItems.map(item => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.item_code ? `${item.item_code} — ` : ""}{item.item_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {/* Type */}
          <div>
            <Label className="text-[11px] font-semibold mb-1 block">Typ vady *</Label>
            <Select value={defectType} onValueChange={setDefectType}>
              <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="Vyberte typ..." /></SelectTrigger>
              <SelectContent>
                {DEFECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {/* Description */}
          <div>
            <Label className="text-[11px] font-semibold mb-1 block">
              Popis {descRequired && <span className="text-red-500">*</span>}
            </Label>
            <Textarea value={defectDesc} onChange={e => setDefectDesc(e.target.value)} className="min-h-[60px] text-[12px]" placeholder="Popíšte vadu..." />
          </div>
          {/* Photo upload */}
          <div>
            <Label className="text-[11px] font-semibold mb-1 block">Fotky</Label>
            <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} {...(isMobile ? { capture: "environment" as const } : {})} />
            <div className="flex items-center gap-2 flex-wrap">
              {defectPhotos.map((url, idx) => (
                <div key={idx} className="relative group">
                  <img src={url} alt="Vada" className="w-[60px] h-[60px] rounded object-cover border" style={{ borderColor: "#e5e2dd" }} />
                  <button className="absolute -top-1.5 -right-1.5 rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "#dc2626", color: "#fff" }}
                    onClick={() => setDefectPhotos(defectPhotos.filter((_, i) => i !== idx))}>×</button>
                </div>
              ))}
              {photoUploading && <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#d97706" }} />}
              <label className="flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded cursor-pointer" style={{ color: "#d97706", border: "1px solid #f59e0b", background: "#fef3c7" }}>
                <Camera className="h-3.5 w-3.5" /> Pridať foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      const file = files[0];
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        if (ev.target?.result) {
                          setDefectPhotos([...defectPhotos, ev.target!.result as string]);
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                    e.target.value = "";
                  }}
                  disabled={photoUploading}
                />
              </label>
            </div>
          </div>
          {/* Severity — no default */}
          <div>
            <Label className="text-[11px] font-semibold mb-1 block">Závažnosť *</Label>
            <RadioGroup value={defectSeverity} onValueChange={(v) => setDefectSeverity(v as "minor" | "blocking")} className="space-y-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="minor" id="sev-minor" />
                <Label htmlFor="sev-minor" className="text-[12px] font-normal cursor-pointer">🟡 Malá — možno expedovať</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="blocking" id="sev-blocking" />
                <Label htmlFor="sev-blocking" className="text-[12px] font-normal cursor-pointer">🔴 Vyžaduje opravu pred expedíciou</Label>
              </div>
            </RadioGroup>
          </div>
          {/* Resolution (only for blocking) */}
          {defectSeverity === "blocking" && (
            <div>
              <Label className="text-[11px] font-semibold mb-1 block">Riešenie *</Label>
              <RadioGroup value={defectResolution} onValueChange={setDefectResolution} className="space-y-1">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="repair" id="res-repair" />
                  <Label htmlFor="res-repair" className="text-[12px] font-normal cursor-pointer">🔨 Opraviť existujúci kus</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="new" id="res-new" />
                  <Label htmlFor="res-new" className="text-[12px] font-normal cursor-pointer">🆕 Vyrobiť nový kus</Label>
                </div>
              </RadioGroup>
            </div>
          )}
          {/* Save */}
          <Button size="sm" disabled={!canSave} onClick={onSave} className="w-full" style={{ background: canSave ? "#d97706" : undefined }}>
            Uložiť vadu
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function QualityCheckDisplay({ check }: { check: any }) {
  const name = useProfileName(check.checked_by);
  const firstName = name ? name.split(" ")[0].slice(0, 8) : "–";
  return (
    <span
      className="inline-flex items-center gap-1 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
      style={{
        background: "#dcfce7",
        color: "#166534",
        border: "1px solid #16a34a",
        padding: "6px 12px",
        minHeight: 36,
        minWidth: 60,
        borderRadius: "9999px",
        fontSize: "12px",
        fontWeight: 500,
        lineHeight: 1,
      }}
    >
      QC ✓ {firstName}
    </span>
  );
}

function QualityCheckBadgeEmpty() {
  return (
    <span
      className="inline-flex items-center gap-1 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
      style={{
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #f59e0b",
        padding: "6px 12px",
        minHeight: 36,
        minWidth: 60,
        borderRadius: "9999px",
        fontSize: "12px",
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      <Shield className="h-3 w-3" />
      QC
    </span>
  );
}

function QualityCheckFullDisplay({ check }: { check: any }) {
  const name = useProfileName(check.checked_by);
  const date = new Date(check.checked_at);
  const dateStr = `${date.getDate()}.${date.getMonth() + 1}.${String(date.getFullYear()).slice(2)}`;
  return (
    <span style={{ color: "#166534", fontSize: "11px" }}>
      ✓ QC: {name || "–"} · {dateStr}
    </span>
  );
}

/* ═══════════════════════════════════════ */
/* VÝKRESY SECTION (header collapsible)    */
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
      <CollapsibleTrigger className="flex items-center gap-1 text-xs font-semibold cursor-pointer mt-2" style={{ color: "#6b7280" }}>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <FileText className="h-3 w-3" />
        📄 Výkresy ({files.length})
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

function DayCell({ dayIndex, todayDayIndex, cumulative, onOpenLog, statusColor, logs, weeklyGoal = 100 }: {
  dayIndex: number;
  todayDayIndex: number;
  cumulative: CumulativeInfo | null;
  onOpenLog: () => void;
  statusColor: string;
  logs: DailyLog[];
  weeklyGoal?: number;
}) {
  const isMobile = useIsMobile();
  const isToday = dayIndex === todayDayIndex;
  const isFuture = todayDayIndex >= 0 && dayIndex > todayDayIndex;
  const isPast = todayDayIndex >= 0 && dayIndex < todayDayIndex;
  const notCurrentWeek = todayDayIndex < 0;
  const hasData = cumulative !== null;
  const pct = cumulative?.percent ?? 0;

  const exactLog = logs.find(l => l.day_index === dayIndex);
  const isRetroactive = useMemo(() => {
    if (!exactLog || !isPast) return false;
    const loggedDate = new Date(exactLog.logged_at);
    const actualDay = new Date();
    actualDay.setDate(actualDay.getDate() - (todayDayIndex - dayIndex));
    // 12h threshold
    const diff = loggedDate.getTime() - actualDay.getTime();
    return diff > 12 * 60 * 60 * 1000;
  }, [exactLog, isPast, todayDayIndex, dayIndex]);

  // Check for "no production" log
  const isNoProduction = exactLog?.phase?.startsWith("Bez výroby");

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
  } else if (isPast && isNoProduction) {
    bg = "#f5f3f0";
    border = "#d0cdc8";
  } else if (isPast && cumulative?.hasLog && !isRetroactive) {
    // On-time log: green tint
    bg = "#f0faf0";
    border = "#86c083";
  } else if (isPast && cumulative?.hasLog && isRetroactive) {
    // Retroactive or edited log: orange tint
    bg = "#fef9f0";
    border = "#d97706";
  } else if (isPast && !cumulative?.hasLog) {
    // Missing log: red tint
    bg = "#fef2f2";
    border = "#e5a8a8";
    borderWidth = "1px";
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
        <span className="text-[10px] font-medium" style={{ color: "#6b7280" }}>{isMobile ? DAY_SHORT[dayIndex] : DAY_NAMES[dayIndex]}</span>
        {isToday && (
          <span className="text-[7px] font-bold px-1 py-[1px] rounded" style={{ background: "rgba(58,138,54,0.15)", color: "#3a8a36" }}>
            {pct >= weeklyGoal ? "🎉 DNES" : "DNES"}
          </span>
        )}
      </div>

      {hasData ? (
        <>
          <div className="flex items-center justify-between">
            <div className={`font-mono font-bold ${isMobile ? "text-lg" : "text-xl"}`} style={{ color: isNoProduction ? "#99a5a3" : pct >= 100 ? "#3a8a36" : "#1a1a1a" }}>{pct}%</div>
          </div>
          {cumulative?.phase && !isNoProduction && (
            <p className="text-[10px] text-muted-foreground truncate" title={cumulative.phase}>{cumulative.phase}</p>
          )}
          {isToday && !isMobile && (
            <span className="mt-0.5 w-full text-[9px] font-medium py-0.5 rounded transition-colors text-center"
              style={{ background: "rgba(58,138,54,0.08)", color: "#3a8a36", border: "1px solid rgba(58,138,54,0.2)" }}>
              Upravit log
            </span>
          )}
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center py-1">
          {isPast && !isFuture ? (
            <span className="text-[9px]" style={{ color: "#e5a8a8" }}>bez logu</span>
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
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const pendingRetryFiles = useRef<File[]>([]);
  const [retryBannerVisible, setRetryBannerVisible] = useState(false);

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
    const failed: File[] = [];
    for (const file of Array.from(files)) {
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const timeStr = `${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
      const ext = file.name.split(".").pop() || "jpg";
      const autoName = `${projectId}-Log-${dateStr}-${timeStr}.${ext}`;
      const renamedFile = new File([file], autoName, { type: file.type });
      try {
        await uploadFile("fotky", renamedFile);
        toast.success(`✓ ${autoName} nahráno`);
      } catch (err: any) {
        toast.error(`Upload selhal: ${err?.message || "neznámá chyba"}`);
        failed.push(file);
      }
    }
    if (failed.length > 0) {
      pendingRetryFiles.current = failed;
      setRetryBannerVisible(true);
    }
    listFiles("fotky", true);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  async function handleRetry() {
    const filesToRetry = [...pendingRetryFiles.current];
    pendingRetryFiles.current = [];
    setRetryBannerVisible(false);
    const failed: File[] = [];
    for (const file of filesToRetry) {
      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const timeStr = `${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;
      const ext = file.name.split(".").pop() || "jpg";
      const autoName = `${projectId}-Log-${dateStr}-${timeStr}.${ext}`;
      const renamedFile = new File([file], autoName, { type: file.type });
      try {
        await uploadFile("fotky", renamedFile);
        toast.success(`✓ ${autoName} nahráno`);
      } catch (err: any) {
        toast.error(`Upload selhal: ${err?.message || "neznámá chyba"}`);
        failed.push(file);
      }
    }
    if (failed.length > 0) {
      pendingRetryFiles.current = failed;
      setRetryBannerVisible(true);
    }
    listFiles("fotky", true);
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
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider font-medium" style={{ color: "hsl(var(--muted-foreground))" }}>Foto</span>
        {isMobile ? (
          <label className="flex items-center gap-2 px-4 py-3 rounded-xl text-[13px] font-medium transition-colors cursor-pointer active:opacity-70"
            style={{ border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))", minHeight: 48, minWidth: 120 }}>
            <Camera className="h-3.5 w-3.5" />
            Přidat foto
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        ) : (
          <label className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium cursor-pointer transition-colors"
            style={{ background: "hsl(var(--success) / 0.08)", color: "hsl(var(--success))", border: "1px solid hsl(var(--success) / 0.2)" }}>
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
            />
          </label>
        )}
      </div>

      {/* Retry banner */}
      {retryBannerVisible && pendingRetryFiles.current.length > 0 && (
        <div className="flex items-center justify-between gap-2 mb-2 px-3 py-2 rounded-lg text-xs"
          style={{ background: "hsl(var(--destructive) / 0.08)", border: "1px solid hsl(var(--destructive) / 0.2)", color: "hsl(var(--destructive))" }}>
          <span>{pendingRetryFiles.current.length} fotek se nenahrály</span>
          <div className="flex gap-2">
            <button onClick={handleRetry} className="font-semibold underline">Zkusit znovu</button>
            <button onClick={() => { pendingRetryFiles.current = []; setRetryBannerVisible(false); }} className="opacity-60">✕</button>
          </div>
        </div>
      )}

      {photos.length === 0 ? (
        <div className="h-16 rounded-md flex items-center justify-center text-xs border border-dashed border-border" style={{ color: "hsl(var(--muted-foreground))" }}>
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
                <div className="aspect-square rounded-md overflow-hidden bg-muted">
                  <img
                    src={photo.thumbnailUrl || photo.downloadUrl || ""}
                    alt={photo.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="text-[9px] text-center mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>{dateLabel}</div>
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

      {/* Hidden inputs for camera & file picker */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleUpload}
        disabled={uploading}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleUpload}
        disabled={uploading}
      />


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

/* ═══════════════════════════════════════ */
/* WEEK PICKER POPUP                       */
/* ═══════════════════════════════════════ */

function WeekPickerPopup({ currentWeekOffset, onSelectOffset, onClose, containerRef }: {
  currentWeekOffset: number;
  onSelectOffset: (offset: number) => void;
  onClose: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const popupRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function handleClick(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node) &&
          containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose, containerRef]);

  // Generate weeks: -4 to +12 from today
  const weeks = useMemo(() => {
    const todayMonday = getMonday(new Date());
    const result: { offset: number; monday: Date; friday: Date; weekNum: number; isCurrent: boolean; isToday: boolean }[] = [];
    for (let i = -4; i <= 12; i++) {
      const monday = addWeeks(todayMonday, i);
      const fri = new Date(monday);
      fri.setDate(fri.getDate() + 4);
      result.push({
        offset: i,
        monday,
        friday: fri,
        weekNum: getISOWeekNumber(monday),
        isCurrent: i === currentWeekOffset,
        isToday: i === 0,
      });
    }
    return result;
  }, [currentWeekOffset]);

  return (
    <div ref={popupRef}
      className="absolute top-full right-0 mt-1 z-50 rounded-lg shadow-lg py-1 overflow-y-auto"
      style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", maxHeight: 320, width: 240 }}
    >
      {weeks.map(w => (
        <button
          key={w.offset}
          onClick={() => onSelectOffset(w.offset)}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-muted/60"
          style={{
            background: w.isCurrent ? "hsl(var(--accent) / 0.1)" : w.isToday ? "hsl(var(--success) / 0.06)" : undefined,
            borderLeft: w.isCurrent ? "3px solid hsl(var(--accent))" : w.isToday ? "3px solid hsl(var(--success))" : "3px solid transparent",
          }}
        >
          <span className="font-mono text-[11px] font-bold min-w-[28px]" style={{
            color: w.isCurrent ? "hsl(var(--accent))" : w.isToday ? "hsl(var(--success))" : "hsl(var(--muted-foreground))"
          }}>
            T{w.weekNum}
          </span>
          <span className="text-[11px]" style={{ color: "hsl(var(--foreground))" }}>
            {fmtDate(w.monday)}–{fmtDate(w.friday)}{w.monday.getFullYear()}
          </span>
          {w.isToday && !w.isCurrent && (
            <span className="text-[8px] font-bold px-1 py-[1px] rounded ml-auto" style={{ background: "hsl(var(--success) / 0.12)", color: "hsl(var(--success))" }}>dnes</span>
          )}
          {w.isCurrent && (
            <Check className="h-3 w-3 ml-auto" style={{ color: "hsl(var(--accent))" }} />
          )}
        </button>
      ))}
    </div>
  );
}
