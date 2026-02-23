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

function SortableStageRow({ stage, project, onDelete }: { stage: ProjectStage; project: Project; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  const updateStage = useUpdateStage();

  const style = { transform: CSS.Transform.toString(transform), transition };

  const saveStage = (field: string, value: string) => {
    updateStage.mutate({ id: stage.id, field, value, projectId: project.project_id });
  };

  return (
    <TableRow ref={setNodeRef} style={style} className="bg-muted/30 h-9">
      <TableCell className="w-8">
        <div {...attributes} {...listeners} className="cursor-grab">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </TableCell>
      <TableCell>
        <InlineEditableCell value={stage.stage_name} onSave={(v) => saveStage("stage_name", v)} />
      </TableCell>
      <TableCell className="text-muted-foreground truncate" title={project.project_name}>{project.project_name}</TableCell>
      <TableCell className="text-muted-foreground truncate" title={project.klient || ""}>{project.klient || "—"}</TableCell>
      <TableCell>
        <InlineEditableCell value={stage.notes} type="people" peopleRole="PM" onSave={(v) => saveStage("notes", v)} />
      </TableCell>
      <TableCell>
        <InlineEditableCell value={stage.status} type="select" options={stageStatuses} onSave={(v) => saveStage("status", v)} />
      </TableCell>
      <TableCell>
        <InlineEditableCell value={project.risk} type="select" options={["Low", "Medium", "High"]} onSave={() => {}} displayValue={project.risk ? <RiskBadge level={project.risk} /> : "—"} />
      </TableCell>
      <TableCell className="text-muted-foreground truncate" title={project.datum_smluvni || ""}>{project.datum_smluvni || "—"}</TableCell>
      <TableCell>
        <InlineEditableCell value={stage.start_date} type="date" onSave={(v) => saveStage("start_date", v)} />
      </TableCell>
      <TableCell>
        <InlineEditableCell value={stage.end_date} type="date" onSave={(v) => saveStage("end_date", v)} />
      </TableCell>
      <TableCell className="text-muted-foreground">—</TableCell>
      <TableCell className="text-muted-foreground">—</TableCell>
      <TableCell>—</TableCell>
      <TableCell>—</TableCell>
      <TableCell>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDelete(stage.id)}>
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function StagesSection({ projectId, project }: { projectId: string; project: Project }) {
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
            <SortableStageRow key={stage.id} stage={stage} project={project} onDelete={(id) => setDeleteId(id)} />
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
}

export function PMStatusTable({ personFilter, statusFilter, search: externalSearch }: PMStatusTableProps) {
  const { data: projects = [], isLoading } = useProjects();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const statusLabels = statusOptions.map((s) => s.label);
  const updateProject = useUpdateProject();
  const qc = useQueryClient();
  const { sorted, sortCol, sortDir, toggleSort } = useSortFilter(projects, { personFilter, statusFilter }, externalSearch);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { isVisible, toggleColumn, columns } = useColumnVisibility("col-vis-pm-status", PM_COLUMNS);
  

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

  return (
    <div>
      <div className="rounded-lg border bg-card overflow-x-scroll always-scrollbar">
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/5">
              <TableHead className="w-8"></TableHead>
              {v("project_id") && <SortableHeader label="Project ID" column="project_id" {...sh} className="min-w-[130px]" />}
              {v("project_name") && <SortableHeader label="Project Name" column="project_name" {...sh} className="min-w-[180px]" />}
              {v("klient") && <SortableHeader label="Klient" column="klient" {...sh} className="min-w-[120px]" />}
              {v("pm") && <SortableHeader label="PM" column="pm" {...sh} className="min-w-[140px]" />}
              {v("status") && <SortableHeader label="Status" column="status" {...sh} className="min-w-[110px]" />}
              {v("risk") && <SortableHeader label="Risk" column="risk" {...sh} className="min-w-[80px]" />}
              {v("datum_smluvni") && <SortableHeader label="Smluvní" column="datum_smluvni" {...sh} className="min-w-[90px]" />}
              {v("zamereni") && <SortableHeader label="Zaměření" column="zamereni" {...sh} className="min-w-[90px]" />}
              {v("tpv_date") && <SortableHeader label="TPV" column="tpv_date" {...sh} className="min-w-[90px]" />}
              {v("expedice") && <SortableHeader label="Expedice" column="expedice" {...sh} className="min-w-[90px]" />}
              {v("predani") && <SortableHeader label="Předání" column="predani" {...sh} className="min-w-[90px]" />}
              {v("pm_poznamka") && <SortableHeader label="Poznámka" column="pm_poznamka" {...sh} className="min-w-[175px]" />}
              <ColumnVisibilityToggle columns={columns} isVisible={isVisible} toggleColumn={toggleColumn} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <Fragment key={p.id}>
                <TableRow className="hover:bg-muted/50 transition-colors h-9">
                  <TableCell className="w-8 cursor-pointer" onClick={() => toggleExpand(p.project_id)}>
                    <ExpandArrow projectId={p.project_id} isExpanded={expanded.has(p.project_id)} />
                  </TableCell>
                  {v("project_id") && <TableCell className="font-mono text-xs truncate" title={p.project_id}>{p.project_id}</TableCell>}
                  {v("project_name") && <TableCell><InlineEditableCell value={p.project_name} onSave={(val) => save(p.id, "project_name", val, p.project_name)} className="font-medium" /></TableCell>}
                  {v("klient") && <TableCell><InlineEditableCell value={p.klient} onSave={(val) => save(p.id, "klient", val, p.klient || "")} /></TableCell>}
                  {v("pm") && <TableCell><InlineEditableCell value={p.pm} type="people" peopleRole="PM" onSave={(val) => save(p.id, "pm", val, p.pm || "")} /></TableCell>}
                  {v("status") && (
                    <TableCell>
                      <InlineEditableCell value={p.status} type="select" options={statusLabels} onSave={(val) => save(p.id, "status", val, p.status || "")} displayValue={p.status ? <StatusBadge status={p.status} /> : "—"} />
                    </TableCell>
                  )}
                  {v("risk") && (
                    <TableCell>
                      <InlineEditableCell value={p.risk} type="select" options={["Low", "Medium", "High"]} onSave={(val) => save(p.id, "risk", val, p.risk || "")} displayValue={<RiskBadge level={p.risk || ""} />} />
                    </TableCell>
                  )}
                  {v("datum_smluvni") && <TableCell><InlineEditableCell value={p.datum_smluvni} type="date" onSave={(val) => save(p.id, "datum_smluvni", val, p.datum_smluvni || "")} /></TableCell>}
                  {v("zamereni") && <TableCell><InlineEditableCell value={p.zamereni} type="date" onSave={(val) => save(p.id, "zamereni", val, p.zamereni || "")} /></TableCell>}
                  {v("tpv_date") && <TableCell><InlineEditableCell value={p.tpv_date} type="date" onSave={(val) => save(p.id, "tpv_date", val, p.tpv_date || "")} /></TableCell>}
                  {v("expedice") && <TableCell><InlineEditableCell value={p.expedice} type="date" onSave={(val) => save(p.id, "expedice", val, p.expedice || "")} /></TableCell>}
                  {v("predani") && <TableCell><InlineEditableCell value={p.predani} type="date" onSave={(val) => save(p.id, "predani", val, p.predani || "")} /></TableCell>}
                  {v("pm_poznamka") && <TableCell><InlineEditableCell value={p.pm_poznamka} type="textarea" onSave={(val) => save(p.id, "pm_poznamka", val, p.pm_poznamka || "")} /></TableCell>}
                  <TableCell className="w-10" />
                </TableRow>
                {expanded.has(p.project_id) && <StagesSection projectId={p.project_id} project={p} />}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
