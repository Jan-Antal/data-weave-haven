import { useState, Fragment, useMemo, useEffect, useCallback } from "react";
import { useAllCustomColumns, useUpdateCustomField } from "@/hooks/useCustomColumns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, RiskBadge } from "./StatusBadge";
import { InlineEditableCell } from "./InlineEditableCell";
import { SortableHeader } from "./SortableHeader";
import { useProjects } from "@/hooks/useProjects";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { useSortFilter } from "@/hooks/useSortFilter";
import { useProjectStages, useUpdateStage, useDeleteStage, useReorderStages } from "@/hooks/useProjectStages";
import { ConfirmDialog } from "./ConfirmDialog";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, Plus, Trash2, GripVertical } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProjectStage } from "@/hooks/useProjectStages";
import type { Project } from "@/hooks/useProjects";
import { ColumnVisibilityToggle } from "./ColumnVisibilityToggle";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { getProjectRiskColor } from "@/hooks/useRiskHighlight";
import { useAllColumnVisibility, PROJECT_INFO_NATIVE, PM_NATIVE, TPV_NATIVE, ALL_COLUMNS } from "./ColumnVisibilityContext";
import { getColumnStyle, renderColumnHeader, renderColumnCell } from "./CrossTabColumns";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useHeaderDrag } from "@/hooks/useHeaderDrag";
import { useExportContext } from "./ExportContext";
import { getProjectCellValue } from "@/lib/exportExcel";
import { getColumnLabel } from "./CrossTabColumns";
import { useStagesByProject } from "@/hooks/useAllProjectStages";

const NATIVE_KEYS = ["project_id", "project_name", ...PM_NATIVE];
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key);

const stageStatuses = ["Plánováno", "Probíhá", "Dokončeno", "Pozastaveno"];

/** Check if any stage matches the active filters */
function stageMatchesFilters(
  stages: ProjectStage[],
  personFilter: string | null,
  statusFilter: string[],
  search: string | undefined
): boolean {
  if (stages.length === 0) return false;

  return stages.some((stage) => {
    // Person filter
    if (personFilter && stage.pm && String(stage.pm).includes(personFilter)) return true;

    // Status filter
    if (statusFilter && statusFilter.length > 0 && stage.status && statusFilter.includes(stage.status)) return true;

    // Text search
    if (search) {
      const q = search.toLowerCase();
      const searchable = [stage.stage_name, stage.pm, stage.status, stage.notes, stage.pm_poznamka];
      if (searchable.some((v) => v && String(v).toLowerCase().includes(q))) return true;
    }

    return false;
  });
}

const INHERITABLE_FIELDS = ["pm", "status", "risk", "zamereni", "tpv_date", "expedice", "montaz", "predani", "pm_poznamka", "datum_smluvni"];

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
}

