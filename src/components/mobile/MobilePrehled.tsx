import { memo, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProjectAttention, type AttentionItem } from "@/hooks/useProjectAttention";
import { type RecentProject } from "@/hooks/useRecentlyOpened";
import { useProjects, type Project } from "@/hooks/useProjects";
import { useProductionSchedule } from "@/hooks/useProductionSchedule";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

interface MobilePrehledProps {
  recentProjects: RecentProject[];
  onProjectTap: (project: Project) => void;
  onOpenDataLog?: () => void;
}

function getISOWeekNumber(d: Date): number {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getMonday(d: Date): string {
  const dt = new Date(d);
  const day = dt.getDay() || 7;
  dt.setDate(dt.getDate() - day + 1);
  return dt.toISOString().slice(0, 10);
}

function getActionLabel(actionType: string): { label: string; color: string } {
  switch (actionType) {
    case "status_change":
    case "stage_status_change":
      return { label: "Změna statusu", color: "#D97706" };
    case "konstrukter_change":
    case "stage_konstrukter_change":
      return { label: "Změna konstruktéra", color: "#D97706" };
    case "pm_change":
      return { label: "Změna PM", color: "#D97706" };
    case "kalkulant_change":
      return { label: "Změna kalkulanta", color: "#D97706" };
    case "datum_smluvni_change":
    case "stage_datum_smluvni_change":
      return { label: "Změna termínu", color: "#D97706" };
    case "document_uploaded":
    case "stage_document_uploaded":
      return { label: "Dokument nahrán", color: "#2563EB" };
    case "document_deleted":
    case "stage_document_deleted":
      return { label: "Dokument smazán", color: "#2563EB" };
    case "project_created":
      return { label: "Projekt vytvořen", color: "#059669" };
    case "project_deleted":
      return { label: "Projekt smazán", color: "#DC2626" };
    case "project_restored":
      return { label: "Projekt obnoven", color: "#059669" };
    case "item_completed":
    case "item_hotovo":
      return { label: "Položka dokončena", color: "#059669" };
    case "item_scheduled":
      return { label: "Položka naplánována", color: "#059669" };
    case "item_moved":
    case "item_moved_next_week":
      return { label: "Položka přesunuta", color: "#D97706" };
    case "item_paused":
    case "item_paused_vyroba":
      return { label: "Položka pozastavena", color: "#D97706" };
    case "item_cancelled":
      return { label: "Položka zrušena", color: "#DC2626" };
    case "item_qc_confirmed":
      return { label: "QC potvrzeno", color: "#059669" };
    case "item_expedice":
      return { label: "Expedováno", color: "#059669" };
    case "prodejni_cena_change":
      return { label: "Změna ceny", color: "#D97706" };
    case "forecast_committed":
      return { label: "Forecast zapsán", color: "#059669" };
    case "defect_reported":
      return { label: "Vada zaznamenaná", color: "#DC2626" };
    case "defect_resolved":
      return { label: "Vada opravena", color: "#059669" };
    case "vyroba_log_saved":
      return { label: "Log výroby", color: "#059669" };
    default:
      return { label: actionType.replace(/_/g, " "), color: "#6B7280" };
  }
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "teď";
  if (diffMin < 60) return `${diffMin} min`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs} h`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays} d`;
}

