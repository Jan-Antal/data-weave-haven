import React, { useState, Fragment, useMemo, useEffect, useCallback, memo, useRef } from "react";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { logActivity } from "@/lib/activityLog";
import { useDataLogRowHighlight } from "@/hooks/useDataLogRowHighlight";
import { useAllCustomColumns, useUpdateCustomField } from "@/hooks/useCustomColumns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, RiskBadge } from "./StatusBadge";
import { InlineEditableCell } from "./InlineEditableCell";
import { SortableHeader } from "./SortableHeader";
import { useProjects } from "@/hooks/useProjects";
import { useDocumentCounts } from "@/hooks/useDocumentCounts";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { useSortFilter } from "@/hooks/useSortFilter";
import { useProjectStages, useUpdateStage, useDeleteStage, useReorderStages } from "@/hooks/useProjectStages";
import { ConfirmDialog } from "./ConfirmDialog";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, Plus, Trash2, GripVertical, ChevronsDown, ChevronsUp, Paperclip } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProjectStage } from "@/hooks/useProjectStages";
import type { Project } from "@/hooks/useProjects";
import { ColumnVisibilityToggle } from "./ColumnVisibilityToggle";
import { ProjectDetailDialog } from "./ProjectDetailDialog";
import { TPVList } from "./TPVList";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { getStageDisplayValue, stageFieldClass, buildInheritedStageData, getInheritedFieldKeys, addEditedField, EDITABLE_INHERITED, READ_ONLY_INHERITED } from "@/lib/stageInheritance";
import { getProjectRiskColor } from "@/hooks/useRiskHighlight";
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
import { matchesStatusFilter, normalizedIncludes, normalizeSearch } from "@/lib/statusFilter";

const NATIVE_KEYS = ["project_id", "project_name", ...PM_NATIVE];
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key);

const stageStatuses = ["Plánováno", "Probíhá", "Dokončeno", "Pozastaveno"];

/** Check if any stage matches ALL active filters (AND logic) */
function stageMatchesFilters(
  stages: ProjectStage[],
  personFilter: string | null,
  statusFilterSet: Set<string> | null,
  searchLower: string | null
): boolean {
  if (stages.length === 0) return false;
  for (const stage of stages) {
    if (singleStageMatches(stage, personFilter, statusFilterSet, searchLower)) return true;
  }
  return false;
}

/** Check if a single stage matches ALL active filters (AND logic) */
function singleStageMatches(
  stage: ProjectStage,
  personFilter: string | null,
  statusFilterSet: Set<string> | null,
  searchLower: string | null
): boolean {
  if (personFilter && !(stage.pm && String(stage.pm).includes(personFilter))) return false;
  if (statusFilterSet && !matchesStatusFilter(stage.status, statusFilterSet)) return false;
  if (searchLower) {
    const searchable = [stage.stage_name, stage.pm, stage.status, stage.notes, stage.pm_poznamka];
    const found = searchable.some(v => normalizedIncludes(v, searchLower));
    if (!found) return false;
  }
  return true;
}

// (inheritance constants now in stageInheritance.ts)

interface StageRowProps {
  stage: ProjectStage;
  project: Project;
  onDelete: (id: string) => void;
  isVisible: (key: string) => boolean;
  statusLabels: string[];
  canEdit: boolean;
  renderKeys: string[];
  cancelConfirm?: boolean;
  onCancelConfirm?: () => void;
  onCancelDismiss?: () => void;
  dimmed?: boolean;
  freshInheritedFields?: Set<string>;
}

