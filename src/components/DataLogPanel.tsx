import { useState, useMemo } from "react";
import { useActivityLog, type ActivityLogEntry } from "@/hooks/useActivityLog";
import { useUserAnalytics, useUserRecentActions } from "@/hooks/useUserAnalytics";
import { useProjects } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Clock, Users, ChevronDown, ChevronRight } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { cs } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useDataLogHighlight } from "@/components/DataLogHighlightContext";

interface DataLogPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Category = "all" | "status" | "terminy" | "documents" | "projects" | "users";
type PanelTab = "activity" | "users";

const CATEGORY_PILLS: { value: Category; label: string }[] = [
  { value: "all", label: "Vše" },
  { value: "status", label: "Status" },
  { value: "terminy", label: "Termíny" },
  { value: "documents", label: "Dokumenty" },
  { value: "projects", label: "Projekty" },
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
  page_view: "bg-sky-400",
};

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
}: {
  entry: ActivityLogEntry;
  isSelected: boolean;
  onSelect: (entry: ActivityLogEntry) => void;
}) {
  const userName = entry.user_email?.split("@")[0] || "Uživatel";
  const time = format(new Date(entry.created_at), "HH:mm");
  const pid = entry.project_id;
  const isSystemEntry = pid === "_system_";

  const projectLabel = !isSystemEntry ? <span className="font-semibold">{pid}</span> : null;

  let mainText: React.ReactNode = null;
  let subContent: React.ReactNode = null;

  switch (entry.action_type) {
    case "user_login":
      mainText = <>👤 {userName} se přihlásil/a</>;
      break;
    case "page_view":
      mainText = <>📄 {userName} zobrazil/a {entry.new_value || "stránku"}</>;
      break;
    case "status_change":
      mainText = <>{userName} změnil/a status {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] line-through px-1.5 py-0.5 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>{entry.old_value || "—"}</span>
          <span className="text-[10px]" style={{ color: '#9ca3af' }}>→</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#d1fae5', color: '#065f46' }}>{entry.new_value || "—"}</span>
        </div>
      );
      break;
    case "konstrukter_change":
      mainText = entry.detail
        ? <>{userName} změnil/a konstruktéra {entry.detail} v {projectLabel}</>
        : <>{userName} změnil/a konstruktéra {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] line-through px-1.5 py-0.5 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>{entry.old_value || "—"}</span>
          <span className="text-[10px]" style={{ color: '#9ca3af' }}>→</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#d1fae5', color: '#065f46' }}>{entry.new_value || "—"}</span>
        </div>
      );
      break;
    case "datum_smluvni_change":
      mainText = <>{userName} změnil/a datum smluvní {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] line-through px-1.5 py-0.5 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>{entry.old_value || "—"}</span>
          <span className="text-[10px]" style={{ color: '#9ca3af' }}>→</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#d1fae5', color: '#065f46' }}>{entry.new_value || "—"}</span>
        </div>
      );
      break;
    case "project_created":
      mainText = <>{userName} vytvořil/a {projectLabel}{entry.detail ? ` — ${entry.detail}` : ""}</>;
      break;
    case "project_deleted":
      mainText = <>{userName} smazal/a {projectLabel}{entry.detail ? ` — ${entry.detail}` : ""}</>;
      break;
    case "project_restored":
      mainText = <>{userName} obnovil/a {projectLabel}{entry.detail ? ` — ${entry.detail}` : ""}</>;
      break;
    case "document_uploaded":
      mainText = <>{userName} nahrál/a dokument do {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded truncate max-w-[220px]">📄 {entry.new_value}</span>
          {entry.detail && <span className="text-[10px] text-muted-foreground">{entry.detail}</span>}
        </div>
      );
      break;
    case "document_deleted":
      mainText = <>{userName} smazal/a dokument z {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded truncate max-w-[220px]">🗑 {entry.old_value}</span>
          {entry.detail && <span className="text-[10px] text-muted-foreground">{entry.detail}</span>}
        </div>
      );
      break;
    case "stage_created":
      mainText = <>{userName} vytvořil/a etapu {entry.detail} v {projectLabel}</>;
      break;
    case "stage_deleted":
      mainText = <>{userName} smazal/a etapu {entry.detail} z {projectLabel}</>;
      break;
    case "stage_status_change":
      mainText = <>{userName} změnil/a status {entry.detail} v {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] line-through px-1.5 py-0.5 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>{entry.old_value || "—"}</span>
          <span className="text-[10px]" style={{ color: '#9ca3af' }}>→</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#d1fae5', color: '#065f46' }}>{entry.new_value || "—"}</span>
        </div>
      );
      break;
    case "stage_konstrukter_change":
      mainText = <>{userName} změnil/a konstruktéra {entry.detail} v {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] line-through px-1.5 py-0.5 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>{entry.old_value || "—"}</span>
          <span className="text-[10px]" style={{ color: '#9ca3af' }}>→</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#d1fae5', color: '#065f46' }}>{entry.new_value || "—"}</span>
        </div>
      );
      break;
    case "stage_datum_smluvni_change":
      mainText = <>{userName} změnil/a datum smluvní {entry.detail} v {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] line-through px-1.5 py-0.5 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>{entry.old_value || "—"}</span>
          <span className="text-[10px]" style={{ color: '#9ca3af' }}>→</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#d1fae5', color: '#065f46' }}>{entry.new_value || "—"}</span>
        </div>
      );
      break;
    case "stage_document_uploaded":
      mainText = <>{userName} nahrál/a dokument do {entry.detail} v {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded truncate max-w-[220px]">📄 {entry.new_value}</span>
        </div>
      );
      break;
    case "stage_document_deleted":
      mainText = <>{userName} smazal/a dokument z {entry.detail} v {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded truncate max-w-[220px]">🗑 {entry.old_value}</span>
        </div>
      );
      break;
  }

  return (
    <button
      onClick={() => onSelect(entry)}
      className={cn(
        "flex gap-2.5 py-1.5 px-3 w-full text-left transition-colors hover:bg-muted/50 cursor-pointer",
        isSelected && "bg-amber-100"
      )}
    >
      <div className="pt-1.5 shrink-0">
        <div className={cn("w-2 h-2 rounded-full", DOT_COLORS[entry.action_type] || "bg-gray-400")} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-[1.4] text-foreground">{mainText}</p>
        {subContent}
        <p className="text-[10px] text-muted-foreground mt-0.5">{time}</p>
      </div>
    </button>
  );
}