function SortableStageRow({ stage, project, onDelete, isVisible, statusLabels, canEdit, renderKeys, isFieldInherited, onFieldTouched, cancelConfirm, onCancelConfirm, onCancelDismiss }: StageRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  const updateStage = useUpdateStage();
  const style = { transform: CSS.Transform.toString(transform), transition };
  const saveStage = (field: string, value: string) => {
    onFieldTouched?.(field);
    updateStage.mutate({ id: stage.id, field, value, projectId: project.project_id });
  };
  const v = isVisible;
  const inheritedClass = (field: string) => isFieldInherited?.(field) ? "text-blue-300" : "";

  const renderStageCell = (key: string) => {
    switch (key) {
      case "datum_smluvni": return <TableCell key={key}><span className={cn("text-xs px-1", isFieldInherited?.(key) ? "text-blue-300" : "text-muted-foreground")}>{project.datum_smluvni || "—"}</span></TableCell>;
      case "pm": return <TableCell key={key}><InlineEditableCell value={stage.pm} type="people" peopleRole="PM" onSave={(val) => saveStage("pm", val)} readOnly={!canEdit} className={inheritedClass("pm")} /></TableCell>;
      case "status": return <TableCell key={key}><InlineEditableCell value={stage.status} type="select" options={statusLabels} onSave={(val) => saveStage("status", val)} displayValue={stage.status ? <StatusBadge status={stage.status} /> : "—"} readOnly={!canEdit} className={inheritedClass("status")} /></TableCell>;
      case "risk": return <TableCell key={key}><InlineEditableCell value={stage.risk} type="select" options={["Low", "Medium", "High"]} onSave={(val) => saveStage("risk", val)} displayValue={<RiskBadge level={stage.risk || ""} />} readOnly={!canEdit} className={inheritedClass("risk")} /></TableCell>;
      case "zamereni": return <TableCell key={key}><InlineEditableCell value={stage.zamereni} type="date" onSave={(val) => saveStage("zamereni", val)} readOnly={!canEdit} className={inheritedClass("zamereni")} /></TableCell>;
      case "tpv_date": return <TableCell key={key}><InlineEditableCell value={stage.tpv_date} type="date" onSave={(val) => saveStage("tpv_date", val)} readOnly={!canEdit} className={inheritedClass("tpv_date")} /></TableCell>;
      case "expedice": return <TableCell key={key}><InlineEditableCell value={stage.expedice} type="date" onSave={(val) => saveStage("expedice", val)} readOnly={!canEdit} className={inheritedClass("expedice")} /></TableCell>;
      case "montaz": return <TableCell key={key}><InlineEditableCell value={(stage as any).montaz} type="date" onSave={(val) => saveStage("montaz", val)} readOnly={!canEdit} className={inheritedClass("montaz")} /></TableCell>;
      case "predani": return <TableCell key={key}><InlineEditableCell value={stage.predani} type="date" onSave={(val) => saveStage("predani", val)} readOnly={!canEdit} className={inheritedClass("predani")} /></TableCell>;
      case "pm_poznamka": return <TableCell key={key}><InlineEditableCell value={stage.pm_poznamka} type="textarea" onSave={(val) => saveStage("pm_poznamka", val)} readOnly={!canEdit} className={inheritedClass("pm_poznamka")} /></TableCell>;
      default: return <TableCell key={key} />;
    }
  };

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

function StagesSection({ projectId, project, isVisible, statusLabels, canEdit, renderKeys }: { projectId: string; project: Project; isVisible: (key: string) => boolean; statusLabels: string[]; canEdit: boolean; renderKeys: string[] }) {
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

  const handleInlineAdd = async () => {
    const stageName = `${projectId}-${nextSuffix()}`;
    const id = crypto.randomUUID();

    // Build inherited data from parent
    const inheritedData: Record<string, any> = {};
    const inheritedKeys = new Set<string>();
    for (const field of INHERITABLE_FIELDS) {
      const val = (project as any)[field];
      if (val != null && val !== "") {
        inheritedData[field] = val;
        inheritedKeys.add(field);
      }
    }

    const { error } = await supabase.from("project_stages").insert({
      id,
      project_id: projectId,
      stage_name: stageName,
      stage_order: stages.length,
      ...inheritedData,
    });

    if (error) {
      toast({ title: "Chyba", description: "Nepodařilo se vytvořit etapu", variant: "destructive" });
      return;
    }

    setFreshStages(prev => new Map(prev).set(id, inheritedKeys));
    qc.invalidateQueries({ queryKey: ["project_stages", projectId] });
    qc.invalidateQueries({ queryKey: ["all_project_stages"] });
  };

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

  const handleCancelStage = async (stageId: string) => {
    await supabase.from("project_stages").delete().eq("id", stageId);
    setFreshStages(prev => { const next = new Map(prev); next.delete(stageId); return next; });
    setCancelConfirmId(null);
    qc.invalidateQueries({ queryKey: ["project_stages", projectId] });
    qc.invalidateQueries({ queryKey: ["all_project_stages"] });
  };

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
            <SortableStageRow
              key={stage.id}
              stage={stage}
              project={project}
              onDelete={(id) => setDeleteId(id)}
              isVisible={isVisible}
              statusLabels={statusLabels}
              canEdit={canEdit}
              renderKeys={renderKeys}
              isFieldInherited={freshStages.has(stage.id) ? (field) => freshStages.get(stage.id)?.has(field) ?? false : undefined}
              onFieldTouched={freshStages.has(stage.id) ? (field) => markFieldTouched(stage.id, field) : undefined}
              cancelConfirm={cancelConfirmId === stage.id}
              onCancelConfirm={() => handleCancelStage(stage.id)}
              onCancelDismiss={() => setCancelConfirmId(null)}
            />
          ))}
        </SortableContext>
      </DndContext>
      <TableRow className="bg-muted/20 h-9">
        <TableCell colSpan={16}>
          <Button variant="ghost" size="sm" className="text-xs h-6" onClick={handleInlineAdd}>
            <Plus className="h-3 w-3 mr-1" /> Přidat etapu
          </Button>
        </TableCell>
      </TableRow>

      <ConfirmDialog open={!!deleteId} onConfirm={() => { if (deleteId) { deleteStage.mutate({ id: deleteId, projectId }); setDeleteId(null); } }} onCancel={() => setDeleteId(null)} />
    </>
  );
}

