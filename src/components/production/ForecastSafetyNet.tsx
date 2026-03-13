import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

export interface SafetyNetProject {
  project_id: string;
  project_name: string;
  estimated_hours: number;
  source: "scheduled" | "inbox" | "unplanned";
}

interface ForecastSafetyNetProps {
  projects: SafetyNetProject[];
}

const sourceBadge: Record<string, { label: string; bg: string }> = {
  scheduled: { label: "Plán", bg: "#3d4558" },
  inbox: { label: "Inbox", bg: "#14532d" },
  unplanned: { label: "Bez plánu", bg: "#451a03" },
};

export function ForecastSafetyNet({ projects }: ForecastSafetyNetProps) {
  const [expanded, setExpanded] = useState(false);

  if (projects.length === 0) return null;

  return (
    <div
      style={{
        background: "#1a1f2e",
        border: "1px solid #f59e0b",
        borderRadius: 8,
        marginBottom: 12,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        style={{ color: "#f59e0b", fontSize: 12, fontWeight: 600 }}
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>Záchranná síť — {projects.length} projektů bez termínu</span>
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {projects.map(p => {
            const badge = sourceBadge[p.source] || sourceBadge.unplanned;
            return (
              <div
                key={p.project_id}
                className="flex items-center gap-2 py-1"
                style={{ fontSize: 11 }}
              >
                <span
                  className="px-1.5 py-0.5 rounded font-mono text-[10px]"
                  style={{ background: "#2a2f3d", color: "#8899bb" }}
                >
                  {p.project_id}
                </span>
                <span className="flex-1 truncate" style={{ color: "#c8d0e0" }}>
                  {p.project_name}
                </span>
                <span style={{ color: "#8899bb" }}>~{p.estimated_hours}h</span>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{ background: badge.bg, color: "#e5e5e5" }}
                >
                  {badge.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