function SortableStageRow({ stage, project, onDelete, isVisible, statusLabels, canEdit, renderKeys, cancelConfirm, onCancelConfirm, onCancelDismiss, dimmed, freshInheritedFields }: StageRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  const updateStage = useUpdateStage();
  const { isFieldReadOnly } = useAuth();
  const style = { transform: CSS.Transform.toString(transform), transition };
  const saveStage = useCallback((field: string, value: string) => {
    const tracked = ["konstrukter", "status", "datum_smluvni"];
    const newEditedFields = addEditedField(stage, field);
    updateStage.mutate({
      id: stage.id, field, value, projectId: project.project_id,
      oldValue: tracked.includes(field) ? ((stage as any)[field] ?? "") : undefined,
      stageName: tracked.includes(field) ? stage.stage_name : undefined,
      editedFields: newEditedFields,
    });
  }, [stage.id, stage.stage_name, (stage as any).konstrukter, (stage as any).status, (stage as any).datum_smluvni, (stage as any).manually_edited_fields, project.project_id, updateStage]);
  const v = isVisible;
  const ihClass = (field: string) => {
    if (freshInheritedFields?.has(field)) return "stage-inherit-highlight";
    return stageFieldClass(stage, field);
  };

  const renderStageCell = (key: string) => {
    switch (key) {
      case "datum_smluvni": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "datum_smluvni")} type="date" onSave={(val) => saveStage("datum_smluvni", val)} readOnly={!canEdit || isFieldReadOnly("datum_smluvni", stage.datum_smluvni ?? null)} className={ihClass("datum_smluvni")} /></TableCell>;
      case "pm": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "pm")} type="people" peopleRole="PM" onSave={(val) => saveStage("pm", val)} readOnly={!canEdit} className={ihClass("pm")} /></TableCell>;
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

