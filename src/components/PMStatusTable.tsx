import { useState, Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, RiskBadge } from "./StatusBadge";
import { InlineEditableCell } from "./InlineEditableCell";
import { CurrencyEditCell } from "./CurrencyEditCell";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { SortableHeader } from "./SortableHeader";

import { useProjects } from "@/hooks/useProjects";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { useSortFilter } from "@/hooks/useSortFilter";
import { useProjectStages, useUpdateStage, useAddStage, useDeleteStage, useReorderStages } from "@/hooks/useProjectStages";
import { ConfirmDialog } from "./ConfirmDialog";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, ChevronDown, Plus, Trash2, GripVertical } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProjectStage } from "@/hooks/useProjectStages";
import type { Project } from "@/hooks/useProjects";
import { useColumnVisibility } from "@/hooks/useColumnVisibility";
import { ColumnVisibilityToggle } from "./ColumnVisibilityToggle";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { getProjectRiskColor } from "@/hooks/useRiskHighlight";

const PM_COLUMNS = [
  { key: "project_id", label: "Project ID", locked: true },
  { key: "project_name", label: "Project Name", locked: true },
  { key: "klient", label: "Klient" },
  { key: "pm", label: "PM" },
  { key: "status", label: "Status" },
  { key: "risk", label: "Risk" },
  { key: "datum_smluvni", label: "Datum Smluvní" },
  { key: "zamereni", label: "Zaměření" },
  { key: "tpv_date", label: "TPV" },
  { key: "expedice", label: "Expedice" },
  { key: "predani", label: "Předání" },
  { key: "pm_poznamka", label: "Poznámka", locked: false },
];

const stageStatuses = ["Plánováno", "Probíhá", "Dokončeno", "Pozastaveno"];

