import React, { useState, Fragment, useMemo, useEffect, useCallback, memo, useRef, type MutableRefObject } from "react";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { logActivity } from "@/lib/activityLog";
import { useDataLogRowHighlight } from "@/hooks/useDataLogRowHighlight";
import { useAllCustomColumns, useUpdateCustomField } from "@/hooks/useCustomColumns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, RiskBadge, ProgressBar } from "./StatusBadge";
import { InlineEditableCell } from "./InlineEditableCell";
import { SortableHeader } from "./SortableHeader";
import { useProjects } from "@/hooks/useProjects";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { useSortFilter } from "@/hooks/useSortFilter";
import { useProjectStages, useUpdateStage, useDeleteStage, useReorderStages } from "@/hooks/useProjectStages";
import { ConfirmDialog } from "./ConfirmDialog";
import { ChevronRight, ChevronDown, Plus, Trash2, GripVertical, ChevronsDown, ChevronsUp, List } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProjectStage } from "@/hooks/useProjectStages";
import type { Project } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { ColumnVisibilityToggle } from "./ColumnVisibilityToggle";
import { TPVList } from "./TPVList";
import { ProjectDetailDialog } from "./ProjectDetailDialog";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { isStageFieldInherited, getStageDisplayValue, inheritedTextClass } from "@/lib/stageInheritance";
import { getTPVDashboardRiskColor } from "@/hooks/useRiskHighlight";
import { useAllColumnVisibility, PROJECT_INFO_NATIVE, PM_NATIVE, TPV_NATIVE, ALL_COLUMNS } from "./ColumnVisibilityContext";
import { getColumnStyle, renderColumnHeader, renderColumnCell, getColumnLabel, COL_ICON_STYLE, COL_CHEVRON_STYLE } from "./CrossTabColumns";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useHeaderDrag } from "@/hooks/useHeaderDrag";
import { useExportContext } from "./ExportContext";
import { getProjectCellValue } from "@/lib/exportExcel";
import { useStagesByProject } from "@/hooks/useAllProjectStages";
import { useAllTPVItems } from "@/hooks/useAllTPVItems";

const NATIVE_KEYS = ["project_id", "project_name", ...TPV_NATIVE];
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key);

const INHERITABLE_FIELDS = ["status", "risk", "zamereni", "tpv_date", "expedice", "montaz", "predani", "datum_smluvni", "konstrukter", "narocnost", "architekt"];
const INHERITABLE_DATE_MAP: Record<string, string> = { datum_objednavky: "start_date" };

/** Check if any stage matches the active filters */
function stageMatchesFilters(
  stages: ProjectStage[],
  personFilter: string | null,
  statusFilterSet: Set<string> | null,
  searchLower: string | null
): boolean {
  if (stages.length === 0) return false;
  for (const stage of stages) {
    if (personFilter && stage.pm && String(stage.pm).includes(personFilter)) return true;
    if (statusFilterSet && stage.status && statusFilterSet.has(stage.status)) return true;
    if (searchLower) {
      const searchable = [stage.stage_name, stage.pm, stage.status, stage.notes, stage.pm_poznamka];
      for (const v of searchable) {
        if (v && String(v).toLowerCase().includes(searchLower)) return true;
      }
    }
  }
  return false;
}

/** Check if a single stage matches the active filters */
function singleStageMatches(
  stage: ProjectStage,
  personFilter: string | null,
  statusFilterSet: Set<string> | null,
  searchLower: string | null
): boolean {
  if (!personFilter && !statusFilterSet && !searchLower) return true;
  if (personFilter && stage.pm && String(stage.pm).includes(personFilter)) return true;
  if (statusFilterSet && stage.status && statusFilterSet.has(stage.status)) return true;
  if (searchLower) {
    const searchable = [stage.stage_name, stage.pm, stage.status, stage.notes, stage.pm_poznamka];
    for (const v of searchable) {
      if (v && String(v).toLowerCase().includes(searchLower)) return true;
    }
  }
  return false;
}

// ── TPV Items count badge for List icon ─────────────────────────────
const TPVListIcon = memo(function TPVListIcon({ projectId, itemCount, onClick }: { projectId: string; itemCount: number; onClick: () => void }) {
  const hasItems = itemCount > 0;
  return (
    <button
      className={cn(
        "transition-colors cursor-pointer hover:text-[#e87c3e]",
        hasItems ? "text-gray-700" : "text-gray-300"
      )}
      title={`TPV seznam (${itemCount})`}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <List className="h-4 w-4" />
    </button>
  );
});

