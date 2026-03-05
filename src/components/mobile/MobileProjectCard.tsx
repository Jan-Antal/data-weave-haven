import { memo, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

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

interface MobileProjectCardProps {
  project: Project;
  onTap: (project: Project) => void;
  stages?: any[];
  dimmed?: boolean;
}

const RISK_COLORS: Record<string, string> = {
  High: "hsl(0 70% 50%)",
  Medium: "hsl(35 90% 55%)",
  Low: "hsl(142 60% 45%)",
};

export const MobileProjectCard = memo(function MobileProjectCard({ project, onTap, stages = [], dimmed }: MobileProjectCardProps) {
  const [expanded, setExpanded] = useState(false);
  const riskColor = project.risk ? RISK_COLORS[project.risk] : undefined;
  const hasStages = stages.length > 0;

  return (
    <div className={cn("bg-card rounded-lg border shadow-sm overflow-hidden", dimmed && "opacity-40")}>
      {/* Main card area */}
      <div
        className="flex items-stretch"
        style={{ borderLeft: `4px solid ${riskColor || 'hsl(var(--border))'}` }}
      >
        <button
          className="flex-1 text-left p-3 min-h-[44px]"
          onClick={() => onTap(project)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground font-mono">{project.project_id}</p>
              <p className="font-medium text-sm truncate">{project.project_name}</p>
              {project.klient && (
                <p className="text-xs text-muted-foreground mt-0.5">Klient: {project.klient}</p>
              )}
              {project.pm && (
                <p className="text-xs text-muted-foreground">PM: {project.pm}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {project.status && <StatusBadge status={project.status} />}
              {project.prodejni_cena != null && (
                <span className="text-xs font-mono text-muted-foreground">
                  {formatCurrency(project.prodejni_cena, project.currency || "CZK")}
                </span>
              )}
            </div>
          </div>
          {project.datum_smluvni && (
            <p className="text-xs text-muted-foreground mt-1">Datum S.: {project.datum_smluvni}</p>
          )}
        </button>
        {hasStages && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-3 flex items-center border-l border-border min-w-[44px] justify-center"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        )}
      </div>
      {/* Expanded stages */}
      {expanded && hasStages && (
        <div className="border-t bg-muted/30">
          {stages.map((stage) => (
            <div key={stage.id} className="px-4 py-2 border-b last:border-b-0 flex items-center justify-between min-h-[44px]">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{stage.stage_name}</p>
                {stage.konstrukter && <p className="text-[11px] text-muted-foreground">K: {stage.konstrukter}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {stage.status && <StatusBadge status={stage.status} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
