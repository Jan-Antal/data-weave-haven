import { Badge } from "@/components/ui/badge";
import type { ProjectStatus, RiskLevel } from "@/data/projects";

const statusStyles: Record<string, string> = {
  "Příprava": "bg-muted text-muted-foreground",
  "Engineering": "bg-info/15 text-info border-info/30",
  "TPV": "bg-warning/15 text-warning-foreground border-warning/30",
  "Výroba IN": "bg-accent/15 text-accent border-accent/30",
  "Expedice": "bg-info/15 text-info border-info/30",
  "Montáž": "bg-primary/10 text-primary border-primary/20",
  "Fakturace": "bg-success/15 text-success border-success/30",
  "Dokončeno": "bg-success/20 text-success border-success/40",
};

const riskStyles: Record<string, string> = {
  "Low": "bg-success/15 text-success border-success/30",
  "Medium": "bg-warning/15 text-warning-foreground border-warning/30",
  "High": "bg-destructive/15 text-destructive border-destructive/30",
};

export function StatusBadge({ status }: { status: ProjectStatus | string }) {
  return (
    <Badge variant="outline" className={`text-xs font-medium ${statusStyles[status] || "bg-muted text-muted-foreground"}`}>
      {status}
    </Badge>
  );
}

export function RiskBadge({ level }: { level: RiskLevel | string }) {
  if (!level) return null;
  return (
    <Badge variant="outline" className={`text-xs font-medium ${riskStyles[level] || "bg-muted text-muted-foreground"}`}>
      {level}
    </Badge>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
        <div 
          className="h-full rounded-full bg-accent transition-all" 
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{value}%</span>
    </div>
  );
}
