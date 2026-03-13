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
  scheduled: { label: "Plán", bg: "#2a3d3a" },
  inbox: { label: "Inbox", bg: "#14532d" },
  unplanned: { label: "Bez plánu", bg: "#451a03" },
};

export function ForecastSafetyNet({ projects }: ForecastSafetyNetProps) {
  const [expanded, setExpanded] = useState(false);

  if (projects.length === 0) return null;

  return (
    <div
      style={{
        background: "#1a2422",
        border: "1px solid #c4860a",
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
                  style={{ background: "#2a3d3a", color: "#7aa8a4" }}
                >
                  {p.project_id}
                </span>
                <span className="flex-1 truncate" style={{ color: "#a8c5c2" }}>
                  {p.project_name}
                </span>
                <span style={{ color: "#7aa8a4" }}>~{p.estimated_hours}h</span>
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
