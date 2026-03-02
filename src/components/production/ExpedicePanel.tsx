import { useProductionExpedice } from "@/hooks/useProductionSchedule";
import { getProjectColor } from "@/lib/projectColors";
import { Check } from "lucide-react";

export function ExpedicePanel() {
  const { data: projects = [] } = useProductionExpedice();

  return (
    <div className="w-[230px] shrink-0 flex flex-col border-l bg-card">
      <div className="px-3 py-2.5 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">📦</span>
          <span className="text-sm font-semibold">Expedice</span>
          {projects.length > 0 && (
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
              {projects.length}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {projects.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs text-muted-foreground">Žádné dokončené položky</p>
          </div>
        )}
        {projects.map((group) => {
          const color = getProjectColor(group.project_id);
          return (
            <div
              key={group.project_id}
              className="rounded-lg border p-2 space-y-1"
              style={{
                backgroundColor: "rgba(58,138,54,0.03)",
                borderColor: "rgba(58,138,54,0.12)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color }}>
                    {group.project_name}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">{group.project_id}</div>
                </div>
                <span className="bg-emerald-100 text-emerald-700 text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0">
                  {group.count} ks
                </span>
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-1.5 text-[10px]">
                    <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                    <span className="truncate flex-1">{item.item_name}</span>
                    {item.completed_at && (
                      <span className="text-muted-foreground font-mono text-[9px] shrink-0">
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