/* ──────── Analytics tab ──────── */

function UserAnalyticsTab() {
  const { data: analytics, isLoading } = useUserAnalytics(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  if (isLoading) return <p className="text-xs text-muted-foreground p-4 text-center">Načítání…</p>;
  if (!analytics) return null;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2 p-3">
        <div className="bg-muted/50 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-foreground">{analytics.logins_today}</p>
          <p className="text-[10px] text-muted-foreground">Přihlášení dnes</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-foreground">{analytics.active_7d}</p>
          <p className="text-[10px] text-muted-foreground">Aktivní (7d)</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-foreground">{analytics.active_30d}</p>
          <p className="text-[10px] text-muted-foreground">Aktivní (30d)</p>
        </div>
      </div>

      {/* User table */}
      <div className="px-3 pb-3">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-1.5 font-medium">Uživatel</th>
              <th className="py-1.5 font-medium text-right">Přihlášení</th>
              <th className="py-1.5 font-medium text-right">Zobrazení</th>
            </tr>
          </thead>
          <tbody>
            {analytics.users.map((u) => (
              <UserAnalyticsRow
                key={u.user_email}
                user={u}
                expanded={expandedUser === u.user_email}
                onToggle={() => setExpandedUser(expandedUser === u.user_email ? null : u.user_email)}
              />
            ))}
          </tbody>
        </table>
        {analytics.users.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">Žádná data</p>
        )}
      </div>
    </div>
  );
}

