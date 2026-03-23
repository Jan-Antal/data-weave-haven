import { Badge } from "@/components/ui/badge";
import type { RiskLevel } from "@/data/projects";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { useTPVStatusOptions } from "@/hooks/useTPVStatusOptions";

const riskStyles: Record<string, string> = {
  "Low": "bg-success/15 text-success border-success/30",
  "Medium": "bg-warning/15 text-warning-foreground border-warning/30",
  "High": "bg-destructive/15 text-destructive border-destructive/30",
};

export function StatusBadge({ status }: { status: string }) {
  const { data: options = [] } = useProjectStatusOptions();
  const opt = options.find((o) => o.label === status);
  const color = opt?.color;

  if (color) {
    return (
      <Badge
        variant="outline"
        className="text-xs font-medium"
        style={{ backgroundColor: `${color}20`, color, borderColor: `${color}50` }}
      >
        {status}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs font-medium bg-muted text-muted-foreground">
      {status}
    </Badge>
  );
}

export function TPVStatusBadge({ status }: { status: string }) {
  const { data: options = [] } = useTPVStatusOptions();
  const opt = options.find((o) => o.label === status);
  const color = opt?.color;

  if (color) {
    return (
      <Badge
        variant="outline"
        className="text-[10px] font-medium px-1.5 py-0"
        style={{ backgroundColor: `${color}20`, color, borderColor: `${color}50` }}
      >
        {status}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0 bg-muted text-muted-foreground">
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
