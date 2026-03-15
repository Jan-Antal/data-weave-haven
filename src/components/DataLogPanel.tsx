import { useState, useMemo, useCallback, useEffect } from "react";
import { useActivityLog, useActivityLogUsers, type ActivityLogEntry, type DateRange } from "@/hooks/useActivityLog";
import { useUserAnalytics, useUserRecentActions, formatSessionDuration, type UserAnalytics } from "@/hooks/useUserAnalytics";
import { useProjects } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Clock, Users, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { format, isToday, isYesterday, differenceInDays } from "date-fns";
import { cs } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useDataLogHighlight } from "@/components/DataLogHighlightContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavigate } from "react-router-dom";

// Action type → route mapping
const VYROBA_ACTIONS = new Set([
  "item_hotovo", "item_qc_confirmed", "item_expedice", "item_moved_next_week",
  "vyroba_log_saved", "vyroba_no_activity", "phase_changed", "defect_reported",
  "defect_resolved", "item_paused_vyroba",
]);
const PLAN_VYROBY_ACTIONS = new Set([
  "item_scheduled", "item_moved", "item_completed", "item_paused", "item_split",
  "item_returned_to_inbox", "forecast_committed", "item_cancelled",
]);
const INDEX_ACTIONS = new Set([
  "status_change", "konstrukter_change", "datum_smluvni_change", "pm_change",
  "document_uploaded", "document_deleted", "stage_created", "stage_deleted",
  "stage_status_change", "project_created", "project_restored", "project_deleted",
  "stage_konstrukter_change", "stage_datum_smluvni_change",
  "stage_document_uploaded", "stage_document_deleted", "kalkulant_change",
  "prodejni_cena_change", "project_id_change",
]);

function getNavigationTarget(actionType: string): { route: string } | null {
  if (VYROBA_ACTIONS.has(actionType)) return { route: "/vyroba" };
  if (PLAN_VYROBY_ACTIONS.has(actionType)) return { route: "/plan-vyroby" };
  if (INDEX_ACTIONS.has(actionType)) return { route: "/" };
  return null;
}

interface DataLogPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCategory?: Category;
}

type Category = "all" | "status" | "terminy" | "documents" | "projects" | "users" | "vyroba";
type PanelTab = "activity" | "users";

const CATEGORY_PILLS: { value: Category; label: string }[] = [
  { value: "all", label: "Vše" },
  { value: "status", label: "Status" },
  { value: "terminy", label: "Termíny" },
  { value: "documents", label: "Dokumenty" },
  { value: "projects", label: "Projekty" },
  { value: "vyroba", label: "Výroba" },
  { value: "users", label: "Uživatelé" },
];

const DOT_COLORS: Record<string, string> = {
  status_change: "bg-amber-400",
  konstrukter_change: "bg-purple-500",
  datum_smluvni_change: "bg-red-500",
  project_created: "bg-green-500",
  project_restored: "bg-green-500",
  project_deleted: "bg-gray-800",
  document_uploaded: "bg-blue-500",
  document_deleted: "bg-orange-500",
  stage_created: "bg-green-500",
  stage_deleted: "bg-gray-800",
  stage_status_change: "bg-amber-400",
  stage_konstrukter_change: "bg-purple-500",
  stage_datum_smluvni_change: "bg-red-500",
  stage_document_uploaded: "bg-blue-500",
  stage_document_deleted: "bg-orange-500",
  user_login: "bg-emerald-500",
  session_end: "bg-teal-400",
  project_id_change: "bg-indigo-500",
  item_scheduled: "bg-sky-500",
  item_moved: "bg-indigo-400",
  item_completed: "bg-green-600",
  item_paused: "bg-yellow-500",
  item_cancelled: "bg-red-600",
  item_returned_to_inbox: "bg-slate-500",
  item_split: "bg-violet-500",
  pm_change: "bg-purple-500",
  kalkulant_change: "bg-purple-400",
  prodejni_cena_change: "bg-emerald-500",
  forecast_committed: "bg-sky-600",
  item_hotovo: "bg-green-500",
  item_qc_confirmed: "bg-green-600",
  item_expedice: "bg-teal-500",
  item_moved_next_week: "bg-indigo-400",
  item_paused_vyroba: "bg-yellow-500",
  vyroba_log_saved: "bg-blue-400",
  vyroba_no_activity: "bg-gray-400",
  defect_reported: "bg-red-500",
  defect_resolved: "bg-green-500",
  phase_changed: "bg-violet-500",
};