// ── Stage row for TPV tab ───────────────────────────────────────────
interface StageRowProps {
  stage: ProjectStage;
  project: Project;
  onDelete: (id: string) => void;
  isVisible: (key: string) => boolean;
  statusLabels: string[];
  canEdit: boolean;
  renderKeys: string[];
  isFieldInherited?: (field: string) => boolean;
  onFieldTouched?: (field: string) => void;
  cancelConfirm?: boolean;
  onCancelConfirm?: () => void;
  onCancelDismiss?: () => void;
  dimmed?: boolean;
}

function SortableStageRow({ stage, project, onDelete, isVisible, statusLabels, canEdit, renderKeys, isFieldInherited, onFieldTouched, cancelConfirm, onCancelConfirm, onCancelDismiss, dimmed }: StageRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  const updateStage = useUpdateStage();
  const style = { transform: CSS.Transform.toString(transform), transition };
  const saveStage = useCallback((field: string, value: string) => {
    onFieldTouched?.(field);
    const tracked = ["konstrukter", "status", "datum_smluvni"];
    updateStage.mutate({
      id: stage.id, field, value, projectId: project.project_id,
      oldValue: tracked.includes(field) ? ((stage as any)[field] ?? "") : undefined,
      stageName: tracked.includes(field) ? stage.stage_name : undefined,
    });
  }, [stage.id, stage.stage_name, (stage as any).konstrukter, (stage as any).status, (stage as any).datum_smluvni, project.project_id, onFieldTouched, updateStage]);
  const v = isVisible;
  const ihClass = (field: string) => inheritedTextClass(stage, project, field);

  const renderStageCell = (key: string) => {
    switch (key) {
      case "konstrukter": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "konstrukter")} type="people" peopleRole="Konstruktér" onSave={(val) => saveStage("konstrukter", val)} readOnly={!canEdit} className={ihClass("konstrukter")} /></TableCell>;
      case "narocnost": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "narocnost")} type="select" options={["Low", "Medium", "High"]} onSave={(val) => saveStage("narocnost", val)} displayValue={<RiskBadge level={getStageDisplayValue(stage, project, "narocnost") || ""} />} readOnly={!canEdit} className={ihClass("narocnost")} /></TableCell>;
      case "hodiny_tpv": return <TableCell key={key}><InlineEditableCell value={(stage as any).hodiny_tpv} onSave={(val) => saveStage("hodiny_tpv", val)} readOnly={!canEdit} /></TableCell>;
      case "percent_tpv": return <TableCell key={key}><InlineEditableCell value={(stage as any).percent_tpv} type="number" onSave={(val) => saveStage("percent_tpv", val)} displayValue={<ProgressBar value={(stage as any).percent_tpv || 0} />} readOnly={!canEdit} /></TableCell>;
      case "architekt": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "architekt")} onSave={(val) => saveStage("architekt", val)} readOnly={!canEdit} className={ihClass("architekt")} /></TableCell>;
      case "tpv_poznamka": return <TableCell key={key}><InlineEditableCell value={(stage as any).tpv_poznamka} type="textarea" onSave={(val) => saveStage("tpv_poznamka", val)} readOnly={!canEdit} /></TableCell>;
      case "pm": return <TableCell key={key}><InlineEditableCell value={stage.pm} type="people" peopleRole="PM" onSave={(val) => saveStage("pm", val)} readOnly={!canEdit} /></TableCell>;
      case "status": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "status")} type="select" options={statusLabels} onSave={(val) => saveStage("status", val)} displayValue={getStageDisplayValue(stage, project, "status") ? <StatusBadge status={getStageDisplayValue(stage, project, "status")} /> : "—"} readOnly={!canEdit} className={ihClass("status")} /></TableCell>;
      case "risk": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "risk")} type="select" options={["Low", "Medium", "High"]} onSave={(val) => saveStage("risk", val)} displayValue={<RiskBadge level={getStageDisplayValue(stage, project, "risk") || ""} />} readOnly={!canEdit} className={ihClass("risk")} /></TableCell>;
      case "zamereni": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "zamereni")} type="date" onSave={(val) => saveStage("zamereni", val)} readOnly={!canEdit} className={ihClass("zamereni")} /></TableCell>;
      case "tpv_date": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "tpv_date")} type="date" onSave={(val) => saveStage("tpv_date", val)} readOnly={!canEdit} className={ihClass("tpv_date")} /></TableCell>;
      case "expedice": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "expedice")} type="date" onSave={(val) => saveStage("expedice", val)} readOnly={!canEdit} className={ihClass("expedice")} /></TableCell>;
      case "montaz": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "montaz")} type="date" onSave={(val) => saveStage("montaz", val)} readOnly={!canEdit} className={ihClass("montaz")} /></TableCell>;
      case "predani": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "predani")} type="date" onSave={(val) => saveStage("predani", val)} readOnly={!canEdit} className={ihClass("predani")} /></TableCell>;
      case "pm_poznamka": return <TableCell key={key}><InlineEditableCell value={stage.pm_poznamka} type="textarea" onSave={(val) => saveStage("pm_poznamka", val)} readOnly={!canEdit} /></TableCell>;
      default: return <TableCell key={key} />;
    }
  };

  return (
    <TableRow ref={setNodeRef} style={style} className={cn("bg-muted/20 h-9", dimmed && "opacity-40")}>
      {/* Col 1 — Icon slot — empty for stages */}
      <TableCell style={COL_ICON_STYLE} className="px-0" />
      {/* Col 2 — Chevron slot — drag handle for stages */}
      <TableCell style={COL_CHEVRON_STYLE} className="px-0">
        <div {...attributes} {...listeners} className="cursor-grab pl-1">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </TableCell>
      {v("project_id") && (
        <TableCell className="font-mono text-xs truncate pl-4 text-muted-foreground">
          <InlineEditableCell value={stage.stage_name} onSave={(val) => saveStage("stage_name", val)} readOnly={!canEdit} />
        </TableCell>
      )}
      {v("project_name") && (
        <TableCell className="truncate text-muted-foreground text-xs" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={project.project_name}>{project.project_name}</TableCell>
      )}
      {renderKeys.map((key) => renderStageCell(key))}
      <TableCell>
        {cancelConfirm ? (
          <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
            <span className="text-muted-foreground">Zrušit novou etapu?</span>
            <button onClick={onCancelConfirm} className="text-destructive hover:underline font-medium">Zrušit</button>
            <button onClick={onCancelDismiss} className="text-muted-foreground hover:underline">Ponechat</button>
          </div>
        ) : (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onDelete(stage.id)}>
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

const MemoSortableStageRow = memo(SortableStageRow);

// ── Stages section (same pattern as PM Status) ──────────────────────
function StagesSection({ projectId, project, isVisible, statusLabels, canEdit, renderKeys, personFilter, statusFilterSet, searchLower, showAddButton = true }: { projectId: string; project: Project; isVisible: (key: string) => boolean; statusLabels: string[]; canEdit: boolean; renderKeys: string[]; personFilter: string | null; statusFilterSet: Set<string> | null; searchLower: string | null; showAddButton?: boolean }) {
  const { data: stages = [] } = useProjectStages(projectId);
  const deleteStage = useDeleteStage();
  const reorderStages = useReorderStages();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const qc = useQueryClient();
  const [freshStages, setFreshStages] = useState<Map<string, Set<string>>>(new Map());
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleInlineAdd = useCallback(async () => {
    const letters = stages.map(s => {
      const match = s.stage_name.match(/-([A-Z])$/);
      return match ? match[1] : null;
    }).filter(Boolean) as string[];
    const lastChar = letters.sort().pop();
    const suffix = lastChar ? String.fromCharCode(lastChar.charCodeAt(0) + 1) : "A";
    const stageName = `${projectId}-${suffix}`;
    const id = crypto.randomUUID();
    const inheritedData: Record<string, any> = {};
    const inheritedKeys = new Set<string>();
    for (const field of INHERITABLE_FIELDS) {
      const val = (project as any)[field];
      if (val != null && val !== "") {
        inheritedData[field] = val;
        inheritedKeys.add(field);
      }
    }
    for (const [projField, stageField] of Object.entries(INHERITABLE_DATE_MAP)) {
      const val = (project as any)[projField];
      if (val != null && val !== "") {
        inheritedData[stageField] = val;
        inheritedKeys.add(stageField);
      }
    }

    const newStage = { id, project_id: projectId, stage_name: stageName, stage_order: stages.length, ...inheritedData };
    const queryKey = ["project_stages", projectId];
    qc.setQueryData<ProjectStage[]>(queryKey, (old) => [
      ...(old || []),
      { ...newStage, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null, start_date: inheritedData.start_date ?? null, end_date: null, notes: null, datum_smluvni: inheritedData.datum_smluvni ?? null, pm: null, status: inheritedData.status ?? null, risk: inheritedData.risk ?? null, zamereni: inheritedData.zamereni ?? null, tpv_date: inheritedData.tpv_date ?? null, expedice: inheritedData.expedice ?? null, montaz: inheritedData.montaz ?? null, predani: inheritedData.predani ?? null, pm_poznamka: inheritedData.pm_poznamka ?? null, konstrukter: inheritedData.konstrukter ?? null, narocnost: inheritedData.narocnost ?? null, hodiny_tpv: null, percent_tpv: null, architekt: inheritedData.architekt ?? null, prodejni_cena: null, currency: null, kalkulant: null, marze: null } as ProjectStage,
    ]);
    setFreshStages(prev => new Map(prev).set(id, inheritedKeys));

    const { error } = await supabase.from("project_stages").insert(newStage);
    if (error) {
      toast({ title: "Chyba", description: "Nepodařilo se vytvořit etapu", variant: "destructive" });
      qc.invalidateQueries({ queryKey });
      setFreshStages(prev => { const next = new Map(prev); next.delete(id); return next; });
      return;
    }
    logActivity({ projectId, actionType: "stage_created", detail: stageName });
    qc.invalidateQueries({ queryKey: ["all_project_stages"] });
  }, [projectId, project, stages, qc]);

  const markFieldTouched = useCallback((stageId: string, field: string) => {
    setFreshStages(prev => {
      const fields = prev.get(stageId);
      if (!fields) return prev;
      const next = new Map(prev);
      const updated = new Set(fields);
      updated.delete(field);
      if (updated.size === 0) next.delete(stageId);
      else next.set(stageId, updated);
      return next;
    });
  }, []);

  const handleCancelStage = useCallback(async (stageId: string) => {
    await supabase.from("project_stages").delete().eq("id", stageId);
    setFreshStages(prev => { const next = new Map(prev); next.delete(stageId); return next; });
    setCancelConfirmId(null);
    qc.invalidateQueries({ queryKey: ["project_stages", projectId] });
    qc.invalidateQueries({ queryKey: ["all_project_stages"] });
  }, [projectId, qc]);

  useEffect(() => {
    if (freshStages.size === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const freshIds = [...freshStages.keys()];
        if (freshIds.length > 0) setCancelConfirmId(freshIds[freshIds.length - 1]);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [freshStages]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = stages.findIndex(s => s.id === active.id);
    const newIndex = stages.findIndex(s => s.id === over.id);
    const reordered = arrayMove(stages, oldIndex, newIndex);
    reorderStages.mutate({ stages: reordered.map((s, i) => ({ id: s.id, stage_order: i })), projectId });
  }, [stages, projectId, reorderStages]);

  const handleDelete = useCallback((id: string) => setDeleteId(id), []);

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stages.map(s => s.id)} strategy={verticalListSortingStrategy}>
          {stages.map(stage => (
            <MemoSortableStageRow
              key={stage.id}
              stage={stage}
              project={project}
              onDelete={handleDelete}
              isVisible={isVisible}
              statusLabels={statusLabels}
              canEdit={canEdit}
              renderKeys={renderKeys}
              isFieldInherited={freshStages.has(stage.id) ? (field) => freshStages.get(stage.id)?.has(field) ?? false : undefined}
              onFieldTouched={freshStages.has(stage.id) ? (field) => markFieldTouched(stage.id, field) : undefined}
              cancelConfirm={cancelConfirmId === stage.id}
              onCancelConfirm={() => handleCancelStage(stage.id)}
              onCancelDismiss={() => setCancelConfirmId(null)}
              dimmed={!singleStageMatches(stage, personFilter, statusFilterSet, searchLower)}
            />
          ))}
        </SortableContext>
      </DndContext>
      {showAddButton && (
        <TableRow className="bg-muted/20 h-9">
          <TableCell colSpan={20}>
            <Button variant="ghost" size="sm" className="text-xs h-5 text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 font-normal" onClick={handleInlineAdd}>
              <Plus className="h-3 w-3 mr-1" /> Přidat etapu
            </Button>
          </TableCell>
        </TableRow>
      )}
      <ConfirmDialog open={!!deleteId} onConfirm={() => { if (deleteId) { const s = stages.find(st => st.id === deleteId); deleteStage.mutate({ id: deleteId, projectId, stageName: s?.stage_name }); setDeleteId(null); } }} onCancel={() => setDeleteId(null)} />
    </>
  );
}

// ── Expand arrow ────────────────────────────────────────────────────
function ExpandArrow({ isExpanded, stageCount }: { isExpanded: boolean; stageCount: number }) {
  const hasStages = stageCount > 0;
  if (isExpanded) return <ChevronDown className={`h-5 w-5 stroke-[3] ${hasStages ? "text-accent" : "text-muted-foreground"}`} />;
  return <ChevronRight className={`h-5 w-5 stroke-[3] ${hasStages ? "text-accent fill-accent/20" : "text-muted-foreground/50"}`} />;
}

// ── Memoized parent project row for TPV ─────────────────────────────
interface TPVProjectRowProps {
  project: Project;
  isExpanded: boolean;
  stageCount: number;
  tpvItemCount: number;
  onToggleExpand: (pid: string) => void;
  onOpenTPVList: (projectId: string, projectName: string) => void;
  isVisible: (key: string) => boolean;
  renderKeys: string[];
  save: (id: string, field: string, value: string, oldValue: string) => void;
  canEdit: boolean;
  statusLabels: string[];
  customColumns: any[];
  saveCustomField: (rowId: string, colKey: string, val: string, old: string) => void;
  riskHighlight: any;
  isFieldReadOnly: (field: string) => boolean;
  onEditProject: (p: Project) => void;
}

const TPVProjectRow = memo(function TPVProjectRow({
  project: p,
  isExpanded,
  stageCount,
  tpvItemCount,
  onToggleExpand,
  onOpenTPVList,
  isVisible: v,
  renderKeys,
  save,
  canEdit,
  statusLabels,
  customColumns,
  saveCustomField,
  riskHighlight,
  isFieldReadOnly,
  onEditProject,
}: TPVProjectRowProps) {
  const tpvHighlight = useMemo(
    () => getTPVDashboardRiskColor(p as any, riskHighlight ?? null),
    [p.risk, p.tpv_risk, p.datum_tpv, p.datum_smluvni, riskHighlight]
  );

  const handleOpenList = useCallback(() => {
    onOpenTPVList(p.project_id, p.project_name);
  }, [p.project_id, p.project_name, onOpenTPVList]);

  return (
    <TableRow className="hover:bg-muted/50 transition-colors h-9" style={tpvHighlight.bg ? { backgroundColor: tpvHighlight.bg } : {}} data-project-id={p.project_id}>
      {/* Col 1 — Icon slot */}
      <TableCell style={COL_ICON_STYLE} className="text-center px-0">
        <TPVListIcon projectId={p.project_id} itemCount={tpvItemCount} onClick={handleOpenList} />
      </TableCell>
      {/* Col 2 — Chevron slot */}
      <TableCell style={COL_CHEVRON_STYLE} className="px-0 cursor-pointer relative" onClick={() => onToggleExpand(p.project_id)}>
        {tpvHighlight.dotColor && (
          <span className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full" style={{ width: 6, height: 6, backgroundColor: tpvHighlight.dotColor }} />
        )}
        <ExpandArrow isExpanded={isExpanded} stageCount={stageCount} />
      </TableCell>
      {v("project_id") && <TableCell className="font-mono text-xs truncate cursor-pointer hover:underline text-primary" title={p.project_id} onClick={() => onEditProject(p)}>{p.project_id}</TableCell>}
      {v("project_name") && <TableCell style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.project_name}><InlineEditableCell value={p.project_name} onSave={(val) => save(p.id, "project_name", val, p.project_name)} className="font-medium" readOnly={!canEdit || isFieldReadOnly("project_name")} /></TableCell>}
      {renderKeys.map((key) => renderColumnCell({ colKey: key, project: p, save, canEdit, statusLabels, customColumns, saveCustomField: (rowId, colKey, val, old) => saveCustomField(rowId, colKey, val, old), isFieldReadOnly }))}
    </TableRow>
  );
});

