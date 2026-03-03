import { useState, useMemo } from "react";
import { ChevronRight, GripVertical } from "lucide-react";
import { useProductionInbox, type InboxProject, type InboxItem } from "@/hooks/useProductionInbox";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { getProjectColor } from "@/lib/projectColors";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useDraggable, useDroppable } from "@dnd-kit/core";

function formatCompactCzk(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return `${Math.round(v)}`;
}

const SAMPLE_ITEMS = [
  { pid: "Z-2601-001", items: [{ name: "Kuchyňská linka A", code: "TK.01", h: 120 }, { name: "Obývací stěna", code: "OB.01", h: 85 }, { name: "Vestavěné skříně", code: "SK.01", h: 95 }] },
  { pid: "Z-2502-011", items: [{ name: "Recepční pult", code: "NB.01", h: 180 }, { name: "Jednací stoly 6ks", code: "ST.01", h: 65 }, { name: "Knihovna lobby", code: "KN.01", h: 140 }, { name: "Kancelářské příčky", code: "PR.01", h: 210 }] },
  { pid: "Z-2504-019", items: [{ name: "Kuchyň - spodní skříňky", code: "TK.02", h: 75 }, { name: "Kuchyň - horní skříňky", code: "TK.03", h: 55 }] },
  { pid: "Z-2513-002", items: [{ name: "Stolové desky 10ks", code: "SD.01", h: 35 }, { name: "Podnoží 10ks", code: "PD.01", h: 45 }, { name: "Montáž a povrch", code: "MP.01", h: 60 }] },
  { pid: "Z-2603-002", items: [{ name: "Doplňky set A", code: "DP.01", h: 40 }, { name: "Doplňky set B", code: "DP.02", h: 55 }] },
  { pid: "Z-2607-002", items: [{ name: "Skříň PPF Gate", code: "SK.02", h: 280 }] },
];

interface InboxPanelProps {
  overDroppableId?: string | null;
  showCzk?: boolean;
}

