import { memo, useState } from "react";
import { ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/currency";
import { parseAppDate, formatAppDate } from "@/lib/dateFormat";
import { cn } from "@/lib/utils";
import type { ProjectUrgency } from "@/hooks/useProjectAttention";

interface Project {
  id: string;
  project_id: string;
  project_name: string;
  klient?: string | null;
  pm?: string | null;
  status?: string | null;
  prodejni_cena?: number | null;
  currency?: string | null;
  datum_smluvni?: string | null;
  risk?: string | null;
}

interface Stage {
  id: string;
  stage_name: string;
  status?: string | null;
  konstrukter?: string | null;
  datum_smluvni?: string | null;
  [key: string]: any;
}

interface MobileProjectCardProps {
  project: Project;
  onTap: (project: Project) => void;
  onOpenTPV?: (project: Project) => void;
  onStageTap?: (stage: Stage) => void;
  stages?: Stage[];
  dimmed?: boolean;
  urgency?: ProjectUrgency | null;
}

const RISK_COLORS: Record<string, string> = {
  High: "hsl(0 70% 50%)",
  Medium: "hsl(35 90% 55%)",
  Low: "hsl(142 60% 45%)",
};

/** Count stages whose status differs from the project status */
function countDifferentStatuses(stages: Stage[], projectStatus: string | null | undefined): number {
  if (!stages.length || !projectStatus) return 0;
  return stages.filter(s => s.status && s.status !== projectStatus).length;
}

/** Check if a date is past or within N days */
function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = parseAppDate(dateStr);
  if (!d) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export const MobileProjectCard = memo(function MobileProjectCard({ project, onTap, onOpenTPV, onStageTap, stages = [], dimmed, urgency }: MobileProjectCardProps) {
  const [stagesExpanded, setStagesExpanded] = useState(false);
  const riskColor = project.risk ? RISK_COLORS[project.risk] : undefined;
  const hasStages = stages.length > 0;
  const diffCount = countDifferentStatuses(stages, project.status);

  return (
    <div className={cn("bg-card rounded-[10px] overflow-hidden transition-all active:scale-[0.98] active:opacity-90", dimmed && "opacity-40")} style={{ border: "0.5px solid hsl(var(--border))" }}>
      {/* Main card area */}
      <div
        className="flex items-stretch"
        style={{ borderLeft: `4px solid ${riskColor || 'hsl(var(--border))'}` }}
      >
        <button
          className="flex-1 text-left px-3 py-3 min-h-[44px] overflow-hidden min-w-0"
          onClick={() => onTap(project)}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground font-mono truncate">{project.project_id}</p>
              <p className="font-medium text-[13px] truncate">{project.project_name}</p>
              {project.klient && (
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{project.klient}</p>
              )}
              {project.pm && (
                <p className="text-[11px] text-muted-foreground truncate">PM: {project.pm}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0 w-[110px]">
              {project.status && (
                <div className="flex items-center gap-1">
                  <StatusBadge status={project.status} />
                  {diffCount > 0 && (
                    <span className="text-[10px] text-muted-foreground font-medium">+{diffCount}</span>
                  )}
                </div>
              )}
              {urgency && (
                <span
                  className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap",
                    urgency.severity === "critical"
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  )}
                >
                  {urgency.label}{urgency.count > 1 ? ` (+${urgency.count - 1})` : ""}
                </span>
              )}
              {project.prodejni_cena != null && (
              <span className="text-[11px] font-mono text-muted-foreground">
                  {formatCurrency(project.prodejni_cena, project.currency || "CZK")}
                </span>
              )}
            </div>
          </div>
          {project.datum_smluvni && (
            <p className="text-[11px] text-muted-foreground mt-1">Datum S.: {(() => { const d = parseAppDate(project.datum_smluvni); return d ? formatAppDate(d) : project.datum_smluvni; })()}</p>
          )}
        </button>

        {/* Arrow → opens TPV list */}
        {onOpenTPV && (
          <button
            onClick={() => onOpenTPV(project)}
            className="px-3 flex items-center border-l border-border min-w-[44px] justify-center"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Stages toggle link */}
      {hasStages && (
        <button
          onClick={() => setStagesExpanded(v => !v)}
          className="w-full flex items-center gap-1 px-3 py-1.5 border-t border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {stagesExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          <span>{stages.length} {stages.length === 1 ? "etapa" : stages.length < 5 ? "etapy" : "etap"}</span>
        </button>
      )}

      {/* Expanded stages */}
      {stagesExpanded && hasStages && (
        <div className="border-t bg-muted/30">
          {stages.map((stage) => {
            const days = daysUntil(stage.datum_smluvni);
            const isUrgent = days !== null && days <= 7;
            const isPast = days !== null && days < 0;

            return (
              <button
                key={stage.id}
                className="w-full px-4 py-2 border-b last:border-b-0 flex items-center justify-between min-h-[44px] text-left hover:bg-muted/50 transition-colors"
                onClick={() => onStageTap?.(stage)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold truncate">{stage.display_name || stage.stage_name}</p>
                    {stage.status && <StatusBadge status={stage.status} />}
                    {isUrgent && (
                      <span className={cn(
                        "text-[10px] font-medium px-1 py-0.5 rounded-full whitespace-nowrap shrink-0",
                        isPast
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      )}>
                        ⚠ {isPast ? `${Math.abs(days!)}d` : `${days}d`}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    {stage.project_id}
                    {stage.datum_smluvni && (
                      <> · Datum S.: {(() => { const d = parseAppDate(stage.datum_smluvni); return d ? formatAppDate(d) : stage.datum_smluvni; })()}</>
                    )}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