function UserAnalyticsRow({
  user,
  expanded,
  onToggle,
}: {
  user: { user_email: string; last_login: string | null; login_count_30d: number; top_page: string | null; page_view_count_30d: number };
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data: recentActions, isLoading } = useUserRecentActions(
    expanded ? user.user_email : null,
    expanded
  );

  const userName = user.user_email.split("@")[0];
  const lastLogin = user.last_login
    ? format(new Date(user.last_login), "d.M. HH:mm")
    : "—";

  return (
    <>
      <tr
        className="border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <td className="py-1.5">
          <div className="flex items-center gap-1">
            {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            <span className="font-medium">{userName}</span>
          </div>
          <p className="text-[10px] text-muted-foreground ml-4">
            {lastLogin} · {user.top_page || "—"}
          </p>
        </td>
        <td className="py-1.5 text-right font-mono">{user.login_count_30d}</td>
        <td className="py-1.5 text-right font-mono">{user.page_view_count_30d}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={3} className="bg-muted/20 px-2 py-1.5">
            {isLoading ? (
              <p className="text-[10px] text-muted-foreground">Načítání…</p>
            ) : recentActions && recentActions.length > 0 ? (
              <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                {recentActions.map((a) => {
                  const actionLabel = getActionLabel(a.action_type, a.new_value, a.project_id);
                  return (
                    <div key={a.id} className="flex justify-between text-[10px]">
                      <span className="truncate mr-2">{actionLabel}</span>
                      <span className="text-muted-foreground shrink-0">
                        {format(new Date(a.created_at), "d.M. HH:mm")}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground">Žádné akce</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function getActionLabel(actionType: string, newValue: string | null, projectId: string): string {
  switch (actionType) {
    case "user_login": return "Přihlášení";
    case "page_view": return `Zobrazení: ${newValue || "stránka"}`;
    case "status_change": return `Status změněn (${projectId})`;
    case "project_created": return `Vytvořen projekt ${projectId}`;
    case "project_deleted": return `Smazán projekt ${projectId}`;
    case "document_uploaded": return `Nahrán dokument (${projectId})`;
    default: return `${actionType} (${projectId})`;
  }
}

/* ──────── Main panel ──────── */

export function DataLogPanel({ open, onOpenChange }: DataLogPanelProps) {
  const [tab, setTab] = useState<PanelTab>("activity");
  const [category, setCategory] = useState<Category>("all");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const { highlightProject } = useDataLogHighlight();

  const { data: projects = [] } = useProjects();
  const activeProjects = useMemo(() => projects.filter(p => !p.deleted_at), [projects]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useActivityLog({ category, projectId: projectFilter, userEmail: userFilter, enabled: open && tab === "activity" });

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

  const uniqueUsers = useMemo(() => {
    const set = new Set<string>();
    entries.forEach(e => { if (e.user_email) set.add(e.user_email); });
    return Array.from(set).sort();
  }, [entries]);

  const handleEntrySelect = (entry: ActivityLogEntry) => {
    setSelectedEntryId(entry.id);
    if (entry.project_id !== "_system_") {
      highlightProject(entry.project_id);
    }
  };

  if (!open) return null;

  return (
    <div className="w-[340px] shrink-0 border-l border-border bg-card flex flex-col datalog-panel overflow-hidden h-full">
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

            <Select value={userFilter ?? "__all__"} onValueChange={v => setUserFilter(v === "__all__" ? null : v)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Všichni uživatelé" />
              </SelectTrigger>
              <SelectContent className="z-[99999]">
                <SelectItem value="__all__">Všichni uživatelé</SelectItem>
                {uniqueUsers.map(u => (
                  <SelectItem key={u} value={u}>{u.split("@")[0]}</SelectItem>
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
        <UserAnalyticsTab />
      )}
    </div>
  );
}