export function InboxPanel({ overDroppableId, showCzk }: InboxPanelProps) {
  const { data: projects = [], isLoading } = useProductionInbox();
  const { data: settings } = useProductionSettings();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandKey, setExpandKey] = useState(0);

  const { setNodeRef, isOver } = useDroppable({ id: "inbox-drop-zone" });

  const totalHours = useMemo(() => projects.reduce((s, p) => s + p.total_hours, 0), [projects]);
  const hourlyRate = settings?.hourly_rate ?? 550;
  const isHighlighted = isOver || overDroppableId === "inbox-drop-zone";

  const handleExpandAll = () => { setAllExpanded(true); setExpandKey((k) => k + 1); };
  const handleCollapseAll = () => { setAllExpanded(false); setExpandKey((k) => k + 1); };

  const handleSeedData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const rows = SAMPLE_ITEMS.flatMap(({ pid, items }) =>
        items.map((item) => ({
          project_id: pid,
          item_name: item.name,
          item_code: item.code,
          estimated_hours: item.h,
          estimated_czk: item.h * hourlyRate,
          sent_by: user.id,
          status: "pending" as const,
        }))
      );

      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));

      const scheduleRows: any[] = [];
      const weekOffsets = [
        { offset: -1, items: [{ pid: "Z-2601-001", name: "Kuchyňská linka B", code: "TK.04", h: 200, status: "completed", completed_at: new Date(monday.getTime() - 3 * 86400000).toISOString() }, { pid: "Z-2502-011", name: "Stoly meeting room", code: "ST.02", h: 150, status: "completed", completed_at: new Date(monday.getTime() - 2 * 86400000).toISOString() }] },
        { offset: 0, items: [{ pid: "Z-2504-019", name: "Obložení stěn", code: "OB.02", h: 320 }, { pid: "Z-2601-001", name: "Barový pult", code: "NB.02", h: 280 }, { pid: "Z-2513-002", name: "Desky speciál", code: "SD.02", h: 350 }] },
        { offset: 1, items: [{ pid: "Z-2603-002", name: "Police sada A", code: "PL.01", h: 180 }, { pid: "Z-2607-002", name: "Skříň prototyp", code: "SK.03", h: 200 }] },
        { offset: 2, items: [{ pid: "Z-2502-011", name: "Recepce fáze 2", code: "NB.03", h: 400 }, { pid: "Z-2504-019", name: "Obložení fáze 2", code: "OB.03", h: 320 }, { pid: "Z-2601-001", name: "Komoda XXL", code: "KM.01", h: 250 }] },
        { offset: 3, items: [{ pid: "Z-2513-002", name: "Stolové desky XL", code: "SD.03", h: 150 }] },
        { offset: 4, items: [{ pid: "Z-2607-002", name: "Skříň série", code: "SK.04", h: 300 }, { pid: "Z-2603-002", name: "Police sada B", code: "PL.02", h: 220 }] },
      ];

      for (const week of weekOffsets) {
        const weekDate = new Date(monday);
        weekDate.setDate(monday.getDate() + week.offset * 7);
        const weekStr = weekDate.toISOString().split("T")[0];
        for (let i = 0; i < week.items.length; i++) {
          const item = week.items[i];
          scheduleRows.push({
            project_id: item.pid,
            item_name: item.name,
            item_code: (item as any).code || null,
            scheduled_week: weekStr,
            scheduled_hours: item.h,
            scheduled_czk: item.h * hourlyRate,
            position: i,
            status: (item as any).status || "scheduled",
            completed_at: (item as any).completed_at || null,
            completed_by: (item as any).status === "completed" ? user.id : null,
            created_by: user.id,
          });
        }
      }

      const { error: inboxErr } = await supabase.from("production_inbox").insert(rows);
      if (inboxErr) throw inboxErr;
      const { error: schedErr } = await supabase.from("production_schedule").insert(scheduleRows);
      if (schedErr) throw schedErr;

      qc.invalidateQueries({ queryKey: ["production-inbox"] });
      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["production-expedice"] });
      toast({ title: "Testovací data vložena" });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <div
      ref={setNodeRef}
      className="w-[270px] shrink-0 flex flex-col transition-colors"
      style={{
        borderRight: "1px solid #ece8e2",
        backgroundColor: isHighlighted ? "rgba(59,130,246,0.04)" : "#ffffff",
        boxShadow: isHighlighted ? "inset 0 0 0 2px #3b82f6" : undefined,
      }}
    >
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid #ece8e2" }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">📥</span>
          <span className="text-[13px] font-semibold" style={{ color: "#223937" }}>Inbox</span>
          {projects.length > 0 && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: "rgba(217,151,6,0.12)", color: "#d97706" }}
            >
              {projects.reduce((s, p) => s + p.items.length, 0)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {projects.length > 0 && (
            <>
              <button onClick={handleExpandAll} className="text-[9px] hover:underline" style={{ color: "#6b7a78" }}>Rozbalit</button>
              <span className="text-[9px]" style={{ color: "#99a5a3" }}>|</span>
              <button onClick={handleCollapseAll} className="text-[9px] hover:underline" style={{ color: "#6b7a78" }}>Sbalit</button>
              <span className="text-[9px] ml-1.5 font-mono font-medium" style={{ color: "#6b7a78" }}>
                {Math.round(totalHours).toLocaleString("cs-CZ")}h
                {showCzk && ` ${formatCompactCzk(totalHours * hourlyRate)}`}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {projects.length === 0 && !isLoading && (
          <div className="text-center py-8">
            <p className="text-[10px] mb-3" style={{ color: "#99a5a3" }}>Inbox je prázdný</p>
          </div>
        )}
        {projects.map((project) => (
          <InboxProjectGroup key={`${project.project_id}-${expandKey}`} project={project} hourlyRate={hourlyRate} defaultExpanded={allExpanded} showCzk={showCzk} />
        ))}
      </div>

      {/* Subtle test data button at bottom */}
      {projects.length === 0 && !isLoading && (
        <div className="px-3 py-2 text-center" style={{ borderTop: "1px solid #ece8e2" }}>
          <button
            onClick={handleSeedData}
            disabled={loading}
            className="text-[9px] hover:underline transition-colors"
            style={{ color: "#99a5a3" }}
          >
            🧪 {loading ? "Vkládám..." : "Naplnit testovací data"}
          </button>
        </div>
      )}
    </div>
  );
}

function InboxProjectGroup({ project, hourlyRate, defaultExpanded, showCzk }: { project: InboxProject; hourlyRate: number; defaultExpanded: boolean; showCzk?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const color = getProjectColor(project.project_id);
  const totalCzkK = Math.round((project.total_hours * hourlyRate) / 1000);

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ backgroundColor: "#ffffff", border: "1px solid #ece8e2", borderLeft: `4px solid ${color}` }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-2.5 py-2 text-left transition-colors"
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8f7f5")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
      >
        <ChevronRight
          className="h-3 w-3 shrink-0 transition-transform duration-150"
          style={{ color: "#99a5a3", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold truncate" style={{ color: "#223937" }}>
            {project.project_name}
          </div>
          <div className="font-mono text-[9px]" style={{ color: "#99a5a3" }}>
            {project.project_id}
          </div>
        </div>
        <div className="text-right shrink-0">
          <span className="font-mono text-[12px] font-semibold" style={{ color: "#223937" }}>
            {Math.round(project.total_hours)}h
          </span>
          {showCzk && (
            <span className="font-mono text-[9px] ml-1" style={{ color: "#6b7a78" }}>
              {formatCompactCzk(project.total_hours * hourlyRate)}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-2 pb-2 space-y-[2px]">
          {project.items.map((item) => (
            <DraggableInboxItem key={item.id} item={item} projectName={project.project_name} />
          ))}
          <DraggableInboxProject project={project} />
        </div>
      )}
    </div>
  );
}

function DraggableInboxItem({ item, projectName }: { item: InboxItem; projectName: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `inbox-item-${item.id}`,
    data: {
      type: "inbox-item",
      itemId: item.id,
      itemName: item.item_name,
      itemCode: item.item_code,
      projectId: item.project_id,
      projectName,
      hours: item.estimated_hours,
      stageId: item.stage_id,
      scheduledCzk: item.estimated_czk,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="flex items-center gap-1.5 px-2 py-[5px] rounded-[5px] cursor-grab transition-all"
      style={{
        backgroundColor: "#ffffff",
        border: "1px solid #ece8e2",
        opacity: isDragging ? 0.3 : 1,
      }}
      onMouseEnter={(e) => {
        if (!isDragging) {
          e.currentTarget.style.backgroundColor = "rgba(59,130,246,0.04)";
          e.currentTarget.style.borderColor = "#3b82f6";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "#ffffff";
        e.currentTarget.style.borderColor = "#ece8e2";
      }}
    >
      <GripVertical className="h-3 w-3 shrink-0" style={{ color: "#99a5a3" }} />
      {item.item_code && (
        <span className="font-mono text-[10px] shrink-0" style={{ color: "#223937" }}>
          {item.item_code}
        </span>
      )}
      <span className="text-[11px] font-medium flex-1 truncate" style={{ color: "#6b7a78" }}>
        {item.item_name}
      </span>
      <span className="font-mono text-[10px] shrink-0" style={{ color: "#6b7a78" }}>
        {item.estimated_hours}h
      </span>
    </div>
  );
}

function DraggableInboxProject({ project }: { project: InboxProject }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `inbox-project-${project.project_id}`,
    data: {
      type: "inbox-project",
      projectId: project.project_id,
      projectName: project.project_name,
      hours: project.total_hours,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="flex items-center justify-center px-2 py-[5px] rounded-[5px] cursor-grab transition-all text-[9px] font-semibold"
      style={{
        border: "1.5px dashed #3a8a36",
        backgroundColor: "rgba(58,138,54,0.05)",
        color: "#3a8a36",
        opacity: isDragging ? 0.3 : 1,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderStyle = "solid";
        e.currentTarget.style.backgroundColor = "rgba(58,138,54,0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderStyle = "dashed";
        e.currentTarget.style.backgroundColor = "rgba(58,138,54,0.05)";
      }}
    >
      Přetáhni celý projekt ({Math.round(project.total_hours)}h)
    </div>
  );
}