function ExpandArrow({ projectId, isExpanded }: { projectId: string; isExpanded: boolean }) {
  const { data: stages = [] } = useProjectStages(projectId);
  const hasStages = stages.length > 0;
  if (isExpanded) {
    return <ChevronDown className={`h-5 w-5 stroke-[3] ${hasStages ? "text-accent" : "text-muted-foreground"}`} />;
  }
  return <ChevronRight className={`h-5 w-5 stroke-[3] ${hasStages ? "text-accent fill-accent/20" : "text-muted-foreground/50"}`} />;
}

interface PMStatusTableProps {
  personFilter: string | null;
  statusFilter: string[];
  search: string;
  riskHighlight?: import("@/hooks/useRiskHighlight").RiskHighlightType;
}

export function PMStatusTable({ personFilter, statusFilter, search: externalSearch, riskHighlight }: PMStatusTableProps) {
  const { data: projects = [], isLoading } = useProjects();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const statusLabels = statusOptions.map((s) => s.label);
  const updateProject = useUpdateProject();
  const { columns: customColumns } = useAllCustomColumns("projects");
  const updateCustomField = useUpdateCustomField();
  const qc = useQueryClient();
  const { sorted: baseSorted, sortCol, sortDir, toggleSort } = useSortFilter(projects, { personFilter, statusFilter }, externalSearch);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { pmStatus: { isVisible } } = useAllColumnVisibility();
  const { getLabel, getWidth, updateLabel, updateWidth, getOrderedKeys, getDisplayOrderedKeys, updateDisplayOrder } = useColumnLabels("pm-status");
  const [editMode, setEditMode] = useState(false);
  const { canEdit, canEditColumns } = useAuth();
  const { registerExport } = useExportContext();
  const { stagesByProject } = useStagesByProject();

  // Stage-aware filtering: find parents to include because their stages match filters
  const hasActiveFilters = !!(personFilter || (statusFilter && statusFilter.length > 0) || externalSearch);

  const { sorted, stageExpandedIds } = useMemo(() => {
    if (!hasActiveFilters || stagesByProject.size === 0) {
      return { sorted: baseSorted, stageExpandedIds: new Set<string>() };
    }

    const baseSortedIds = new Set(baseSorted.map((p) => p.project_id));
    const extraParents: Project[] = [];
    const autoExpand = new Set<string>();

    for (const p of projects) {
      // Skip projects already in results
      if (baseSortedIds.has(p.project_id)) {
        // But still check if stages match to auto-expand
        const stages = stagesByProject.get(p.project_id) || [];
        if (stageMatchesFilters(stages, personFilter, statusFilter, externalSearch)) {
          autoExpand.add(p.project_id);
        }
        continue;
      }

      // Check if any stage of this project matches the filters
      const stages = stagesByProject.get(p.project_id) || [];
      if (stageMatchesFilters(stages, personFilter, statusFilter, externalSearch)) {
        extraParents.push(p);
        autoExpand.add(p.project_id);
      }
    }

    // Merge extra parents into sorted list, maintaining project_id order
    const merged = [...baseSorted, ...extraParents].sort((a, b) =>
      a.project_id.localeCompare(b.project_id, "cs")
    );

    return { sorted: merged, stageExpandedIds: autoExpand };
  }, [baseSorted, projects, stagesByProject, hasActiveFilters, personFilter, statusFilter, externalSearch]);

  // Auto-expand parents whose stages matched
  useEffect(() => {
    if (stageExpandedIds.size > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const id of stageExpandedIds) next.add(id);
        return next;
      });
    }
  }, [stageExpandedIds]);

  const orderedNativeKeys = useMemo(() => getOrderedKeys(PM_NATIVE), [getOrderedKeys]);
  const orderedAllKeys = useMemo(() => getOrderedKeys(ALL_KEYS), [getOrderedKeys]);

  const allVisibleGroupOrder = useMemo(() => {
    const native = orderedNativeKeys.filter((k) => isVisible(k));
    const cross = orderedAllKeys.filter((k) => !NATIVE_KEYS.includes(k) && isVisible(k));
    return [...native, ...cross];
  }, [orderedNativeKeys, orderedAllKeys, isVisible]);

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

  const { dragKey, dropTarget, getDragProps } = useHeaderDrag(localOrder, setLocalOrder);

  // Register export data getter with column metadata
  useEffect(() => {
    const allExportKeys = ["project_id", "project_name", ...allVisibleKeys];
    registerExport("pm-status", {
      getter: (selectedKeys) => {
        const keys = selectedKeys ?? allExportKeys;
        const headers = keys.map(k => getLabel(k, getColumnLabel(k)));
        const rows = sorted.map(p => keys.map(k => getProjectCellValue(p as any, k)));
        return { headers, rows };
      },
      groups: [
        { label: "Project Info", keys: ["project_id", "project_name", ...PROJECT_INFO_NATIVE], getLabel: (k) => getLabel(k, getColumnLabel(k)) },
        { label: "PM Status", keys: PM_NATIVE, getLabel: (k) => getLabel(k, getColumnLabel(k)) },
        { label: "TPV Status", keys: TPV_NATIVE, getLabel: (k) => getLabel(k, getColumnLabel(k)) },
      ],
      defaultVisibleKeys: allExportKeys,
    });
  }, [registerExport, sorted, allVisibleKeys, getLabel]);

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

  const v = isVisible;

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
    ...(editMode ? {
      dragProps: getDragProps(key),
      dropIndicator: dropTarget?.key === key ? dropTarget.side : null,
      isDragging: dragKey === key,
    } : {}),
  });

  const renderKeys = editMode ? localOrder : allVisibleKeys;

  return (
    <div>
      {editMode && (
        <div className="bg-accent/10 border border-accent/30 text-accent text-xs font-medium px-3 py-1.5 rounded-t-lg">
          Režim úpravy sloupců
        </div>
      )}
      <div className={cn("rounded-lg border bg-card overflow-x-auto always-scrollbar", editMode && "rounded-t-none border-t-0")}>
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/5">
              <TableHead style={{ minWidth: 36, width: 36, maxWidth: 36 }} className="shrink-0"></TableHead>
              {v("project_id") && renderColumnHeader(headerProps("project_id"))}
              {v("project_name") && renderColumnHeader(headerProps("project_name"))}
              {renderKeys.map((key) => renderColumnHeader(headerProps(key)))}
              <ColumnVisibilityToggle tabKey="pmStatus" editMode={editMode} onToggleEditMode={canEditColumns ? handleToggleEditMode : undefined} />
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
                  {v("project_name") && <TableCell style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.project_name} className="truncate"><InlineEditableCell value={p.project_name} onSave={(val) => save(p.id, "project_name", val, p.project_name)} className="font-medium" readOnly={!canEdit} /></TableCell>}
                  {renderKeys.map((key) => renderColumnCell({ colKey: key, project: p, save, canEdit, statusLabels, customColumns, saveCustomField: (rowId, colKey, val, old) => updateCustomField.mutate({ rowId, tableName: "projects", columnKey: colKey, value: val, oldValue: old }) }))}
                </TableRow>
                {expanded.has(p.project_id) && <StagesSection projectId={p.project_id} project={p} isVisible={v} statusLabels={statusLabels} canEdit={canEdit} renderKeys={renderKeys} />}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
