import { useState, useMemo, useCallback } from "react";
import { useActivityLog, useActivityLogUsers, type ActivityLogEntry, type DateRange } from "@/hooks/useActivityLog";
import { useUserAnalytics, useUserRecentActions, formatSessionDuration, type UserAnalytics } from "@/hooks/useUserAnalytics";
import { useProjects } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Clock, Users, ChevronDown, ChevronRight } from "lucide-react";
import { format, isToday, isYesterday, differenceInDays } from "date-fns";
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
  session_end: "bg-teal-400",
  project_id_change: "bg-indigo-500",
  item_scheduled: "bg-sky-500",
  item_moved: "bg-indigo-400",
  item_completed: "bg-green-600",
  item_paused: "bg-yellow-500",
  item_cancelled: "bg-red-600",
  item_returned_to_inbox: "bg-slate-500",
  item_split: "bg-violet-500",
};

const CZECH_DAY_SHORT = ["Ne", "Po", "Út", "St", "Čt", "Pá", "So"];

/** Smart timestamp: dnes 14:30 / včera 09:15 / Po 14:30 / 5. 3. 2026 14:30 */
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
}: {
  entry: ActivityLogEntry;
  isSelected: boolean;
  onSelect: (entry: ActivityLogEntry) => void;
}) {
  const userName = entry.user_email?.split("@")[0] || "Uživatel";
  const timestamp = formatSmartTimestamp(entry.created_at);
  const pid = entry.project_id;
  const isSystemEntry = pid === "_system_";

  const projectLabel = !isSystemEntry ? <span className="font-semibold">{pid}</span> : null;

  let mainText: React.ReactNode = null;
  let subContent: React.ReactNode = null;

  switch (entry.action_type) {
    case "user_login":
      mainText = <>👤 <span className="font-medium">{userName}</span> se přihlásil/a</>;
      break;
    case "page_view":
      mainText = <>📄 <span className="font-medium">{userName}</span> zobrazil/a {entry.new_value || "stránku"}</>;
      break;
    case "session_end": {
      let durText = "";
      try {
        const d = JSON.parse(entry.detail || "{}");
        durText = ` (${d.duration_minutes ?? 0} min)`;
      } catch {}
      mainText = <>🕐 <span className="font-medium">{userName}</span> – session{durText}</>;
      break;
    }
    case "status_change":
      mainText = <>✏️ <span className="font-medium">{userName}</span> změnil/a status {projectLabel}</>;
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
        ? <>✏️ <span className="font-medium">{userName}</span> změnil/a konstruktéra {entry.detail} v {projectLabel}</>
        : <>✏️ <span className="font-medium">{userName}</span> změnil/a konstruktéra {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] line-through px-1.5 py-0.5 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>{entry.old_value || "—"}</span>
          <span className="text-[10px]" style={{ color: '#9ca3af' }}>→</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#d1fae5', color: '#065f46' }}>{entry.new_value || "—"}</span>
        </div>
      );
      break;
    case "datum_smluvni_change":
      mainText = <>📅 <span className="font-medium">{userName}</span> změnil/a datum smluvní {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] line-through px-1.5 py-0.5 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>{entry.old_value || "—"}</span>
          <span className="text-[10px]" style={{ color: '#9ca3af' }}>→</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#d1fae5', color: '#065f46' }}>{entry.new_value || "—"}</span>
        </div>
      );
      break;
    case "project_created":
      mainText = <>➕ <span className="font-medium">{userName}</span> vytvořil/a {projectLabel}{entry.detail ? ` — ${entry.detail}` : ""}</>;
      break;
    case "project_deleted":
      mainText = <>🗑 <span className="font-medium">{userName}</span> smazal/a {projectLabel}{entry.detail ? ` — ${entry.detail}` : ""}</>;
      break;
    case "project_restored":
      mainText = <>♻️ <span className="font-medium">{userName}</span> obnovil/a {projectLabel}{entry.detail ? ` — ${entry.detail}` : ""}</>;
      break;
    case "document_uploaded":
      mainText = <>📁 <span className="font-medium">{userName}</span> nahrál/a dokument do {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded truncate max-w-[220px]">📄 {entry.new_value}</span>
          {entry.detail && <span className="text-[10px] text-muted-foreground">{entry.detail}</span>}
        </div>
      );
      break;
    case "document_deleted":
      mainText = <>🗑 <span className="font-medium">{userName}</span> smazal/a dokument z {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded truncate max-w-[220px]">🗑 {entry.old_value}</span>
          {entry.detail && <span className="text-[10px] text-muted-foreground">{entry.detail}</span>}
        </div>
      );
      break;
    case "stage_created":
      mainText = <>➕ <span className="font-medium">{userName}</span> vytvořil/a etapu {entry.detail} v {projectLabel}</>;
      break;
    case "stage_deleted":
      mainText = <>🗑 <span className="font-medium">{userName}</span> smazal/a etapu {entry.detail} z {projectLabel}</>;
      break;
    case "stage_status_change":
      mainText = <>✏️ <span className="font-medium">{userName}</span> změnil/a status {entry.detail} v {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] line-through px-1.5 py-0.5 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>{entry.old_value || "—"}</span>
          <span className="text-[10px]" style={{ color: '#9ca3af' }}>→</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#d1fae5', color: '#065f46' }}>{entry.new_value || "—"}</span>
        </div>
      );
      break;
    case "stage_konstrukter_change":
      mainText = <>✏️ <span className="font-medium">{userName}</span> změnil/a konstruktéra {entry.detail} v {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] line-through px-1.5 py-0.5 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>{entry.old_value || "—"}</span>
          <span className="text-[10px]" style={{ color: '#9ca3af' }}>→</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#d1fae5', color: '#065f46' }}>{entry.new_value || "—"}</span>
        </div>
      );
      break;
    case "stage_datum_smluvni_change":
      mainText = <>📅 <span className="font-medium">{userName}</span> změnil/a datum smluvní {entry.detail} v {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] line-through px-1.5 py-0.5 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>{entry.old_value || "—"}</span>
          <span className="text-[10px]" style={{ color: '#9ca3af' }}>→</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#d1fae5', color: '#065f46' }}>{entry.new_value || "—"}</span>
        </div>
      );
      break;
    case "stage_document_uploaded":
      mainText = <>📁 <span className="font-medium">{userName}</span> nahrál/a dokument do {entry.detail} v {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded truncate max-w-[220px]">📄 {entry.new_value}</span>
        </div>
      );
      break;
    case "stage_document_deleted":
      mainText = <>🗑 <span className="font-medium">{userName}</span> smazal/a dokument z {entry.detail} v {projectLabel}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded truncate max-w-[220px]">🗑 {entry.old_value}</span>
        </div>
      );
      break;
    case "project_id_change":
      mainText = <>🔄 <span className="font-medium">{userName}</span> změnil/a ID projektu</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] line-through px-1.5 py-0.5 rounded" style={{ background: '#fee2e2', color: '#991b1b' }}>{entry.old_value || "—"}</span>
          <span className="text-[10px]" style={{ color: '#9ca3af' }}>→</span>
          <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: '#d1fae5', color: '#065f46' }}>{entry.new_value || "—"}</span>
        </div>
      );
      break;
    default:
      mainText = <><span className="font-medium">{userName}</span> — {entry.action_type} {projectLabel}</>;
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
        <p className="text-[10px] text-muted-foreground mt-0.5">{timestamp}</p>
      </div>
    </button>
  );
}