const CZECH_DAY_SHORT = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];

function formatSmartTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  const time = format(d, "HH:mm");
  if (isToday(d)) return `dnes ${time}`;
  if (isYesterday(d)) return `včera ${time}`;
  if (differenceInDays(new Date(), d) < 7) return `${CZECH_DAY_SHORT[d.getDay()]} ${time}`;
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()} ${time}`;
}

function formatDayHeader(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return `Dnes — ${format(d, "d. MMMM", { locale: cs })}`;
  if (isYesterday(d)) return `Včera — ${format(d, "d. MMMM", { locale: cs })}`;
  return format(d, "d. MMMM yyyy", { locale: cs });
}

function ActivityItem({
  entry,
  isSelected,
  onSelect,
  onNavigate,
}: {
  entry: ActivityLogEntry;
  isSelected: boolean;
  onSelect: (entry: ActivityLogEntry) => void;
  onNavigate?: (entry: ActivityLogEntry) => void;
}) {
  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.project_id === entry.project_id);
  const projectName = project?.project_name || entry.project_id;
  const dotClass = DOT_COLORS[entry.action_type] || "bg-gray-400";
  const actionLabel = getActionLabel(entry.action_type, entry.new_value, entry.project_id, entry.detail);
  const navTarget = getNavigationTarget(entry.action_type);
  const isNavigable = !!navTarget && entry.project_id !== "_system_";

  const handleClick = () => {
    onSelect(entry);
    if (isNavigable && onNavigate) {
      onNavigate(entry);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors border-l-2 group",
        isNavigable ? "cursor-pointer hover:bg-muted/50" : "cursor-default hover:bg-muted/30",
        isSelected ? "border-l-primary bg-muted/30" : "border-l-transparent"
      )}
    >
      <span className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", dotClass)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-medium text-foreground truncate">{projectName}</span>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-muted-foreground">
              {formatSmartTimestamp(entry.created_at)}
            </span>
            {isNavigable && (
              <ChevronRight className="h-3 w-3 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
          {actionLabel}
        </p>
        {entry.user_email && (
          <p className="text-[9px] text-muted-foreground/70 mt-0.5">
            {entry.user_email.split("@")[0]}
          </p>
        )}
        {renderSubContent(entry)}
      </div>
    </button>
  );
}

function renderSubContent(entry: ActivityLogEntry) {
  if (entry.action_type === "status_change" || entry.action_type === "stage_status_change") {
    if (entry.old_value && entry.new_value) {
      return (
        <p className="text-[10px] text-muted-foreground mt-0.5">
          <span className="line-through opacity-60">{entry.old_value}</span>{" → "}{entry.new_value}
        </p>
      );
    }
  }
  if (entry.action_type === "datum_smluvni_change" || entry.action_type === "stage_datum_smluvni_change") {
    if (entry.old_value && entry.new_value) {
      return (
        <p className="text-[10px] text-muted-foreground mt-0.5">
          <span className="line-through opacity-60">{entry.old_value}</span>{" → "}{entry.new_value}
        </p>
      );
    }
  }
  if (entry.detail) {
    return <p className="text-[10px] text-muted-foreground/80 mt-0.5 italic">{entry.detail}</p>;
  }
  return null;
}

function getActionLabel(actionType: string, newValue: string | null, projectId: string, detail?: string | null): string {
  switch (actionType) {
    case "status_change": return "Změna statusu projektu";
    case "stage_status_change": return "Změna statusu etapy";
    case "konstrukter_change": return "Změna konstruktéra";
    case "stage_konstrukter_change": return "Změna konstruktéra etapy";
    case "pm_change": return "Změna PM";
    case "kalkulant_change": return "Změna kalkulanta";
    case "datum_smluvni_change": return "Změna termínu";
    case "stage_datum_smluvni_change": return "Změna termínu etapy";
    case "document_uploaded": case "stage_document_uploaded": return `Dokument nahrán${newValue ? `: ${newValue}` : ""}`;
    case "document_deleted": case "stage_document_deleted": return `Dokument smazán${newValue ? `: ${newValue}` : ""}`;
    case "project_created": return "Projekt vytvořen";
    case "project_deleted": return "Projekt smazán";
    case "project_restored": return "Projekt obnoven";
    case "item_completed": case "item_hotovo": return "Položka dokončena";
    case "item_scheduled": return "Položka naplánována";
    case "item_moved": case "item_moved_next_week": return "Položka přesunuta";
    case "item_paused": case "item_paused_vyroba": return "Položka pozastavena";
    case "item_cancelled": return "Položka zrušena";
    case "item_qc_confirmed": return "QC potvrzeno";
    case "item_expedice": return "Expedováno";
    case "prodejni_cena_change": return "Změna ceny";
    case "forecast_committed": return "Forecast zapsán";
    case "defect_reported": return "Vada zaznamenaná";
    case "defect_resolved": return "Vada opravena";
    case "vyroba_log_saved": return "Log výroby uložen";
    case "user_login": return "Přihlášení";
    case "session_end": return "Konec session";
    default: return actionType.replace(/_/g, " ");
  }
}

function UserAnalyticsTab({ onShowUserActivity }: { onShowUserActivity: (email: string) => void }) {
  const { data, isLoading } = useUserAnalytics(true);
  const users = data?.users ?? [];
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  if (isLoading) return <p className="text-xs text-muted-foreground p-4 text-center">Načítání…</p>;
  if (users.length === 0) return <p className="text-xs text-muted-foreground p-4 text-center">Žádní uživatelé</p>;

  return (
    <div className="flex-1 overflow-y-auto">
      {users.map(user => (
        <UserAnalyticsRow
          key={user.user_email}
          user={user}
          expanded={expandedUser === user.user_email}
          onToggle={() => setExpandedUser(prev => prev === user.user_email ? null : user.user_email)}
          onShowAll={() => onShowUserActivity(user.user_email)}
        />
      ))}
    </div>
  );
}

function UserAnalyticsRow({ user, expanded, onToggle, onShowAll }: { user: UserAnalytics; expanded: boolean; onToggle: () => void; onShowAll: () => void }) {
  const { data: recentActions = [] } = useUserRecentActions(expanded ? user.user_email : null, expanded);

  return (
    <div className="border-b border-border">
      <button onClick={onToggle} className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-muted/30 transition-colors">
        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
          {user.user_email[0].toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-[11px] font-medium truncate">{user.full_name || user.user_email.split("@")[0]}</p>
          <p className="text-[10px] text-muted-foreground">
            {user.total_actions_30d} akcí · {user.last_activity ? formatSmartTimestamp(user.last_activity) : "–"}
          </p>
        </div>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="px-3 pb-2.5">
          {recentActions.length > 0 ? (
            <div className="space-y-1.5 mb-2">
              {recentActions.map((a, i) => (
                <div key={i} className="flex items-baseline justify-between text-[10px]">
                  <span className="text-muted-foreground truncate">{a.action_type.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground/70 shrink-0 ml-2">{formatSmartTimestamp(a.created_at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground mb-2">Žádné akce</p>
          )}
          <button onClick={onShowAll} className="text-[10px] text-primary hover:underline">Zobrazit vše →</button>
        </div>
      )}
    </div>
  );
}

export function DataLogPanel({ open, onOpenChange, defaultCategory }: DataLogPanelProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [tab, setTab] = useState<PanelTab>("activity");
  const [category, setCategory] = useState<Category>(defaultCategory ?? "all");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (defaultCategory) setCategory(defaultCategory);
  }, [defaultCategory]);
  const { highlightProject } = useDataLogHighlight();

  const { data: projects = [] } = useProjects();
  const activeProjects = useMemo(() => projects.filter(p => !p.deleted_at), [projects]);
  const { data: allUsers = [] } = useActivityLogUsers();

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useActivityLog({ category, projectId: projectFilter, userEmail: userFilter, dateRange, enabled: open && tab === "activity" });

  const entries = useMemo(() => data?.pages.flat() ?? [], [data]);

  const grouped = useMemo(() => {
    const groups: { date: string; items: ActivityLogEntry[] }[] = [];
    for (const entry of entries) {
      const day = entry.created_at.slice(0, 10);
      const last = groups[groups.length - 1];
      if (last && last.date === day) {
        last.items.push(entry);
      } else {
        groups.push({ date: day, items: [entry] });
      }
    }
    return groups;
  }, [entries]);

  const handleEntrySelect = (entry: ActivityLogEntry) => {
    setSelectedEntryId(entry.id);
    if (entry.project_id !== "_system_") {
      highlightProject(entry.project_id);
    }
  };

  const handleEntryNavigate = useCallback((entry: ActivityLogEntry) => {
    const target = getNavigationTarget(entry.action_type);
    if (!target || entry.project_id === "_system_") return;
    onOpenChange(false);
    // Clear datalog localStorage for all modules
    try {
      localStorage.setItem("datalog-panel-index", "false");
      localStorage.setItem("datalog-panel-vyroba", "false");
      localStorage.setItem("datalog-panel-plan-vyroby", "false");
    } catch {}
    navigate(target.route, { state: { openProjectId: entry.project_id } });
  }, [navigate, onOpenChange]);

  const handleShowUserActivity = useCallback((email: string) => {
    setUserFilter(email);
    setTab("activity");
  }, []);

  if (!open) return null;

  const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
    { value: "today", label: "Dnes" },
    { value: "yesterday", label: "Včera" },
    { value: "7d", label: "7 dní" },
    { value: "30d", label: "30 dní" },
    { value: "all", label: "Vše" },
  ];

  // Mobile: full screen overlay
  if (isMobile) {
    return (
      <div className="fixed inset-x-0 z-[100] bg-background flex flex-col" style={{ top: "var(--mobile-header-height, 56px)", bottom: "calc(56px + env(safe-area-inset-bottom, 0px))" }}>
        {/* Mobile header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <button onClick={() => onOpenChange(false)} className="flex items-center gap-1 text-sm text-muted-foreground min-h-[44px]">
            <ArrowLeft className="h-4 w-4" />
            <span>Zavřít</span>
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-[13px] font-semibold">Data Log</span>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex border-b shrink-0">
          <button
            onClick={() => setTab("activity")}
            className={cn(
              "flex-1 py-2 text-[12px] font-medium text-center transition-colors border-b-2",
              tab === "activity" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Aktivita
          </button>
          <button
            onClick={() => setTab("users")}
            className={cn(
              "flex-1 py-2 text-[12px] font-medium text-center transition-colors border-b-2 flex items-center justify-center gap-1.5",
              tab === "users" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Uživatelé
          </button>
        </div>

        {tab === "activity" ? (
          <>
            {/* Filters */}
            <div className="px-4 py-2.5 border-b space-y-2 shrink-0">
              <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
                <div className="flex gap-1 w-max">
                {CATEGORY_PILLS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => setCategory(p.value)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap",
                      category === p.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border hover:bg-muted"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Select value={userFilter ?? "__all__"} onValueChange={v => setUserFilter(v === "__all__" ? null : v)}>
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder="Všichni uživatelé" />
                  </SelectTrigger>
                  <SelectContent className="z-[99999]">
                    <SelectItem value="__all__">Všichni uživatelé</SelectItem>
                    {allUsers.map(u => (
                      <SelectItem key={u} value={u}>{u.split("@")[0]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={dateRange} onValueChange={v => setDateRange(v as DateRange)}>
                  <SelectTrigger className="h-7 text-xs w-[90px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[99999]">
                    {DATE_RANGE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Select value={projectFilter ?? "__all__"} onValueChange={v => setProjectFilter(v === "__all__" ? null : v)}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Všechny projekty" />
                </SelectTrigger>
                <SelectContent className="z-[99999]">
                  <SelectItem value="__all__">Všechny projekty</SelectItem>
                  {activeProjects.map(p => (
                    <SelectItem key={p.project_id} value={p.project_id}>{p.project_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Feed */}
            <div className="flex-1 overflow-y-auto pb-20">
              {isLoading && <p className="text-xs text-muted-foreground p-4 text-center">Načítání…</p>}
              {!isLoading && entries.length === 0 && <p className="text-xs text-muted-foreground p-4 text-center">Žádné záznamy</p>}
              {grouped.map(group => (
                <div key={group.date}>
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                      {formatDayHeader(group.items[0].created_at)}
                    </p>
                  </div>
                  {group.items.map(entry => (
                    <ActivityItem key={entry.id} entry={entry} isSelected={selectedEntryId === entry.id} onSelect={handleEntrySelect} onNavigate={handleEntryNavigate} />
                  ))}
                </div>
              ))}
              {hasNextPage && (
                <div className="p-3 text-center">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                    {isFetchingNextPage ? "Načítání…" : "Načíst další →"}
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : (
          <UserAnalyticsTab onShowUserActivity={handleShowUserActivity} />
        )}
      </div>
    );
  }

  // Desktop: sidebar
  return (
    <div className="w-[360px] shrink-0 border-l border-border bg-card flex flex-col datalog-panel overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-[13px] font-semibold font-sans">Data Log</span>
        </div>
        <button onClick={() => onOpenChange(false)} className="rounded-sm p-1 hover:bg-muted transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b shrink-0">
        <button
          onClick={() => setTab("activity")}
          className={cn(
            "flex-1 py-2 text-[12px] font-medium text-center transition-colors border-b-2",
            tab === "activity"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Aktivita
        </button>
        <button
          onClick={() => setTab("users")}
          className={cn(
            "flex-1 py-2 text-[12px] font-medium text-center transition-colors border-b-2 flex items-center justify-center gap-1.5",
            tab === "users"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Users className="h-3.5 w-3.5" />
          Uživatelé
        </button>
      </div>

      {tab === "activity" ? (
        <>
          {/* Filters */}
          <div className="px-3 py-2.5 border-b space-y-2 bg-card shrink-0">
            <div className="flex flex-wrap gap-1">
              {CATEGORY_PILLS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setCategory(p.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[10px] font-medium border transition-colors",
                    category === p.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex gap-1.5">
              <Select value={userFilter ?? "__all__"} onValueChange={v => setUserFilter(v === "__all__" ? null : v)}>
                <SelectTrigger className="h-7 text-xs flex-1">
                  <SelectValue placeholder="Všichni uživatelé" />
                </SelectTrigger>
                <SelectContent className="z-[99999]">
                  <SelectItem value="__all__">Všichni uživatelé</SelectItem>
                  {allUsers.map(u => (
                    <SelectItem key={u} value={u}>{u.split("@")[0]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={dateRange} onValueChange={v => setDateRange(v as DateRange)}>
                <SelectTrigger className="h-7 text-xs w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[99999]">
                  {DATE_RANGE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Select value={projectFilter ?? "__all__"} onValueChange={v => setProjectFilter(v === "__all__" ? null : v)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Všechny projekty" />
              </SelectTrigger>
              <SelectContent className="z-[99999]">
                <SelectItem value="__all__">Všechny projekty</SelectItem>
                {activeProjects.map(p => (
                  <SelectItem key={p.project_id} value={p.project_id}>{p.project_id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Feed */}
          <div className="flex-1 overflow-y-auto datalog-feed">
            {isLoading && (
              <p className="text-xs text-muted-foreground p-4 text-center">Načítání…</p>
            )}

            {!isLoading && entries.length === 0 && (
              <p className="text-xs text-muted-foreground p-4 text-center">Žádné záznamy</p>
            )}

            {grouped.map(group => (
              <div key={group.date}>
                <div className="px-3 pt-3 pb-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                    {formatDayHeader(group.items[0].created_at)}
                  </p>
                </div>
                {group.items.map(entry => (
                  <ActivityItem
                    key={entry.id}
                    entry={entry}
                    isSelected={selectedEntryId === entry.id}
                    onSelect={handleEntrySelect}
                  />
                ))}
              </div>
            ))}

            {entries.length > 0 && (
              <p className="text-[10px] text-muted-foreground text-center px-3 pt-2">
                Zobrazeno {entries.length} záznamů
              </p>
            )}

            {hasNextPage && (
              <div className="p-3 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? "Načítání…" : "Načíst další →"}
                </Button>
              </div>
            )}

            <p className="text-[10px] text-muted-foreground text-center px-3 py-2.5">
              Záznamy starší než 30 dní jsou automaticky mazány
            </p>
          </div>
        </>
      ) : (
        <UserAnalyticsTab onShowUserActivity={handleShowUserActivity} />
      )}
    </div>
  );
}
