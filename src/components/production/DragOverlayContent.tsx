import { getProjectColor } from "@/lib/projectColors";

interface DragData {
  type: "inbox-item" | "inbox-items" | "inbox-project" | "silo-item" | "silo-bundle" | "forecast-block" | "forecast-subitem";
  itemName?: string;
  itemCode?: string | null;
  projectName?: string;
  projectId?: string;
  hours?: number;
  itemCount?: number;
}

export function DragOverlayContent({ data }: { data: DragData }) {
  const color = data.projectId ? getProjectColor(data.projectId) : "#3b82f6";

  // Multi-item drag from inbox
  if (data.type === "inbox-items") {
    return (
      <div
        className="px-3 py-2 rounded-lg shadow-lg"
        style={{
          backgroundColor: "#ffffff",
          border: `1px solid #ece8e2`,
          borderLeft: `4px solid ${color}`,
          transform: "rotate(1deg)",
          maxWidth: 220,
          opacity: 0.92,
        }}
      >
        <div className="text-[10px] font-semibold truncate" style={{ color: "#3a8a36" }}>
          {data.itemCount} položek
        </div>
        <div className="font-mono text-[9px] mt-0.5" style={{ color: "#6b7a78" }}>
          {Math.round(data.hours ?? 0)}h
        </div>
      </div>
    );
  }

  if (data.type === "inbox-item" || data.type === "silo-item") {
    return (
      <div
        className="px-3 py-2 rounded-lg shadow-lg"
        style={{
          backgroundColor: "#ffffff",
          border: `1px solid #ece8e2`,
          borderLeft: `4px solid ${color}`,
          transform: "rotate(2deg)",
          maxWidth: 200,
          opacity: 0.92,
        }}
      >
        <div className="flex items-center gap-1.5">
          {data.itemCode && (
            <span className="font-mono text-[10px] shrink-0" style={{ color: "#223937" }}>
              {data.itemCode}
            </span>
          )}
          <span className="text-[10px] font-medium truncate" style={{ color: "#6b7a78" }}>
            {data.itemName}
          </span>
        </div>
        <div className="font-mono text-[9px] mt-0.5" style={{ color: "#6b7a78" }}>
          {data.hours}h
        </div>
      </div>
    );
  }

  if (data.type === "inbox-project" || data.type === "silo-bundle") {
    return (
      <div
        className="px-3 py-2 rounded-lg shadow-lg"
        style={{
          backgroundColor: "#ffffff",
          border: `1px solid #ece8e2`,
          borderLeft: `4px solid ${color}`,
          transform: "rotate(1deg)",
          maxWidth: 220,
          opacity: 0.92,
        }}
      >
        <div className="text-[10px] font-semibold truncate" style={{ color: "#223937" }}>
          {data.projectName}
        </div>
        <div className="font-mono text-[9px] mt-0.5" style={{ color: "#6b7a78" }}>
          {data.type === "silo-bundle" && data.itemCount
            ? `${data.itemCount} položky · ${Math.round(data.hours ?? 0)}h`
            : `${Math.round(data.hours ?? 0)}h`}
        </div>
      </div>
    );
  }

  if (data.type === "forecast-block" || data.type === "forecast-subitem") {
    return (
      <div
        className="px-3 py-2 rounded-lg shadow-lg"
        style={{
          backgroundColor: "#1C1F26",
          border: `1px dashed #f59e0b`,
          borderLeft: `4px solid ${color}`,
          transform: "rotate(1deg)",
          maxWidth: 200,
          opacity: 0.92,
        }}
      >
        <div className="flex items-center gap-1.5">
          {data.itemCode && (
            <span className="font-mono text-[10px] shrink-0" style={{ color: "#f59e0b" }}>
              {data.itemCode}
            </span>
          )}
          <span className="text-[10px] font-medium truncate" style={{ color: "#e5e5e5" }}>
            {data.itemName || data.projectName}
          </span>
        </div>
        <div className="font-mono text-[9px] mt-0.5" style={{ color: "#8899bb" }}>
          {Math.round(data.hours ?? 0)}h
        </div>
      </div>
    );
  }

  return null;
}