function formatUserShort(email: string): string {
  const name = email.split("@")[0];
  const parts = name.split(/[._-]/);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0).toUpperCase()}${parts[0].slice(1)} ${parts[1].charAt(0).toUpperCase()}.`;
  }
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
}

export const MobilePrehled = memo(function MobilePrehled({ recentProjects, onProjectTap, onOpenDataLog }: MobilePrehledProps) {
  const navigate = useNavigate();
  const { profile, linkedPersonName } = useAuth();
  const pmName = linkedPersonName || null;
  const { attentionItems } = useProjectAttention(pmName);
  const { data: allProjects = [] } = useProjects();

  // Overdue items
  const overdueItems = useMemo(() => {
    const seen = new Set<string>();
    return attentionItems.filter(item => {
      if (item.severity !== "critical" || !item.message.startsWith("Po termínu")) return false;
      if (seen.has(item.project.project_id)) return false;
      seen.add(item.project.project_id);
      return true;
    });
  }, [attentionItems]);

  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const visibleOverdue = showAllOverdue ? overdueItems : overdueItems.slice(0, 3);
  const hiddenCount = overdueItems.length - 3;

  // Production this week
  const { data: scheduleMap } = useProductionSchedule();
  const currentWeek = getMonday(new Date());
  const weekNumber = getISOWeekNumber(new Date());

  const weekStats = useMemo(() => {
    if (!scheduleMap) return { activeBundles: 0, avgPercent: 0, onTrack: 0, behind: 0 };
    const silo = scheduleMap.get(currentWeek);
    if (!silo) return { activeBundles: 0, avgPercent: 0, onTrack: 0, behind: 0 };

    let totalItems = 0;
    let completedItems = 0;
    let onTrack = 0;
    let behind = 0;

    for (const bundle of silo.bundles) {
      const active = bundle.items.filter(i => i.status === "scheduled" || i.status === "in_progress" || i.status === "completed");
      totalItems += active.length;
      completedItems += active.filter(i => i.status === "completed").length;

      const bundleComplete = active.length > 0 ? active.filter(i => i.status === "completed").length / active.length : 0;
      if (bundleComplete >= 0.5 || active.every(i => i.status === "completed")) {
        onTrack++;
      } else {
        behind++;
      }
    }

    const avgPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    return { activeBundles: silo.bundles.length, avgPercent, onTrack, behind };
  }, [scheduleMap, currentWeek]);

  // Recent activity — 10 entries with user info
  const { data: recentActivity = [] } = useQuery({
    queryKey: ["mobile-recent-activity"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("data_log") as any)
        .select("*")
        .neq("action_type", "user_session")
        .neq("action_type", "user_login")
        .neq("action_type", "session_end")
        .neq("action_type", "page_view")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    staleTime: 2 * 60 * 1000,
  });

  function extractDays(msg: string): string {
    const m = msg.match(/(\d+)\s*dní/);
    return m ? `${m[1]} dní` : "";
  }

  function formatDateCz(dateStr: string | null | undefined): string {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}.${d.getFullYear()}`;
  }

  return (
    <div className="flex flex-col pb-20 pt-3" style={{ background: "#ffffff" }}>
      <div style={{ padding: "0 12px" }}>
      {/* Section 1: Po termínu */}
      {overdueItems.length > 0 && (
        <section>
          <h3 className="uppercase text-[13px] font-medium tracking-[0.04em] mb-2" style={{ color: "#223937" }}>
            Po termínu ({overdueItems.length})
          </h3>
          <div className="flex flex-col gap-2">
            {visibleOverdue.map((item) => (
              <button
                key={item.project.project_id}
                onClick={() => onProjectTap(item.project)}
                className="w-full text-left active:scale-[0.98] transition-transform"
                style={{
                  background: "#ffffff",
                  border: "0.5px solid #F09595",
                  borderLeft: "3px solid #E24B4A",
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-bold truncate" style={{ color: "#501313" }}>
                    {item.project.project_name}
                  </p>
                  <span
                    className="shrink-0 text-[11px] font-medium px-2 py-0.5"
                    style={{ background: "#F7C1C1", color: "#791F1F", borderRadius: 20 }}
                  >
                    {extractDays(item.message)} po termínu
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[11px] font-mono" style={{ color: "#A32D2D" }}>
                    {item.project.project_id}
                  </span>
                  {item.project.status && (
                    <span className="text-[11px]" style={{ color: "#A32D2D" }}>·</span>
                  )}
                  {item.project.status && <StatusBadge status={item.project.status} />}
                </div>
                {item.project.pm && (
                  <p className="text-[11px] mt-1 text-muted-foreground">PM: {item.project.pm}</p>
                )}
                <p className="text-[11px] mt-0.5" style={{ color: "#DC2626" }}>
                  Datum smluvní: {formatDateCz(item.project.datum_smluvni)}
                </p>
              </button>
            ))}
            {!showAllOverdue && hiddenCount > 0 && (
              <button
                onClick={() => setShowAllOverdue(true)}
                className="w-full text-center text-[12px] font-medium py-2.5 active:scale-[0.98] transition-transform"
                style={{
                  border: "0.5px solid #F09595",
                  borderRadius: 10,
                  color: "#A32D2D",
                  background: "transparent",
                }}
              >
                Zobrazit dalších {hiddenCount} →
              </button>
            )}
            {showAllOverdue && overdueItems.length > 3 && (
              <button
                onClick={() => setShowAllOverdue(false)}
                className="w-full text-center text-[12px] font-medium py-2 active:scale-[0.98] transition-transform"
                style={{ color: "#A32D2D" }}
              >
                ↑ Skrýt
              </button>
            )}
      </div>
    </section>
  )}

  {overdueItems.length > 0 && <div className="my-3 border-t" style={{ borderColor: "#e5e3df" }} />}

  {/* Section 2: Výroba tento týden */}
  <section>
    <h3 className="uppercase text-[13px] font-medium tracking-[0.04em] mb-2" style={{ color: "#223937" }}>
      Výroba tento týden
    </h3>
    <button
      onClick={() => navigate("/vyroba")}
      className="w-full text-left active:scale-[0.98] transition-transform"
      style={{
        background: "#ffffff",
        border: "0.5px solid #e5e3df",
        borderRadius: 10,
        padding: 12,
      }}
    >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium" style={{ color: "#085041" }}>
                {weekStats.activeBundles} aktivní{weekStats.activeBundles === 1 ? " bundle" : weekStats.activeBundles >= 2 && weekStats.activeBundles <= 4 ? " bundly" : " bundlů"}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "#0F6E56" }}>
                T{weekNumber} · ø {weekStats.avgPercent}% dokončeno
              </p>
            </div>
            <div className="flex flex-col gap-1 items-end">
              <span
                className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ background: "#A7F3D0", color: "#065F46" }}
              >
                {weekStats.onTrack} on track
              </span>
              {weekStats.behind > 0 && (
                <span
                  className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={{ background: "#FECACA", color: "#991B1B" }}
                >
                  {weekStats.behind} pozadu
                </span>
              )}
            </div>
          </div>
        </button>
      </section>

      <div className="mx-0 my-3 border-t" style={{ borderColor: "#e5e3df" }} />

      {/* Section 3: Poslední aktivita */}
      <section>
        <h3 className="uppercase text-[13px] font-medium tracking-[0.04em] mb-2" style={{ color: "#223937" }}>
          Poslední aktivita
        </h3>
        {recentActivity.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Žádná nedávná aktivita</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {recentActivity.map((entry: any) => {
              const { label, color } = getActionLabel(entry.action_type);
              const projectName = allProjects.find(p => p.project_id === entry.project_id)?.project_name || entry.project_id;
              const userName = formatUserShort(entry.user_email || "");
              return (
                <div key={entry.id} className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center"
                    style={{ background: `${color}20` }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium truncate text-foreground">{projectName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {userName} · {label}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatRelativeTime(entry.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {recentActivity.length > 0 && onOpenDataLog && (
          <button
            onClick={onOpenDataLog}
            className="w-full text-center text-[12px] font-medium py-2.5 mt-3 active:scale-[0.98] transition-transform text-muted-foreground"
          >
            Zobrazit vše →
          </button>
        )}
      </section>
    </div>
  );
});
