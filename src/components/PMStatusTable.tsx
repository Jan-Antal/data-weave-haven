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
      {/* Název etapy - editable text */}
      <TableCell>
        <InlineEditableCell value={stage.stage_name} onSave={(v) => saveStage("stage_name", v)} />
      </TableCell>
      {/* Project Name - inherited, read-only */}
      <TableCell className="text-muted-foreground truncate" title={project.project_name}>{project.project_name}</TableCell>
      {/* Klient - inherited, read-only */}
      <TableCell className="text-muted-foreground truncate" title={project.klient || ""}>{project.klient || "—"}</TableCell>
      {/* PM - editable people dropdown */}
      <TableCell>
        <InlineEditableCell value={stage.notes} type="people" peopleRole="PM" onSave={(v) => saveStage("notes", v)} />
      </TableCell>
      {/* Status - editable select */}
      <TableCell>
        <InlineEditableCell value={stage.status} type="select" options={stageStatuses} onSave={(v) => saveStage("status", v)} />
      </TableCell>
      {/* Risk - editable dropdown */}
      <TableCell>
        <InlineEditableCell
          value={project.risk}
          type="select"
          options={["Low", "Medium", "High"]}
          onSave={() => {}}
          displayValue={project.risk ? <RiskBadge level={project.risk} /> : "—"}
        />
      </TableCell>
      {/* Smluvní - inherited, read-only */}
      <TableCell className="text-muted-foreground truncate" title={project.datum_smluvni || ""}>{project.datum_smluvni || "—"}</TableCell>
      {/* Zaměření - editable date */}
      <TableCell>
        <InlineEditableCell value={stage.start_date} type="date" onSave={(v) => saveStage("start_date", v)} />
      </TableCell>
      {/* TPV - editable date */}
      <TableCell>
        <InlineEditableCell value={stage.end_date} type="date" onSave={(v) => saveStage("end_date", v)} />
      </TableCell>
      {/* Expedice - editable date (stored in notes for now, or show parent) */}
      <TableCell className="text-muted-foreground">—</TableCell>
      {/* Předání - editable date */}
      <TableCell className="text-muted-foreground">—</TableCell>
      {/* Poznámka */}
      <TableCell>—</TableCell>
      {/* Prodejní cena */}
      <TableCell>—</TableCell>
      {/* Marže */}
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
    return <ChevronDown className={`h-4 w-4 ${hasStages ? "text-accent" : "text-muted-foreground"}`} />;
  }
  return (
    <ChevronRight
      className={`h-4 w-4 ${hasStages ? "text-accent fill-accent/20" : "text-muted-foreground/50"}`}
    />
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

  return (
    <div>
      <div className="rounded-lg border bg-card overflow-x-scroll always-scrollbar">
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/5">
              <TableHead className="w-8"></TableHead>
              <SortableHeader label="Project ID" column="project_id" {...sh} className="min-w-[130px]" />
              <SortableHeader label="Project Name" column="project_name" {...sh} className="min-w-[180px]" />
              <SortableHeader label="Klient" column="klient" {...sh} className="min-w-[120px]" />
              <SortableHeader label="PM" column="pm" {...sh} className="min-w-[140px]" />
              <SortableHeader label="Status" column="status" {...sh} className="min-w-[110px]" />
              <SortableHeader label="Risk" column="risk" {...sh} className="min-w-[80px]" />
              <SortableHeader label="Smluvní" column="datum_smluvni" {...sh} className="min-w-[90px]" />
              <SortableHeader label="Zaměření" column="zamereni" {...sh} className="min-w-[90px]" />
              <SortableHeader label="TPV" column="tpv_date" {...sh} className="min-w-[90px]" />
              <SortableHeader label="Expedice" column="expedice" {...sh} className="min-w-[90px]" />
              <SortableHeader label="Předání" column="predani" {...sh} className="min-w-[90px]" />
              <SortableHeader label="Poznámka" column="pm_poznamka" {...sh} className="min-w-[180px]" />
              <SortableHeader label="Prodejní cena" column="prodejni_cena" {...sh} className="min-w-[120px] text-right" />
              <SortableHeader label="Marže" column="marze" {...sh} className="min-w-[70px] text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <Fragment key={p.id}>
                <TableRow className="hover:bg-muted/50 transition-colors h-9">
                  <TableCell className="w-8 cursor-pointer" onClick={() => toggleExpand(p.project_id)}>
                    <ExpandArrow projectId={p.project_id} isExpanded={expanded.has(p.project_id)} />
                  </TableCell>
                  <TableCell className="font-mono text-xs truncate" title={p.project_id}>{p.project_id}</TableCell>
                  <TableCell><InlineEditableCell value={p.project_name} onSave={(v) => save(p.id, "project_name", v, p.project_name)} className="font-medium" /></TableCell>
                  <TableCell><InlineEditableCell value={p.klient} onSave={(v) => save(p.id, "klient", v, p.klient || "")} /></TableCell>
                  <TableCell><InlineEditableCell value={p.pm} type="people" peopleRole="PM" onSave={(v) => save(p.id, "pm", v, p.pm || "")} /></TableCell>
                  <TableCell>
                    <InlineEditableCell value={p.status} type="select" options={statusLabels} onSave={(v) => save(p.id, "status", v, p.status || "")} displayValue={p.status ? <StatusBadge status={p.status} /> : "—"} />
                  </TableCell>
                  <TableCell>
                    <InlineEditableCell value={p.risk} type="select" options={["Low", "Medium", "High"]} onSave={(v) => save(p.id, "risk", v, p.risk || "")} displayValue={<RiskBadge level={p.risk || ""} />} />
                  </TableCell>
                  <TableCell><InlineEditableCell value={p.datum_smluvni} type="date" onSave={(v) => save(p.id, "datum_smluvni", v, p.datum_smluvni || "")} /></TableCell>
                  <TableCell><InlineEditableCell value={p.zamereni} type="date" onSave={(v) => save(p.id, "zamereni", v, p.zamereni || "")} /></TableCell>
                  <TableCell><InlineEditableCell value={p.tpv_date} type="date" onSave={(v) => save(p.id, "tpv_date", v, p.tpv_date || "")} /></TableCell>
                  <TableCell><InlineEditableCell value={p.expedice} type="date" onSave={(v) => save(p.id, "expedice", v, p.expedice || "")} /></TableCell>
                  <TableCell><InlineEditableCell value={p.predani} type="date" onSave={(v) => save(p.id, "predani", v, p.predani || "")} /></TableCell>
                  <TableCell><InlineEditableCell value={p.pm_poznamka} type="textarea" onSave={(v) => save(p.id, "pm_poznamka", v, p.pm_poznamka || "")} /></TableCell>
                  <TableCell className="text-right">
                    <CurrencyEditCell
                      value={p.prodejni_cena}
                      currency={p.currency || "CZK"}
                      onSave={(amount, currency) => {
                        const parsedAmount = amount === "" ? null : Number(amount);
                        supabase.from("projects").update({ prodejni_cena: parsedAmount, currency } as any).eq("id", p.id).then(({ error }) => {
                          if (error) toast({ title: "Chyba", description: error.message, variant: "destructive" });
                          else { qc.invalidateQueries({ queryKey: ["projects"] }); toast({ title: "Uloženo" }); }
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right"><InlineEditableCell value={p.marze} onSave={(v) => save(p.id, "marze", v, p.marze || "")} /></TableCell>
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