/* ──────── Analytics tab ──────── */

function UserAnalyticsTab({ onShowUserActivity }: { onShowUserActivity: (email: string) => void }) {
  const { data: analytics, isLoading } = useUserAnalytics(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  type SortKey = "user" | "last_activity" | "actions" | "session";
  const [sortKey, setSortKey] = useState<SortKey>("last_activity");
  const [sortAsc, setSortAsc] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const sortedUsers = useMemo(() => {
    if (!analytics) return [];
    return [...analytics.users].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "user": cmp = (a.full_name ?? a.user_email).localeCompare(b.full_name ?? b.user_email); break;
        case "last_activity": cmp = (a.last_activity ?? "").localeCompare(b.last_activity ?? ""); break;
        case "actions": cmp = a.total_actions_30d - b.total_actions_30d; break;
        case "session": cmp = a.avg_session_min - b.avg_session_min; break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [analytics, sortKey, sortAsc]);

  if (isLoading) return <p className="text-xs text-muted-foreground p-4 text-center">Načítání…</p>;
  if (!analytics) return null;

  const SortHeader = ({ label, k, align }: { label: string; k: SortKey; align?: string }) => (
    <th
      className={cn("py-1.5 font-medium cursor-pointer hover:text-foreground select-none", align)}
      onClick={() => toggleSort(k)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {sortKey === k && <span className="text-[9px]">{sortAsc ? "▲" : "▼"}</span>}
      </span>
    </th>
  );

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
              <SortHeader label="Uživatel" k="user" />
              <SortHeader label="Aktivita" k="last_activity" align="text-right" />
              <SortHeader label="Akce" k="actions" align="text-right" />
              <SortHeader label="Ø Session" k="session" align="text-right" />
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((u) => (
              <UserAnalyticsRow
                key={u.user_email}
                user={u}
                expanded={expandedUser === u.user_email}
                onToggle={() => setExpandedUser(expandedUser === u.user_email ? null : u.user_email)}
                onShowAll={() => onShowUserActivity(u.user_email)}
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
  onShowAll,
}: {
  user: UserAnalytics;
  expanded: boolean;
  onToggle: () => void;
  onShowAll: () => void;
}) {
  const { data: recentActions, isLoading } = useUserRecentActions(
    expanded ? user.user_email : null,
    expanded
  );

  const displayName = user.full_name || user.user_email.split("@")[0];
  const lastActivity = user.last_activity
    ? formatSmartTimestamp(user.last_activity)
    : "Nikdy";

  const ROLE_LABELS: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    pm: "PM",
    konstrukter: "Konstruktér",
    viewer: "Viewer",
  };
  const ROLE_COLORS: Record<string, string> = {
    owner: "bg-amber-100 text-amber-800",
    admin: "bg-red-100 text-red-800",
    pm: "bg-blue-100 text-blue-800",
    konstrukter: "bg-purple-100 text-purple-800",
    viewer: "bg-gray-100 text-gray-600",
  };

  return (
    <>
      <tr
        className="border-b border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <td className="py-1.5">
          <div className="flex items-center gap-1">
            {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            <span className="font-medium">{displayName}</span>
            {user.role && (
              <span className={cn("text-[8px] px-1 py-0.5 rounded font-medium leading-none", ROLE_COLORS[user.role] || "bg-gray-100 text-gray-600")}>
                {ROLE_LABELS[user.role] || user.role}
              </span>
            )}
          </div>
        </td>
        <td className="py-1.5 text-right text-muted-foreground text-[10px]">{lastActivity}</td>
        <td className="py-1.5 text-right font-mono">{user.total_actions_30d}</td>
        <td className="py-1.5 text-right font-mono">{formatSessionDuration(user.avg_session_min)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} className="bg-muted/20 px-2 py-1.5">
            {/* Summary row */}
            <div className="flex gap-3 text-[10px] text-muted-foreground mb-1.5 pb-1.5 border-b border-border/30">
              <span>Přihlášení: <strong className="text-foreground">{user.login_count_30d}</strong></span>
              <span>Posl. login: <strong className="text-foreground">{user.last_login ? formatSmartTimestamp(user.last_login) : "—"}</strong></span>
            </div>
            {isLoading ? (
              <p className="text-[10px] text-muted-foreground">Načítání…</p>
            ) : recentActions && recentActions.length > 0 ? (
              <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                {recentActions.map((a) => {
                  const actionLabel = getActionLabel(a.action_type, a.new_value, a.project_id, a.detail);
                  const ts = formatSmartTimestamp(a.created_at);
                  return (
                    <div key={a.id} className="flex justify-between text-[10px]">
                      <span className="truncate mr-2">{actionLabel}</span>
                      <span className="text-muted-foreground shrink-0">{ts}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground">Žádné akce</p>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onShowAll(); }}
              className="text-[10px] text-primary hover:underline mt-1.5 font-medium"
            >
              Zobrazit vše →
            </button>
          </td>
        </tr>
      )}
    </>
  );
}

function getActionLabel(actionType: string, newValue: string | null, projectId: string, detail?: string | null): string {
  switch (actionType) {
    case "user_login":
      return `👤 Přihlášení`;
    case "session_end": {
      let durText = "";
      try {
        const d = JSON.parse(detail || "{}");
        durText = formatSessionDuration(d.duration_minutes ?? 0);
      } catch {}
      return `🕐 Session ${durText}`;
    }
    case "status_change": return `✏️ Upravil ${projectId} · status`;
    case "konstrukter_change": return `✏️ Upravil ${projectId} · konstruktér`;
    case "datum_smluvni_change": return `📅 Upravil ${projectId} · datum`;
    case "project_created": return `➕ Vytvořen ${projectId}`;
    case "project_deleted": return `🗑 Smazán ${projectId}`;
    case "project_restored": return `♻️ Obnoven ${projectId}`;
    case "document_uploaded": return `📁 Nahrán dokument (${projectId})`;
    case "document_deleted": return `🗑 Smazán dokument (${projectId})`;
    case "stage_created": return `➕ Etapa ${detail || ""} (${projectId})`;
    case "stage_deleted": return `🗑 Etapa ${detail || ""} (${projectId})`;
    case "stage_status_change": return `✏️ Status etapy ${detail || ""} (${projectId})`;
    case "stage_konstrukter_change": return `✏️ Konstruktér etapy (${projectId})`;
    case "project_id_change": return `🔄 Změna ID (${projectId})`;
    default: return `${actionType} (${projectId})`;
  }
}

/* ──────── Main panel ──────── */

export function DataLogPanel({ open, onOpenChange }: DataLogPanelProps) {
  const [tab, setTab] = useState<PanelTab>("activity");
  const [category, setCategory] = useState<Category>("all");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
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
