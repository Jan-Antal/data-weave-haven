import { memo, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProjectAttention, type AttentionItem } from "@/hooks/useProjectAttention";
import { type RecentProject } from "@/hooks/useRecentlyOpened";
import { useProjects, type Project } from "@/hooks/useProjects";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

interface MobilePrehledProps {
  recentProjects: RecentProject[];
  onProjectTap: (project: Project) => void;
}

const CZECH_MONTHS = [
  "ledna", "února", "března", "dubna", "května", "června",
  "července", "srpna", "září", "října", "listopadu", "prosince",
];

function formatCzechDate(d: Date): string {
  return `${d.getDate()}. ${CZECH_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatCZK(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)} M Kč`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)} tis. Kč`;
  return `${v.toFixed(0)} Kč`;
}

export const MobilePrehled = memo(function MobilePrehled({ recentProjects, onProjectTap }: MobilePrehledProps) {
  const { profile } = useAuth();
  const pmName = profile?.full_name || null;
  const { attentionItems, upcomingDates, projects } = useProjectAttention(pmName);
  const { data: allProjects = [] } = useProjects();
  const { data: rates = [] } = useExchangeRates();

  const today = new Date();
  const firstName = profile?.full_name?.split(" ")[0] || profile?.email?.split("@")[0] || "Uživatel";

  const DONE_STATUSES = new Set(["Fakturace", "Dokončeno"]);

  // My projects stats — if no person assigned, show all active (exclude done statuses)
  const myProjects = useMemo(() => {
    if (!pmName) return allProjects.filter(p => !p.status || !DONE_STATUSES.has(p.status));
    return allProjects.filter(p => p.pm === pmName);
  }, [allProjects, pmName]);

  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of myProjects) {
      const s = p.status || "Bez statusu";
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [myProjects]);

  const totalValue = useMemo(() => {
    let sum = 0;
    for (const p of myProjects) {
      if (p.prodejni_cena) {
        if (p.currency === "EUR") {
          const year = p.datum_smluvni ? new Date(p.datum_smluvni).getFullYear() : new Date().getFullYear();
          const rate = rates.find(r => r.year === year)?.eur_czk || 25;
          sum += p.prodejni_cena * rate;
        } else {
          sum += p.prodejni_cena;
        }
      }
    }
    return sum;
  }, [myProjects, rates]);

  // Resolve recent projects to full project objects
  const recentFull = useMemo(() => {
    return recentProjects.slice(0, 5).map(r => {
      const proj = allProjects.find(p => p.project_id === r.project_id);
      return { ...r, project: proj };
    }).filter(r => r.project);
  }, [recentProjects, allProjects]);

  return (
    <div className="flex flex-col gap-4 pb-20">
      {/* Greeting */}
      <div className="pt-1">
        <h2 className="text-lg font-semibold text-foreground">Ahoj {firstName} 👋</h2>
        <p className="text-sm text-muted-foreground">{formatCzechDate(today)}</p>
      </div>

      {/* Attention section */}
      <section>
        <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-2">⚠ Vyžaduje pozornost</h3>
        {attentionItems.length === 0 ? (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3 text-sm text-green-700 dark:text-green-400">
            ✅ Vše v pořádku — žádné urgentní položky
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {attentionItems.slice(0, 8).map((item, i) => (
              <AttentionCard key={`${item.project.project_id}-${i}`} item={item} onTap={onProjectTap} />
            ))}
          </div>
        )}
      </section>

      {/* My overview */}
      <section>
        <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-2">📊 Můj přehled</h3>
        <div className="bg-card border rounded-lg p-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Celkem projektů</span>
            <span className="text-sm font-semibold">{myProjects.length}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {Object.entries(statusBreakdown).map(([s, count]) => (
              <span key={s}>{s}: <strong className="text-foreground">{count}</strong></span>
            ))}
          </div>
          <div className="flex justify-between items-center pt-1 border-t">
            <span className="text-sm text-muted-foreground">Celková hodnota</span>
            <span className="text-sm font-semibold font-mono">{formatCZK(totalValue)}</span>
          </div>
        </div>
      </section>

      {/* Recently opened */}
      {recentFull.length > 0 && (
        <section>
          <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-2">🕐 Nedávno otevřené</h3>
          <div className="bg-card border rounded-lg divide-y">
            {recentFull.map(r => (
              <button
                key={r.project_id}
                onClick={() => r.project && onProjectTap(r.project)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left min-h-[44px] hover:bg-accent/50 transition-colors"
              >
                <span className="text-sm truncate mr-2">{r.project_name}</span>
                {r.project?.status && <StatusBadge status={r.project.status} />}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming dates */}
      {upcomingDates.length > 0 && (
        <section>
          <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-2">📅 Blížící se termíny (7 dní)</h3>
          <div className="bg-card border rounded-lg divide-y">
            {upcomingDates.map((ud, i) => (
              <button
                key={`${ud.projectId}-${ud.milestone}-${i}`}
                onClick={() => onProjectTap(ud.project)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left min-h-[44px] hover:bg-accent/50 transition-colors"
              >
                <span className="text-xs font-mono text-muted-foreground shrink-0 w-[60px]">
                  {ud.date.getDate()}.{ud.date.getMonth() + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{ud.projectName}</p>
                  <p className="text-xs text-muted-foreground">{ud.milestone}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
});

function AttentionCard({ item, onTap }: { item: AttentionItem; onTap: (p: Project) => void }) {
  const isCritical = item.severity === "critical";
  return (
    <button
      onClick={() => onTap(item.project)}
      className={cn(
        "w-full text-left rounded-lg border overflow-hidden active:scale-[0.98] transition-all",
        isCritical
          ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"
          : "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20"
      )}
      style={{ borderLeftWidth: 4, borderLeftColor: isCritical ? "hsl(0 70% 50%)" : "hsl(35 90% 55%)" }}
    >
      <div className="px-3 py-2.5">
        <p className="text-sm font-medium truncate">{item.project.project_name}</p>
        <p className={cn("text-xs mt-0.5", isCritical ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400")}>
          {item.icon} {item.message}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] font-mono text-muted-foreground">{item.project.project_id}</span>
          {item.project.status && <StatusBadge status={item.project.status} />}
        </div>
      </div>
    </button>
  );
}