function SortableStageRow({ stage, project, onDelete, isVisible, statusLabels, canEdit }: { stage: ProjectStage; project: Project; onDelete: (id: string) => void; isVisible: (key: string) => boolean; statusLabels: string[]; canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  const updateStage = useUpdateStage();

  const style = { transform: CSS.Transform.toString(transform), transition };

  const saveStage = (field: string, value: string) => {
    updateStage.mutate({ id: stage.id, field, value, projectId: project.project_id });
  };

  const v = isVisible;

  return (
    <TableRow ref={setNodeRef} style={style} className="bg-muted/20 h-9">
      <TableCell className="w-[32px]">
        <div {...attributes} {...listeners} className="cursor-grab pl-2">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </TableCell>
      {v("project_id") && (
        <TableCell className="font-mono text-xs truncate pl-4 text-muted-foreground">
          <InlineEditableCell value={stage.stage_name} onSave={(val) => saveStage("stage_name", val)} readOnly={!canEdit} />
        </TableCell>
      )}
      {v("project_name") && (
        <TableCell className="truncate text-muted-foreground text-xs" title={project.project_name}>{project.project_name}</TableCell>
      )}
      {v("pm") && (
        <TableCell><InlineEditableCell value={stage.pm} type="people" peopleRole="PM" onSave={(val) => saveStage("pm", val)} readOnly={!canEdit} /></TableCell>
      )}
      {v("status") && (
        <TableCell>
          <InlineEditableCell value={stage.status} type="select" options={statusLabels} onSave={(val) => saveStage("status", val)} displayValue={stage.status ? <StatusBadge status={stage.status} /> : "—"} readOnly={!canEdit} />
        </TableCell>
      )}
      {v("risk") && (
        <TableCell>
          <InlineEditableCell value={stage.risk} type="select" options={["Low", "Medium", "High"]} onSave={(val) => saveStage("risk", val)} displayValue={<RiskBadge level={stage.risk || ""} />} readOnly={!canEdit} />
        </TableCell>
      )}
      {v("datum_smluvni") && (
        <TableCell><InlineEditableCell value={stage.datum_smluvni} type="date" onSave={(val) => saveStage("datum_smluvni", val)} readOnly={!canEdit} /></TableCell>
      )}
      {v("zamereni") && (
        <TableCell><InlineEditableCell value={stage.zamereni} type="date" onSave={(val) => saveStage("zamereni", val)} readOnly={!canEdit} /></TableCell>
      )}
      {v("tpv_date") && (
        <TableCell><InlineEditableCell value={stage.tpv_date} type="date" onSave={(val) => saveStage("tpv_date", val)} readOnly={!canEdit} /></TableCell>
      )}
      {v("expedice") && (
        <TableCell><InlineEditableCell value={stage.expedice} type="date" onSave={(val) => saveStage("expedice", val)} readOnly={!canEdit} /></TableCell>
      )}
      {v("predani") && (
        <TableCell><InlineEditableCell value={stage.predani} type="date" onSave={(val) => saveStage("predani", val)} readOnly={!canEdit} /></TableCell>
      )}
      {v("pm_poznamka") && (
        <TableCell><InlineEditableCell value={stage.pm_poznamka} type="textarea" onSave={(val) => saveStage("pm_poznamka", val)} readOnly={!canEdit} /></TableCell>
      )}
      <TableCell>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDelete(stage.id)}>
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function StagesSection({ projectId, project, isVisible, statusLabels, canEdit }: { projectId: string; project: Project; isVisible: (key: string) => boolean; statusLabels: string[]; canEdit: boolean }) {
  const { data: stages = [] } = useProjectStages(projectId);
  const addStage = useAddStage();
  const deleteStage = useDeleteStage();
  const reorderStages = useReorderStages();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newStage, setNewStage] = useState({ stage_name: "", status: "", start_date: "", end_date: "", notes: "" });

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const nextSuffix = () => {
    const letters = stages.map(s => {
      const match = s.stage_name.match(/-([A-Z])$/);
      return match ? match[1] : null;
    }).filter(Boolean) as string[];
    const lastChar = letters.sort().pop();
    return lastChar ? String.fromCharCode(lastChar.charCodeAt(0) + 1) : "A";
  };

  const handleAddOpen = () => {
    setNewStage({ stage_name: `${projectId}-${nextSuffix()}`, status: "", start_date: "", end_date: "", notes: "" });
    setAddOpen(true);
  };

  const handleAdd = () => {
    if (!newStage.stage_name) return;
    addStage.mutate({
      project_id: projectId,
      stage_name: newStage.stage_name,
      stage_order: stages.length,
      status: newStage.status || undefined,
      start_date: newStage.start_date || undefined,
      end_date: newStage.end_date || undefined,
      notes: newStage.notes || undefined,
    });
    setAddOpen(false);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = stages.findIndex(s => s.id === active.id);
    const newIndex = stages.findIndex(s => s.id === over.id);
    const reordered = arrayMove(stages, oldIndex, newIndex);
    reorderStages.mutate({
      stages: reordered.map((s, i) => ({ id: s.id, stage_order: i })),
      projectId,
    });
  };

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stages.map(s => s.id)} strategy={verticalListSortingStrategy}>
          {stages.map(stage => (
            <SortableStageRow key={stage.id} stage={stage} project={project} onDelete={(id) => setDeleteId(id)} isVisible={isVisible} statusLabels={statusLabels} canEdit={canEdit} />
          ))}
        </SortableContext>
      </DndContext>
      <TableRow className="bg-muted/20 h-9">
        <TableCell colSpan={16}>
          <Button variant="ghost" size="sm" className="text-xs h-6" onClick={handleAddOpen}>
            <Plus className="h-3 w-3 mr-1" /> Přidat etapu
          </Button>
        </TableCell>
      </TableRow>

      <ConfirmDialog open={!!deleteId} onConfirm={() => { if (deleteId) { deleteStage.mutate({ id: deleteId, projectId }); setDeleteId(null); } }} onCancel={() => setDeleteId(null)} />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nová etapa</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Název etapy</Label><Input value={newStage.stage_name} onChange={(e) => setNewStage(s => ({ ...s, stage_name: e.target.value }))} /></div>
            <div><Label>Status</Label><Input value={newStage.status} onChange={(e) => setNewStage(s => ({ ...s, status: e.target.value }))} /></div>
            <div><Label>Začátek</Label><Input value={newStage.start_date} onChange={(e) => setNewStage(s => ({ ...s, start_date: e.target.value }))} /></div>
            <div><Label>Konec</Label><Input value={newStage.end_date} onChange={(e) => setNewStage(s => ({ ...s, end_date: e.target.value }))} /></div>
            <div><Label>Poznámka</Label><Input value={newStage.notes} onChange={(e) => setNewStage(s => ({ ...s, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Zrušit</Button>
            <Button onClick={handleAdd}>Přidat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExpandArrow({ projectId, isExpanded }: { projectId: string; isExpanded: boolean }) {
  const { data: stages = [] } = useProjectStages(projectId);
  const hasStages = stages.length > 0;

  if (isExpanded) {
    return <ChevronDown className={`h-5 w-5 stroke-[3] ${hasStages ? "text-accent" : "text-muted-foreground"}`} />;
  }
  return (
    <ChevronRight className={`h-5 w-5 stroke-[3] ${hasStages ? "text-accent fill-accent/20" : "text-muted-foreground/50"}`} />
  );
}

interface PMStatusTableProps {
  personFilter: string | null;
  statusFilter: string[];
  search: string;
  riskHighlight?: import("@/hooks/useRiskHighlight").RiskHighlightType;
}

const DEFAULT_STYLES: Record<string, React.CSSProperties> = {
  project_id: { minWidth: 90 },
  project_name: { minWidth: 160, flex: 2 },
  klient: { minWidth: 100, flex: 1 },
  pm: { minWidth: 110, flex: 1 },
  status: { minWidth: 100 },
  risk: { minWidth: 75 },
  datum_smluvni: { minWidth: 90 },
  zamereni: { minWidth: 90 },
  tpv_date: { minWidth: 90 },
  expedice: { minWidth: 90 },
  predani: { minWidth: 90 },
  pm_poznamka: { minWidth: 140, flex: 1 },
};

export function PMStatusTable({ personFilter, statusFilter, search: externalSearch, riskHighlight }: PMStatusTableProps) {
  const { data: projects = [], isLoading } = useProjects();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const statusLabels = statusOptions.map((s) => s.label);
  const updateProject = useUpdateProject();
  const qc = useQueryClient();
  const { sorted, sortCol, sortDir, toggleSort } = useSortFilter(projects, { personFilter, statusFilter }, externalSearch);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { isVisible, toggleColumn, columns } = useColumnVisibility("col-vis-pm-status", PM_COLUMNS);
  const { getLabel, getWidth, updateLabel, updateWidth } = useColumnLabels("pm-status");
  const [editMode, setEditMode] = useState(false);
  const { canEdit, canEditColumns } = useAuth();

  const toggleExpand = (pid: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  const save = (id: string, field: string, value: string, oldValue: string) => {
    updateProject.mutate({ id, field, value, oldValue });
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Načítání...</div>;

  const sh = { sortCol, sortDir, onSort: toggleSort };
  const v = isVisible;

  const colStyle = (key: string) => {
    const w = getWidth(key);
    const base = DEFAULT_STYLES[key] || {};
    return w ? { ...base, width: w, minWidth: w } : base;
  };

  const editProps = (key: string, defaultLabel: string) => ({
    editMode,
    customLabel: getLabel(key, defaultLabel),
    onLabelChange: (newLabel: string) => updateLabel(key, newLabel),
    onWidthChange: (newWidth: number) => updateWidth(key, newWidth),
  });

  return (
    <div>
      {editMode && (
        <div className="bg-accent/10 border border-accent/30 text-accent text-xs font-medium px-3 py-1.5 rounded-t-lg">
          Režim úpravy sloupců
        </div>
      )}
      <div className={cn("rounded-lg border bg-card overflow-x-scroll always-scrollbar", editMode && "rounded-t-none border-t-0")}>
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/5">
              <TableHead style={{ minWidth: 32, width: 32 }} className="shrink-0"></TableHead>
              {v("project_id") && <SortableHeader label="Project ID" column="project_id" {...sh} style={colStyle("project_id")} {...editProps("project_id", "Project ID")} />}
              {v("project_name") && <SortableHeader label="Project Name" column="project_name" {...sh} style={colStyle("project_name")} {...editProps("project_name", "Project Name")} />}
              {v("pm") && <SortableHeader label="PM" column="pm" {...sh} style={colStyle("pm")} {...editProps("pm", "PM")} />}
              {v("status") && <SortableHeader label="Status" column="status" {...sh} style={colStyle("status")} {...editProps("status", "Status")} />}
              {v("risk") && <SortableHeader label="Risk" column="risk" {...sh} style={colStyle("risk")} {...editProps("risk", "Risk")} />}
              {v("datum_smluvni") && <SortableHeader label="Smluvní" column="datum_smluvni" {...sh} style={colStyle("datum_smluvni")} {...editProps("datum_smluvni", "Smluvní")} />}
              {v("zamereni") && <SortableHeader label="Zaměření" column="zamereni" {...sh} style={colStyle("zamereni")} {...editProps("zamereni", "Zaměření")} />}
              {v("tpv_date") && <SortableHeader label="TPV" column="tpv_date" {...sh} style={colStyle("tpv_date")} {...editProps("tpv_date", "TPV")} />}
              {v("expedice") && <SortableHeader label="Expedice" column="expedice" {...sh} style={colStyle("expedice")} {...editProps("expedice", "Expedice")} />}
              {v("predani") && <SortableHeader label="Předání" column="predani" {...sh} style={colStyle("predani")} {...editProps("predani", "Předání")} />}
              {v("pm_poznamka") && <SortableHeader label="Poznámka" column="pm_poznamka" {...sh} style={colStyle("pm_poznamka")} {...editProps("pm_poznamka", "Poznámka")} />}
              <ColumnVisibilityToggle columns={columns} isVisible={isVisible} toggleColumn={toggleColumn} editMode={editMode} onToggleEditMode={canEditColumns ? () => setEditMode(!editMode) : undefined} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <Fragment key={p.id}>
                <TableRow className="hover:bg-muted/50 transition-colors h-9" style={(() => { const c = riskHighlight ? getProjectRiskColor(p, riskHighlight) : null; return c ? { backgroundColor: c } : {}; })()}>
                  <TableCell className="w-[32px] cursor-pointer" onClick={() => toggleExpand(p.project_id)}>
                    <ExpandArrow projectId={p.project_id} isExpanded={expanded.has(p.project_id)} />
                  </TableCell>
                  {v("project_id") && <TableCell className="font-mono text-xs truncate" title={p.project_id}>{p.project_id}</TableCell>}
                  {v("project_name") && <TableCell className="truncate"><InlineEditableCell value={p.project_name} onSave={(val) => save(p.id, "project_name", val, p.project_name)} className="font-medium" readOnly={!canEdit} /></TableCell>}
                  {v("pm") && <TableCell><InlineEditableCell value={p.pm} type="people" peopleRole="PM" onSave={(val) => save(p.id, "pm", val, p.pm || "")} readOnly={!canEdit} /></TableCell>}
                  {v("status") && (
                    <TableCell>
                      <InlineEditableCell value={p.status} type="select" options={statusLabels} onSave={(val) => save(p.id, "status", val, p.status || "")} displayValue={p.status ? <StatusBadge status={p.status} /> : "—"} readOnly={!canEdit} />
                    </TableCell>
                  )}
                  {v("risk") && (
                    <TableCell>
                      <InlineEditableCell value={p.risk} type="select" options={["Low", "Medium", "High"]} onSave={(val) => save(p.id, "risk", val, p.risk || "")} displayValue={<RiskBadge level={p.risk || ""} />} readOnly={!canEdit} />
                    </TableCell>
                  )}
                  {v("datum_smluvni") && <TableCell><InlineEditableCell value={p.datum_smluvni} type="date" onSave={(val) => save(p.id, "datum_smluvni", val, p.datum_smluvni || "")} readOnly={!canEdit} /></TableCell>}
                  {v("zamereni") && <TableCell><InlineEditableCell value={p.zamereni} type="date" onSave={(val) => save(p.id, "zamereni", val, p.zamereni || "")} readOnly={!canEdit} /></TableCell>}
                  {v("tpv_date") && <TableCell><InlineEditableCell value={p.tpv_date} type="date" onSave={(val) => save(p.id, "tpv_date", val, p.tpv_date || "")} readOnly={!canEdit} /></TableCell>}
                  {v("expedice") && <TableCell><InlineEditableCell value={p.expedice} type="date" onSave={(val) => save(p.id, "expedice", val, p.expedice || "")} readOnly={!canEdit} /></TableCell>}
                  {v("predani") && <TableCell><InlineEditableCell value={p.predani} type="date" onSave={(val) => save(p.id, "predani", val, p.predani || "")} readOnly={!canEdit} /></TableCell>}
                  {v("pm_poznamka") && <TableCell><InlineEditableCell value={p.pm_poznamka} type="textarea" onSave={(val) => save(p.id, "pm_poznamka", val, p.pm_poznamka || "")} readOnly={!canEdit} /></TableCell>}
                </TableRow>
                {expanded.has(p.project_id) && <StagesSection projectId={p.project_id} project={p} isVisible={v} statusLabels={statusLabels} canEdit={canEdit} />}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
