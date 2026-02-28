import { useState, useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useActivityLog, type ActivityLogEntry } from "@/hooks/useActivityLog";
import { useProjects } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Clock } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { cs } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface DataLogPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenProject?: (projectId: string) => void;
}

type Category = "all" | "status" | "documents" | "projects";

const CATEGORY_PILLS: { value: Category; label: string }[] = [
  { value: "all", label: "Vše" },
  { value: "status", label: "Status" },
  { value: "documents", label: "Dokumenty" },
  { value: "projects", label: "Projekty" },
];

const DOT_COLORS: Record<string, string> = {
  status_change: "bg-amber-400",
  konstrukter_change: "bg-purple-500",
  project_created: "bg-green-500",
  project_restored: "bg-green-500",
  project_deleted: "bg-red-500",
  document_uploaded: "bg-blue-500",
  document_deleted: "bg-orange-500",
};

function formatDayHeader(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return `Dnes — ${format(d, "d. MMMM", { locale: cs })}`;
  if (isYesterday(d)) return `Včera — ${format(d, "d. MMMM", { locale: cs })}`;
  return format(d, "d. MMMM yyyy", { locale: cs });
}

function ActivityItem({ entry, onOpenProject }: { entry: ActivityLogEntry; onOpenProject?: (id: string) => void }) {
  const userName = entry.user_email?.split("@")[0] || "Uživatel";
  const time = format(new Date(entry.created_at), "HH:mm");
  const pid = entry.project_id;

  const projectLink = (
    <button
      className="font-semibold hover:underline cursor-pointer"
      onClick={() => onOpenProject?.(pid)}
    >
      {pid}
    </button>
  );

  let mainText: React.ReactNode = null;
  let subContent: React.ReactNode = null;

  switch (entry.action_type) {
    case "status_change":
      mainText = <>{userName} změnil/a status {projectLink}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] line-through text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{entry.old_value || "—"}</span>
          <span className="text-[10px] text-muted-foreground">→</span>
          <span className="text-[11px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">{entry.new_value || "—"}</span>
        </div>
      );
      break;
    case "konstrukter_change":
      mainText = entry.detail
        ? <>{userName} změnil/a konstruktéra {entry.detail} v {projectLink}</>
        : <>{userName} změnil/a konstruktéra {projectLink}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] line-through text-muted-foreground">{entry.old_value || "—"}</span>
          <span className="text-[10px] text-muted-foreground">→</span>
          <span className="text-[11px] font-medium">{entry.new_value || "—"}</span>
        </div>
      );
      break;
    case "project_created":
      mainText = <>{userName} vytvořil/a {projectLink}{entry.detail ? ` — ${entry.detail}` : ""}</>;
      break;
    case "project_deleted":
      mainText = <>{userName} smazal/a {projectLink}{entry.detail ? ` — ${entry.detail}` : ""}</>;
      break;
    case "project_restored":
      mainText = <>{userName} obnovil/a {projectLink}{entry.detail ? ` — ${entry.detail}` : ""}</>;
      break;
    case "document_uploaded":
      mainText = <>{userName} nahrál/a dokument do {projectLink}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] bg-muted px-1.5 py-0.5 rounded truncate max-w-[220px]">📄 {entry.new_value}</span>
          {entry.detail && <span className="text-[10px] text-muted-foreground">{entry.detail}</span>}
        </div>
      );
      break;
    case "document_deleted":
      mainText = <>{userName} smazal/a dokument z {projectLink}</>;
      subContent = (
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-[11px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded truncate max-w-[220px]">🗑 {entry.old_value}</span>
          {entry.detail && <span className="text-[10px] text-muted-foreground">{entry.detail}</span>}
        </div>
      );
      break;
  }

  return (
    <div className="flex gap-2.5 py-2 px-3">
      <div className="pt-1.5 shrink-0">
        <div className={cn("w-2 h-2 rounded-full", DOT_COLORS[entry.action_type] || "bg-gray-400")} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-[1.4] text-foreground">{mainText}</p>
        {subContent}
        <p className="text-[10px] text-muted-foreground mt-0.5">{time}</p>
      </div>
    </div>
  );
}

export function DataLogPanel({ open, onOpenChange, onOpenProject }: DataLogPanelProps) {
  const [category, setCategory] = useState<Category>("all");
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState<string | null>(null);

  const { data: projects = [] } = useProjects();
  const activeProjects = useMemo(() => projects.filter(p => !p.deleted_at), [projects]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useActivityLog({ category, projectId: projectFilter, userEmail: userFilter });

  const entries = useMemo(() => data?.pages.flat() ?? [], [data]);

  // Group by day
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

  // Unique users for filter
  const uniqueUsers = useMemo(() => {
    const set = new Set<string>();
    entries.forEach(e => { if (e.user_email) set.add(e.user_email); });
    return Array.from(set).sort();
  }, [entries]);

  const handleProjectClick = (projectId: string) => {
    onOpenChange(false);
    onOpenProject?.(projectId);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[380px] max-w-[90vw] p-0 flex flex-col [&>button]:hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <SheetTitle className="text-sm font-semibold">Data Log</SheetTitle>
          </div>
          <button onClick={() => onOpenChange(false)} className="rounded-sm p-1 hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 border-b space-y-2 bg-background sticky top-[49px] z-10">
          {/* Category pills */}
          <div className="flex flex-wrap gap-1">
            {CATEGORY_PILLS.map(p => (
              <button
                key={p.value}
                onClick={() => setCategory(p.value)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                  category === p.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Dropdowns */}
          <Select value={projectFilter ?? "__all__"} onValueChange={v => setProjectFilter(v === "__all__" ? null : v)}>
            <SelectTrigger className="h-8 text-xs">
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
            <SelectTrigger className="h-8 text-xs">
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
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <p className="text-xs text-muted-foreground p-4 text-center">Načítání…</p>
          )}

          {!isLoading && entries.length === 0 && (
            <p className="text-xs text-muted-foreground p-4 text-center">Žádné záznamy</p>
          )}

          {grouped.map(group => (
            <div key={group.date}>
              <div className="px-4 pt-3 pb-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                  {formatDayHeader(group.items[0].created_at)}
                </p>
              </div>
              {group.items.map(entry => (
                <ActivityItem key={entry.id} entry={entry} onOpenProject={handleProjectClick} />
              ))}
            </div>
          ))}

          {hasNextPage && (
            <div className="p-4 text-center">
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

          <p className="text-[10px] text-muted-foreground text-center px-4 py-3">
            Záznamy starší než 30 dní jsou automaticky mazány
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
