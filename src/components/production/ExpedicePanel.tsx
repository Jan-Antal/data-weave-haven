import { useState } from "react";
import { useProductionExpedice } from "@/hooks/useProductionSchedule";
import { getProjectColor } from "@/lib/projectColors";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

export function ExpedicePanel() {
  const { data: projects = [] } = useProductionExpedice();
  const [collapsed, setCollapsed] = useState(true);

  if (collapsed) {
    return (
      <div
        className="w-[40px] shrink-0 flex flex-col items-center py-3 cursor-pointer transition-colors"
        style={{ borderLeft: "1px solid #ece8e2", backgroundColor: "#ffffff" }}
        onClick={() => setCollapsed(false)}
      >
        <ChevronLeft className="h-3.5 w-3.5 mb-2" style={{ color: "#99a5a3" }} />
        <span className="text-sm">📦</span>
        {projects.length > 0 && (
          <span
            className="text-[8px] font-bold px-1 py-0.5 rounded-full mt-1"
            style={{ backgroundColor: "#3a8a36", color: "#ffffff" }}
          >
            {projects.length}
          </span>
        )}
        <span
          className="text-[8px] font-medium mt-2"
          style={{ color: "#99a5a3", writingMode: "vertical-rl", textOrientation: "mixed" }}
        >
          Expedice
        </span>
      </div>
    );
  }

  return (
    <div className="w-[230px] shrink-0 flex flex-col" style={{ borderLeft: "1px solid #ece8e2", backgroundColor: "#ffffff" }}>
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid #ece8e2" }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">📦</span>
          <span className="text-[13px] font-semibold" style={{ color: "#223937" }}>Expedice</span>
          {projects.length > 0 && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "rgba(58,138,54,0.12)", color: "#3a8a36" }}
            >
              {projects.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="p-0.5 rounded hover:bg-gray-100 transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" style={{ color: "#99a5a3" }} />
        </button>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {projects.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[10px]" style={{ color: "#99a5a3" }}>Žádné dokončené položky</p>
          </div>
        )}
        {projects.map((group) => (
          <div
            key={group.project_id}
            className="rounded-lg p-2 space-y-1.5"
            style={{ backgroundColor: "#ffffff", border: "1px solid #ece8e2" }}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold truncate" style={{ color: "#3a8a36" }}>
                  {group.project_name}
                </div>
                <div className="font-mono text-[8px]" style={{ color: "#99a5a3" }}>
                  {group.project_id}
                </div>
              </div>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                style={{ backgroundColor: "#3a8a36", color: "#ffffff" }}
              >
                {group.count} ks
              </span>
            </div>
            <div className="space-y-[2px]">
              {group.items.map((item) => (
                <div key={item.id} className="flex items-center gap-1.5">
                  <Check className="shrink-0" style={{ width: 12, height: 12, color: "#3a8a36", strokeWidth: 3 }} />
                  <span className="text-[10px] truncate flex-1" style={{ color: "#6b7a78" }}>
                    {item.item_name}
                  </span>
                  {item.completed_at && (
                    <span className="font-mono text-[8px] shrink-0" style={{ color: "#99a5a3" }}>
                      {new Date(item.completed_at).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