// ── Main component ──────────────────────────────────────────────────
interface TPVStatusTableProps {
  personFilter: string | null;
  statusFilter: string[];
  search: string;
  riskHighlight?: import("@/hooks/useRiskHighlight").RiskHighlightType;
  onRequestTab?: () => void;
  closeDetailRef?: MutableRefObject<(() => void) | null>;
}

export function TPVStatusTable({ personFilter, statusFilter, search: externalSearch, riskHighlight, onRequestTab, closeDetailRef }: TPVStatusTableProps) {
  useDataLogRowHighlight();
  const { data: projects = [], isLoading } = useProjects();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const statusLabels = useMemo(() => statusOptions.map((s) => s.label), [statusOptions]);
  const updateProject = useUpdateProject();
  const { columns: customColumns } = useAllCustomColumns("projects");
  const updateCustomField = useUpdateCustomField();
  const qc = useQueryClient();
  const { sorted: baseSorted, sortCol, sortDir, toggleSort } = useSortFilter(projects, { personFilter, statusFilter }, externalSearch);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAddButton, setShowAddButton] = useState<Set<string>>(new Set());
  const { tpvStatus: { isVisible } } = useAllColumnVisibility();
  const { getLabel, getWidth, updateLabel, updateWidth, getOrderedKeys, getDisplayOrderedKeys, updateDisplayOrder } = useColumnLabels("tpv-status");
  const [editMode, setEditMode] = useState(false);
  const { canEdit, canEditColumns, isFieldReadOnly } = useAuth();
  const { registerExport } = useExportContext();
  const { stagesByProject } = useStagesByProject();
  const { itemsByProject: tpvItemsByProject } = useAllTPVItems();
  const [activeProject, setActiveProject] = useState<{ projectId: string; projectName: string } | null>(null);
  const [editProject, setEditProject] = useState<typeof projects[0] | null>(null);

  // Memoize filter Sets
  const statusFilterSet = useMemo(
    () => statusFilter && statusFilter.length > 0 ? new Set(statusFilter) : null,
    [statusFilter]
  );
  const searchLower = useMemo(
    () => externalSearch ? externalSearch.toLowerCase() : null,
    [externalSearch]
  );

  // Expose close-detail callback to parent
  useEffect(() => {
    if (closeDetailRef) {
      closeDetailRef.current = () => setActiveProject(null);
      return () => { closeDetailRef.current = null; };
    }
  }, [closeDetailRef]);

  // ── Frozen filter results ───────────────────────────────────────
  const filterFingerprint = JSON.stringify([personFilter, statusFilter, externalSearch]);
  const computeKey = `${filterFingerprint}|${projects.length}|${stagesByProject.size}`;
  const hasActiveFilters = !!(personFilter || (statusFilter && statusFilter.length > 0) || externalSearch);

  const frozenRef = useRef<{ key: string; ids: Set<string> }>({
    key: '', ids: new Set(),
  });

  if (frozenRef.current.key !== computeKey) {
    const baseIds = new Set(baseSorted.map((p) => p.project_id));

    if (hasActiveFilters && stagesByProject.size > 0) {
      for (const p of projects) {
        if (baseIds.has(p.project_id)) continue;
        const stages = stagesByProject.get(p.project_id);
        if (!stages || stages.length === 0) continue;
        if (stageMatchesFilters(stages, personFilter, statusFilterSet, searchLower)) {
          baseIds.add(p.project_id);
        }
      }
    }

    frozenRef.current = { key: computeKey, ids: baseIds };
  }

  const sorted = useMemo(() => {
    const frozenIds = frozenRef.current.ids;
    let result = projects.filter((p) => frozenIds.has(p.project_id));
    if (sortCol && sortDir) {
      result = [...result].sort((a, b) => {
        const av = (a as any)[sortCol] ?? "";
        const bv = (b as any)[sortCol] ?? "";
        const numA = Number(av); const numB = Number(bv);
        if (!isNaN(numA) && !isNaN(numB) && av !== "" && bv !== "") return sortDir === "asc" ? numA - numB : numB - numA;
        const cmp = String(av).localeCompare(String(bv), "cs");
        return sortDir === "asc" ? cmp : -cmp;
      });
    } else {
      result.sort((a, b) => a.project_id.localeCompare(b.project_id, "cs"));
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, sortCol, sortDir, computeKey]);

  // Infinite scroll
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const scrollResetKey = `${computeKey}|${sortCol}|${sortDir}`;
  const { visible, hasMore } = useInfiniteScroll(sorted, tableScrollRef, scrollResetKey);

  const orderedNativeKeys = useMemo(() => getOrderedKeys(TPV_NATIVE), [getOrderedKeys]);
  const orderedAllKeys = useMemo(() => getOrderedKeys(ALL_KEYS), [getOrderedKeys]);

  const customColumnKeys = useMemo(() => customColumns.map(c => c.column_key), [customColumns]);

  const allVisibleGroupOrder = useMemo(() => {
    const native = orderedNativeKeys.filter((k) => isVisible(k));
    const cross = orderedAllKeys.filter((k) => !NATIVE_KEYS.includes(k) && isVisible(k));
    const custom = customColumnKeys.filter((k) => isVisible(k) && !native.includes(k) && !cross.includes(k));
    return [...native, ...cross, ...custom];
  }, [orderedNativeKeys, orderedAllKeys, isVisible, customColumnKeys]);

  const allVisibleKeys = useMemo(
    () => getDisplayOrderedKeys(allVisibleGroupOrder),
    [getDisplayOrderedKeys, allVisibleGroupOrder]
  );

  const [localOrder, setLocalOrder] = useState<string[]>(allVisibleKeys);

  useEffect(() => {
    if (!editMode) setLocalOrder(allVisibleKeys);
  }, [allVisibleKeys, editMode]);

  const handleToggleEditMode = useCallback(async () => {
    if (editMode) await updateDisplayOrder(localOrder);
    else setLocalOrder(allVisibleKeys);
    setEditMode(!editMode);
  }, [editMode, localOrder, allVisibleKeys, updateDisplayOrder]);

  const { dragKey, dropTarget, getDragProps } = useHeaderDrag(localOrder, setLocalOrder);

  // Register export
  useEffect(() => {
    const allExportKeys = ["project_id", "project_name", ...allVisibleKeys];
    registerExport("tpv-status", {
      getter: (selectedKeys) => {
        const keys = selectedKeys ?? allExportKeys;
        const headers = keys.map(k => getLabel(k, getColumnLabel(k, customColumns)));
        const rows = sorted.map(p => keys.map(k => getProjectCellValue(p as any, k)));
        return { headers, rows };
      },
      groups: [
        { label: "Project Info", keys: ["project_id", "project_name", ...PROJECT_INFO_NATIVE], getLabel: (k) => getLabel(k, getColumnLabel(k, customColumns)) },
        { label: "PM Status", keys: PM_NATIVE, getLabel: (k) => getLabel(k, getColumnLabel(k, customColumns)) },
        { label: "TPV Status", keys: TPV_NATIVE, getLabel: (k) => getLabel(k, getColumnLabel(k, customColumns)) },
      ],
      defaultVisibleKeys: allExportKeys,
    });
  }, [registerExport, sorted, allVisibleKeys, getLabel]);

  const toggleExpand = useCallback((pid: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (!next.has(pid)) {
        next.add(pid);
        setShowAddButton(ab => { const n = new Set(ab); n.add(pid); return n; });
      } else {
        next.delete(pid);
        setShowAddButton(ab => { const n = new Set(ab); n.delete(pid); return n; });
      }
      return next;
    });
  }, []);

  const save = useCallback((id: string, field: string, value: string, oldValue: string, projectId?: string) => {
    updateProject.mutate({ id, field, value, oldValue, projectId });
  }, [updateProject]);

  const handleSaveCustomField = useCallback((rowId: string, colKey: string, val: string, old: string) => {
    updateCustomField.mutate({ rowId, tableName: "projects", columnKey: colKey, value: val, oldValue: old });
  }, [updateCustomField]);

  const handleOpenTPVList = useCallback((projectId: string, projectName: string) => {
    setActiveProject({ projectId, projectName });
  }, []);

  // If TPV List detail is open, show it
  if (activeProject) {
    return (
      <TPVList
        projectId={activeProject.projectId}
        projectName={activeProject.projectName}
        onBack={() => { setActiveProject(null); onRequestTab?.(); }}
      />
    );
  }

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Načítání...</div>;

  const v = isVisible;

  const headerProps = (key: string) => ({
    colKey: key, sortCol, sortDir, onSort: toggleSort, getLabel, getWidth, editMode, updateLabel, updateWidth, customColumns,
    ...(editMode ? { dragProps: getDragProps(key), dropIndicator: dropTarget?.key === key ? dropTarget.side : null, isDragging: dragKey === key } : {}),
  });

  const renderKeys = editMode ? localOrder : allVisibleKeys;

  return (
    <div>
      {editMode && (
        <div className="bg-accent/10 border border-accent/30 text-accent text-xs font-medium px-3 py-1.5 rounded-t-lg">
          Režim úpravy sloupců
        </div>
      )}
      <div ref={tableScrollRef} className={cn("rounded-lg border bg-card overflow-auto always-scrollbar", editMode && "rounded-t-none border-t-0")} style={{ maxHeight: "calc(100vh - 260px)" }}>
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/5">
              {/* Col 1 — Icon slot */}
              <TableHead style={COL_ICON_STYLE} className="text-center px-0">
                <List className="h-3.5 w-3.5 text-muted-foreground/50 mx-auto" />
              </TableHead>
              {/* Col 2 — Chevron slot */}
              <TableHead style={COL_CHEVRON_STYLE} className="shrink-0 px-0">
                {sorted.length > 0 && (
                  <button
                    className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                    title={expanded.size === sorted.length ? "Sbalit vše" : "Rozbalit vše"}
                    onClick={() => {
                      if (expanded.size === sorted.length) { setExpanded(new Set()); setShowAddButton(new Set()); }
                      else { setExpanded(new Set(sorted.map((p) => p.project_id))); setShowAddButton(new Set()); }
                    }}
                  >
                    {expanded.size === sorted.length ? <ChevronsUp className="h-3.5 w-3.5" /> : <ChevronsDown className="h-3.5 w-3.5" />}
                  </button>
                )}
              </TableHead>
              {v("project_id") && renderColumnHeader(headerProps("project_id"))}
              {v("project_name") && renderColumnHeader(headerProps("project_name"))}
              {renderKeys.map((key) => renderColumnHeader(headerProps(key)))}
              <ColumnVisibilityToggle tabKey="tpvStatus" editMode={editMode} onToggleEditMode={canEditColumns ? handleToggleEditMode : undefined} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((p) => (
              <Fragment key={p.id}>
                <TPVProjectRow
                  project={p}
                  isExpanded={expanded.has(p.project_id)}
                  stageCount={stagesByProject.get(p.project_id)?.length ?? 0}
                  tpvItemCount={tpvItemsByProject.get(p.project_id)?.length ?? 0}
                  onToggleExpand={toggleExpand}
                  onOpenTPVList={handleOpenTPVList}
                  isVisible={v}
                  renderKeys={renderKeys}
                  save={save}
                  canEdit={canEdit}
                  statusLabels={statusLabels}
                  customColumns={customColumns}
                  saveCustomField={handleSaveCustomField}
                  riskHighlight={riskHighlight}
                  isFieldReadOnly={isFieldReadOnly}
                  onEditProject={(p) => setEditProject(p)}
                />
                {expanded.has(p.project_id) && (
                  <StagesSection
                    projectId={p.project_id}
                    project={p}
                    isVisible={v}
                    statusLabels={statusLabels}
                    canEdit={canEdit}
                    renderKeys={renderKeys}
                    personFilter={personFilter}
                    statusFilterSet={statusFilterSet}
                    searchLower={searchLower}
                    showAddButton={showAddButton.has(p.project_id)}
                  />
                )}
              </Fragment>
            ))}
            {hasMore && (
              <TableRow>
                <TableCell colSpan={99} className="text-center py-3">
                  <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    Načítání…
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {editProject && <ProjectDetailDialog project={editProject} open={!!editProject} onOpenChange={(open) => { if (!open) setEditProject(null); }} />}
    </div>
  );
}
