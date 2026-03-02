import { useProductionExpedice } from "@/hooks/useProductionSchedule";
import { getProjectColor } from "@/lib/projectColors";
import { Check } from "lucide-react";

export function ExpedicePanel() {
  const { data: projects = [] } = useProductionExpedice();

  return (
    <div className="w-[230px] shrink-0 flex flex-col" style={{ borderLeft: "1px solid #ece8e2" }}>
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
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {projects.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[10px]" style={{ color: "#99a5a3" }}>Žádné dokončené položky</p>
          </div>
        )}
        {projects.map((group) => {
          const color = getProjectColor(group.project_id);
          return (
            <div
              key={group.project_id}
              className="rounded-lg p-2 space-y-1.5"
              style={{
                backgroundColor: "rgba(58,138,54,0.03)",
                border: "1px solid rgba(58,138,54,0.12)",
              }}
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
          );
        })}
      </div>
    </div>
  );
}
