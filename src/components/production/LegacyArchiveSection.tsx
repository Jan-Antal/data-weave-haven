import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useProductionExpedice } from "@/hooks/useProductionSchedule";

interface LegacyArchiveSectionProps {
  showLegacy: boolean;
  onToggle: () => void;
}

export function LegacyArchiveSection({ showLegacy, onToggle }: LegacyArchiveSectionProps) {
  const { data: expediceData } = useProductionExpedice();

  const legacyProjects = useMemo(() => {
    if (!expediceData) return [];
    return expediceData
      .map(p => ({
        ...p,
        items: p.items.filter(i => i.is_midflight),
      }))
      .filter(p => p.items.length > 0);
  }, [expediceData]);

  if (legacyProjects.length === 0) return null;

  const totalItems = legacyProjects.reduce((s, p) => s + p.items.length, 0);
  const totalHours = legacyProjects.reduce((s, p) => s + p.items.reduce((h, i) => h + i.scheduled_hours, 0), 0);

  return (
    <div className="mt-2" style={{ opacity: 0.75 }}>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 w-full px-3 py-2 text-left transition-colors rounded-md"
        style={{
          backgroundColor: "#f5f3f0",
          border: "1px solid #e5e0d8",
        }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#eceae6"; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#f5f3f0"; }}
      >
        {showLegacy ? (
          <ChevronDown className="h-3.5 w-3.5" style={{ color: "#6b7280" }} />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" style={{ color: "#6b7280" }} />
        )}
        <span className="text-[11px] font-semibold" style={{ color: "#6b7280" }}>
          Zobrazit históriu
        </span>
        <span className="text-[10px] font-normal" style={{ color: "#9ca3af" }}>
          ({totalItems} položek · {Math.round(totalHours)}h)
        </span>
      </button>

      {showLegacy && (
        <div className="mt-1 space-y-1 px-1">
          {legacyProjects.map(project => (
            <LegacyProjectCard key={project.project_id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}

function LegacyProjectCard({ project }: { project: { project_id: string; project_name: string; items: Array<{ id: string; item_name: string; item_code: string | null; scheduled_hours: number; scheduled_week: string }> } }) {
  const [expanded, setExpanded] = useState(false);
  const totalHours = project.items.reduce((s, i) => s + i.scheduled_hours, 0);

  return (
    <div className="rounded-md" style={{ backgroundColor: "#fafaf8", border: "1px solid #ece8e2" }}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" style={{ color: "#9ca3af" }} />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" style={{ color: "#9ca3af" }} />
        )}
        <span className="text-[11px] font-semibold truncate" style={{ color: "#6b7280" }}>
          {project.project_name}
        </span>
        <span className="text-[10px] font-sans shrink-0" style={{ color: "#9ca3af" }}>
          {project.project_id}
        </span>
        <span className="text-[9px] bg-slate-100 text-slate-500 border border-slate-300 rounded px-1 font-medium tracking-wide shrink-0">
          Legacy
        </span>
        <span className="ml-auto text-[10px] font-sans shrink-0" style={{ color: "#9ca3af" }}>
          {project.items.length} pol. · {Math.round(totalHours)}h
        </span>
      </button>

      {expanded && (
        <div className="px-2.5 pb-2 space-y-0.5">
          {project.items.map(item => (
            <div key={item.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded" style={{ backgroundColor: "#f5f3f0" }}>
              <span style={{ width: 10, fontSize: 9, color: "#9ca3af", fontWeight: 700 }}>✓</span>
              {item.item_code && (
                <span className="font-sans text-[9px] shrink-0" style={{ color: "#9ca3af" }}>{item.item_code}</span>
              )}
              <span className="text-[10px] flex-1 truncate" style={{ color: "#9ca3af", textDecoration: "line-through" }}>
                {item.item_name}
              </span>
              <span className="text-[9px] font-sans shrink-0" style={{ color: "#c4ccc9" }}>
                {item.scheduled_week}
              </span>
              <span className="text-[9px] font-sans shrink-0" style={{ color: "#c4ccc9" }}>
                {item.scheduled_hours}h
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