function StagesSection({ projectId, project, isVisible, statusLabels, canEdit, renderKeys, personFilter, statusFilterSet, searchLower, showAddButton = true }: { projectId: string; project: Project; isVisible: (key: string) => boolean; statusLabels: string[]; canEdit: boolean; renderKeys: string[]; personFilter: string | null; statusFilterSet: Set<string> | null; searchLower: string | null; showAddButton?: boolean }) {
  const { data: stages = [] } = useProjectStages(projectId);
  const deleteStage = useDeleteStage();
  const reorderStages = useReorderStages();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const qc = useQueryClient();

  // Track fresh (newly created inline) stages: stageId → Set of inherited field keys
  const [freshStages, setFreshStages] = useState<Map<string, Set<string>>>(new Map());
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const nextSuffix = () => {
    const letters = stages.map(s => {
      const match = s.stage_name.match(/-([A-Z])$/);
      return match ? match[1] : null;
    }).filter(Boolean) as string[];
    const lastChar = letters.sort().pop();
    return lastChar ? String.fromCharCode(lastChar.charCodeAt(0) + 1) : "A";
  };

  const handleInlineAdd = useCallback(async () => {
    const letters = stages.map(s => {
      const match = s.stage_name.match(/-([A-Z])$/);
      return match ? match[1] : null;
    }).filter(Boolean) as string[];
    const lastChar = letters.sort().pop();
    const suffix = lastChar ? String.fromCharCode(lastChar.charCodeAt(0) + 1) : "A";
    const stageName = `${projectId}-${suffix}`;
    const id = crypto.randomUUID();

    const inheritedData = buildInheritedStageData(project);
    const inheritedKeys = getInheritedFieldKeys(project);

    const newStage = { id, project_id: projectId, stage_name: stageName, stage_order: stages.length, ...inheritedData, manually_edited_fields: [] };
    const queryKey = ["project_stages", projectId];
    qc.setQueryData<ProjectStage[]>(queryKey, (old) => [
      ...(old || []),
      { ...newStage, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted_at: null, end_date: null, notes: null, pm_poznamka: null, narocnost: null, hodiny_tpv: null, percent_tpv: null, prodejni_cena: null, currency: null, marze: null } as any as ProjectStage,
    ]);
    setFreshStages(prev => new Map(prev).set(id, inheritedKeys));

    const { error } = await supabase.from("project_stages").insert(newStage as any);
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
      if (updated.size === 0) {
        next.delete(stageId);
      } else {
        next.set(stageId, updated);
      }
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

  // Auto-clear freshStages after animation duration (2s)
  useEffect(() => {
    if (freshStages.size === 0) return;
    const timer = setTimeout(() => setFreshStages(new Map()), 2000);
    return () => clearTimeout(timer);
  }, [freshStages.size]);

  // Handle Escape key for fresh stages
  useEffect(() => {
    if (freshStages.size === 0) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const freshIds = [...freshStages.keys()];
        if (freshIds.length > 0) {
          setCancelConfirmId(freshIds[freshIds.length - 1]);
        }
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
    reorderStages.mutate({
      stages: reordered.map((s, i) => ({ id: s.id, stage_order: i })),
      projectId,
    });
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


              cancelConfirm={cancelConfirmId === stage.id}
              onCancelConfirm={() => handleCancelStage(stage.id)}
              onCancelDismiss={() => setCancelConfirmId(null)}
              dimmed={!singleStageMatches(stage, personFilter, statusFilterSet, searchLower)}
              freshInheritedFields={freshStages.get(stage.id)}
            />
          ))}
        </SortableContext>
      </DndContext>
      {showAddButton && (
        <TableRow className="bg-muted/20 h-9">
          <TableCell colSpan={16}>
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

function ExpandArrow({ projectId, isExpanded, stageCount }: { projectId: string; isExpanded: boolean; stageCount: number }) {
  const hasStages = stageCount > 0;
  if (isExpanded) {
    return <ChevronDown className={`h-5 w-5 stroke-[3] ${hasStages ? "text-accent" : "text-muted-foreground"}`} />;
  }
  return <ChevronRight className={`h-5 w-5 stroke-[3] ${hasStages ? "text-accent fill-accent/20" : "text-muted-foreground/50"}`} />;
}

// ── Memoized parent project row ──────────────────────────────────────
interface PMProjectRowProps {
  project: Project;
  docCount: number;
  isExpanded: boolean;
  stageCount: number;
  onToggleExpand: (pid: string) => void;
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

const PMProjectRow = memo(function PMProjectRow({
  project: p,
  docCount,
  isExpanded,
  stageCount,
  onToggleExpand,
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
}: PMProjectRowProps) {
  const bgStyle = useMemo(() => {
    const c = riskHighlight ? getProjectRiskColor(p, riskHighlight) : null;
    return c ? { backgroundColor: c } : {};
  }, [p.risk, p.datum_smluvni, riskHighlight]);

  return (
    <TableRow className="hover:bg-muted/50 transition-colors h-9" style={bgStyle} data-project-id={p.project_id}>
      {/* Col 1 — Icon slot (📎 clip) */}
      <TableCell style={COL_ICON_STYLE} className="text-center px-0">
        {(docCount ?? 0) > 0 && (
          <span className="inline-flex items-center gap-0.5 text-muted-foreground text-[10px] cursor-pointer" onClick={() => onEditProject(p)}>
            <Paperclip className="h-3 w-3" />
            {docCount}
          </span>
        )}
      </TableCell>
      {/* Col 2 — Chevron slot */}
      <TableCell style={COL_CHEVRON_STYLE} className="px-0 cursor-pointer" onClick={() => onToggleExpand(p.project_id)}>
        <ExpandArrow projectId={p.project_id} isExpanded={isExpanded} stageCount={stageCount} />
      </TableCell>
      {v("project_id") && <TableCell className="font-mono text-xs truncate cursor-pointer hover:underline text-primary" title={p.project_id} onClick={() => onEditProject(p)}>{p.project_id}</TableCell>}
      {v("project_name") && <TableCell style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.project_name} className="truncate"><InlineEditableCell value={p.project_name} onSave={(val) => save(p.id, "project_name", val, p.project_name)} className="font-medium" readOnly={!canEdit || isFieldReadOnly("project_name")} /></TableCell>}
      {renderKeys.map((key) => renderColumnCell({ colKey: key, project: p, save, canEdit, statusLabels, customColumns, saveCustomField: (rowId, colKey, val, old) => saveCustomField(rowId, colKey, val, old), isFieldReadOnly }))}
    </TableRow>
  );
});

interface PMStatusTableProps {
  personFilter: string | null;
  statusFilter: string[];
  search: string;
  riskHighlight?: import("@/hooks/useRiskHighlight").RiskHighlightType;
}

export function PMStatusTable({ personFilter, statusFilter, search: externalSearch, riskHighlight }: PMStatusTableProps) {
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
  const { pmStatus: { isVisible } } = useAllColumnVisibility();
  const { getLabel, getWidth, updateLabel, updateWidth, getOrderedKeys, getDisplayOrderedKeys, updateDisplayOrder } = useColumnLabels("pm-status");
  const [editMode, setEditMode] = useState(false);
  const { canEdit, canEditColumns, isFieldReadOnly } = useAuth();
  const { registerExport } = useExportContext();
  const { stagesByProject } = useStagesByProject();
  const allProjectIds = useMemo(() => projects.map((p) => p.project_id), [projects]);
  const projectStatuses = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const p of projects) map[p.project_id] = p.status;
    return map;
  }, [projects]);
  const { counts: docCounts } = useDocumentCounts(allProjectIds, projectStatuses);
  const [editProject, setEditProject] = useState<typeof projects[0] | null>(null);
  const { itemsByProject: tpvItemsByProject } = useAllTPVItems();
  const [activeTPVProject, setActiveTPVProject] = useState<{ projectId: string; projectName: string; autoImport?: boolean } | null>(null);
  const handleOpenTPVList = useCallback((projectId: string, projectName: string, autoImport?: boolean) => {
    setActiveTPVProject({ projectId, projectName, autoImport });
  }, []);

  // Memoize filter Sets to avoid re-creation on every render
  const statusFilterSet = useMemo(
    () => statusFilter && statusFilter.length > 0 ? new Set(statusFilter) : null,
    [statusFilter]
  );
  const searchLower = useMemo(
    () => externalSearch ? normalizeSearch(externalSearch) : null,
    [externalSearch]
  );

  // Frozen filter results: only recompute visible IDs when filter values or dataset size changes,
  // NOT when individual project data is edited.
  const filterFingerprint = JSON.stringify([personFilter, statusFilter, externalSearch]);
  const computeKey = `${filterFingerprint}|${projects.length}|${stagesByProject.size}`;
  const hasActiveFilters = !!(personFilter || (statusFilter && statusFilter.length > 0) || externalSearch);

  const frozenRef = useRef<{ key: string; ids: Set<string> }>({
    key: '', ids: new Set(),
  });

  // Recompute visible IDs only when filters or dataset size change
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

  // Build sorted list from frozen IDs + current project data (so edits are reflected)
  const sorted = useMemo(() => {
    const frozenIds = frozenRef.current.ids;
    let result = projects.filter((p) => frozenIds.has(p.project_id));

    if (sortCol && sortDir) {
      result = [...result].sort((a, b) => {
        const av = (a as any)[sortCol] ?? "";
        const bv = (b as any)[sortCol] ?? "";
        const numA = Number(av);
        const numB = Number(bv);
        if (!isNaN(numA) && !isNaN(numB) && av !== "" && bv !== "") {
          return sortDir === "asc" ? numA - numB : numB - numA;
        }
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

  const orderedNativeKeys = useMemo(() => getOrderedKeys(PM_NATIVE), [getOrderedKeys]);
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
    if (editMode) {
      await updateDisplayOrder(localOrder);
    } else {
      setLocalOrder(allVisibleKeys);
    }
    setEditMode(!editMode);
  }, [editMode, localOrder, allVisibleKeys, updateDisplayOrder]);

  const handleCancelEditMode = useCallback(() => {
    setLocalOrder(allVisibleKeys);
    setEditMode(false);
  }, [allVisibleKeys]);

  const { dragKey, dropTarget, getDragProps } = useHeaderDrag(localOrder, setLocalOrder);

  // Register export data getter with column metadata
  useEffect(() => {
    const allExportKeys = ["project_id", "project_name", ...allVisibleKeys];
    registerExport("pm-status", {
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

  if (activeTPVProject) {
    const proj = projects.find(p => p.project_id === activeTPVProject.projectId);
    return (
      <TPVList
        projectId={activeTPVProject.projectId}
        projectName={activeTPVProject.projectName}
        currency={proj?.currency || "CZK"}
        onBack={() => setActiveTPVProject(null)}
        autoOpenImport={activeTPVProject.autoImport}
      />
    );
  }

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Načítání...</div>;

  const v = isVisible;

  const renderKeys = editMode ? localOrder : allVisibleKeys;

  const allCurrentLabels = useMemo(() => {
    const keys = ["project_id", "project_name", ...renderKeys];
    return keys.map(k => getLabel(k, getColumnLabel(k, customColumns)));
  }, [renderKeys, getLabel, customColumns]);

  const headerProps = (key: string) => ({
    colKey: key,
    sortCol,
    sortDir,
    onSort: toggleSort,
    getLabel,
    getWidth,
    editMode,
    updateLabel,
    updateWidth,
    customColumns,
    existingLabels: allCurrentLabels,
    ...(editMode ? {
      dragProps: getDragProps(key),
      dropIndicator: dropTarget?.key === key ? dropTarget.side : null,
      isDragging: dragKey === key,
    } : {}),
  });

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
              {/* Col 1 — Icon slot (📎 clip) */}
              <TableHead style={COL_ICON_STYLE} className="text-center px-0">
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground/50 mx-auto" />
              </TableHead>
              {/* Col 2 — Chevron slot */}
              <TableHead style={COL_CHEVRON_STYLE} className="shrink-0 px-0">
                {sorted.length > 0 && (
                  <button
                    className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                    title={expanded.size === sorted.length ? "Sbalit vše" : "Rozbalit vše"}
                    onClick={() => {
                      if (expanded.size === sorted.length) {
                        setExpanded(new Set());
                        setShowAddButton(new Set());
                      } else {
                        setExpanded(new Set(sorted.map((p) => p.project_id)));
                        setShowAddButton(new Set());
                      }
                    }}
                  >
                    {expanded.size === sorted.length ? (
                      <ChevronsUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronsDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </TableHead>
              {v("project_id") && renderColumnHeader(headerProps("project_id"))}
              {v("project_name") && renderColumnHeader(headerProps("project_name"))}
              {renderKeys.map((key) => renderColumnHeader(headerProps(key)))}
              <ColumnVisibilityToggle tabKey="pmStatus" editMode={editMode} onToggleEditMode={canEditColumns ? handleToggleEditMode : undefined} onCancelEditMode={canEditColumns ? handleCancelEditMode : undefined} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((p) => (
              <Fragment key={p.id}>
                <PMProjectRow
                  project={p}
                  docCount={docCounts[p.project_id] ?? 0}
                  isExpanded={expanded.has(p.project_id)}
                  stageCount={stagesByProject.get(p.project_id)?.length ?? 0}
                  onToggleExpand={toggleExpand}
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
            {sorted.length === 0 && !isLoading && (
              <TableRow>
                <TableCell colSpan={99} className="text-center py-8 text-muted-foreground text-sm">
                  Žádné výsledky
                </TableCell>
              </TableRow>
            )}
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

      {editProject && <ProjectDetailDialog project={editProject} open={!!editProject} onOpenChange={(open) => { if (!open) setEditProject(null); }} onOpenTPVList={handleOpenTPVList} tpvItemCount={tpvItemsByProject.get(editProject.project_id)?.length ?? 0} />}
    </div>
  );
}
