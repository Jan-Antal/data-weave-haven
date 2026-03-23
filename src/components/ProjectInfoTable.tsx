import { useState, useEffect, useCallback, useMemo, memo, Fragment, useRef } from "react";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { logActivity } from "@/lib/activityLog";
import { useDataLogRowHighlight } from "@/hooks/useDataLogRowHighlight";
import { useAllCustomColumns, useUpdateCustomField } from "@/hooks/useCustomColumns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InlineEditableCell } from "./InlineEditableCell";
import { CurrencyEditCell } from "./CurrencyEditCell";
import { formatCurrency, formatMarze, marzeInputToStorage, marzeStorageToInput } from "@/lib/currency";
import { getStageDisplayValue, stageFieldClass, buildInheritedStageData, getInheritedFieldKeys, addEditedField, EDITABLE_INHERITED, READ_ONLY_INHERITED } from "@/lib/stageInheritance";
import { StatusBadge, RiskBadge } from "./StatusBadge";
import { SortableHeader } from "./SortableHeader";
import { useProjects } from "@/hooks/useProjects";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { useSortFilter } from "@/hooks/useSortFilter";
import { useProjectStages, useUpdateStage, useDeleteStage, useReorderStages } from "@/hooks/useProjectStages";
import { ConfirmDialog } from "./ConfirmDialog";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatAppDate, parseAppDate } from "@/lib/dateFormat";
import { CalendarIcon, Paperclip, List, ChevronRight, ChevronDown, Plus, Trash2, GripVertical, ChevronsDown, ChevronsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { PeopleSelectDropdown } from "./PeopleSelectDropdown";
import { ProjectDetailDialog } from "./ProjectDetailDialog";
import { TPVList } from "./TPVList";
import { ColumnVisibilityToggle } from "./ColumnVisibilityToggle";
import { useProjectIdCheck } from "@/hooks/useProjectIdCheck";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import { useAuth } from "@/hooks/useAuth";
import { getProjectRiskColor } from "@/hooks/useRiskHighlight";
import { useAllColumnVisibility, PROJECT_INFO_NATIVE, PM_NATIVE, TPV_NATIVE, ALL_COLUMNS } from "./ColumnVisibilityContext";
import { getColumnStyle, renderColumnHeader, renderColumnCell, COL_ICON_STYLE, COL_CHEVRON_STYLE } from "./CrossTabColumns";
import { useHeaderDrag } from "@/hooks/useHeaderDrag";
import { useDocumentCounts } from "@/hooks/useDocumentCounts";
import { useExportContext } from "./ExportContext";
import { getProjectCellValue } from "@/lib/exportExcel";
import { getColumnLabel } from "./CrossTabColumns";
import { useAllTPVItems } from "@/hooks/useAllTPVItems";
import { useStagesByProject } from "@/hooks/useAllProjectStages";
import { matchesStatusFilter, normalizedIncludes, normalizeSearch } from "@/lib/statusFilter";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ProjectStage } from "@/hooks/useProjectStages";
import type { Project } from "@/hooks/useProjects";

const NATIVE_KEYS = ["project_id", "project_name", ...PROJECT_INFO_NATIVE];
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key);

const emptyProject = {
  project_id: "",
  project_name: "",
  klient: "",
  pm: "",
  konstrukter: "",
  kalkulant: "",
  status: "Příprava",
  datum_smluvni: "",
  prodejni_cena: "",
  currency: "CZK",
  marze: "",
  fakturace: "",
};

// (inheritance constants now in stageInheritance.ts)

// ── Smart filtering helpers (AND logic — all active filters must match) ──
function stageMatchesFilters(
  stages: ProjectStage[],
  personFilter: string | null,
  statusFilterSet: Set<string> | null,
  searchLower: string | null
): boolean {
  for (const stage of stages) {
    if (singleStageMatches(stage, personFilter, statusFilterSet, searchLower)) return true;
  }
  return false;
}

function singleStageMatches(
  stage: ProjectStage,
  personFilter: string | null,
  statusFilterSet: Set<string> | null,
  searchLower: string | null
): boolean {
  // AND logic: every active filter must pass
  if (personFilter && !(stage.pm && String(stage.pm).includes(personFilter))) return false;
  if (statusFilterSet && !matchesStatusFilter(stage.status, statusFilterSet)) return false;
  if (searchLower) {
    const searchable = [stage.stage_name, stage.pm, stage.status, stage.notes, stage.pm_poznamka];
    const found = searchable.some(v => normalizedIncludes(v, searchLower));
    if (!found) return false;
  }
  return true;
}

// ── Expand arrow ────────────────────────────────────────────────────
function ExpandArrow({ isExpanded, stageCount }: { isExpanded: boolean; stageCount: number }) {
  const hasStages = stageCount > 0;
  if (isExpanded) {
    return <ChevronDown className={`h-5 w-5 stroke-[3] ${hasStages ? "text-accent" : "text-muted-foreground"}`} />;
  }
  return <ChevronRight className={`h-5 w-5 stroke-[3] ${hasStages ? "text-accent" : "text-muted-foreground/50"}`} />;
}

// ── Stage row ───────────────────────────────────────────────────────
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
  saveCurrency?: (id: string, amount: string, currency: string, oldAmount: string, oldCurrency: string) => void;
  freshInheritedFields?: Set<string>;
}

function SortableStageRow({ stage, project, onDelete, isVisible, statusLabels, canEdit, renderKeys, cancelConfirm, onCancelConfirm, onCancelDismiss, dimmed, saveCurrency, freshInheritedFields }: StageRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  const updateStage = useUpdateStage();
  const { isFieldReadOnly } = useAuth();
  const style = { transform: CSS.Transform.toString(transform), transition };
  const saveStage = useCallback((field: string, value: string) => {
    const tracked = ["konstrukter", "status", "datum_smluvni"];
    // Convert numeric fields
    const finalValue = field === "prodejni_cena" ? (value === "" ? null : Number(value)) : value;
    // Mark field as manually edited
    const newEditedFields = addEditedField(stage, field);
    updateStage.mutate({
      id: stage.id, field, value: finalValue, projectId: project.project_id,
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
      case "klient": return <TableCell key={key}><span className="text-xs">{project.klient || "—"}</span></TableCell>;
      case "kalkulant": return <TableCell key={key}><InlineEditableCell value={(stage as any).kalkulant} type="people" peopleRole="Kalkulant" onSave={(val) => saveStage("kalkulant", val)} readOnly={!canEdit} className={ihClass("kalkulant")} /></TableCell>;
      case "pm": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "pm")} type="people" peopleRole="PM" onSave={(val) => saveStage("pm", val)} readOnly={!canEdit} className={ihClass("pm")} /></TableCell>;
      case "status": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "status")} type="select" options={statusLabels} onSave={(val) => saveStage("status", val)} displayValue={getStageDisplayValue(stage, project, "status") ? <StatusBadge status={getStageDisplayValue(stage, project, "status")} /> : "—"} readOnly={!canEdit} className={ihClass("status")} /></TableCell>;
      case "datum_smluvni": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "datum_smluvni")} type="date" onSave={(val) => saveStage("datum_smluvni", val)} readOnly={!canEdit || isFieldReadOnly("datum_smluvni", stage.datum_smluvni ?? null)} className={ihClass("datum_smluvni")} /></TableCell>;
      case "datum_objednavky": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "start_date")} type="date" onSave={(val) => saveStage("start_date", val)} readOnly={!canEdit} className={ihClass("start_date")} /></TableCell>;
      case "prodejni_cena": {
        if (canEdit) {
          return <TableCell key={key} className="text-right"><CurrencyEditCell value={(stage as any).prodejni_cena} currency={(stage as any).currency || "CZK"} onSave={(a, c) => { saveStage("prodejni_cena", a); saveStage("currency", c); }} /></TableCell>;
        }
        return <TableCell key={key} className="text-right"><span className="text-xs font-sans">{formatCurrency((stage as any).prodejni_cena, (stage as any).currency || "CZK")}</span></TableCell>;
      }
      case "marze": return <TableCell key={key} className="text-right"><InlineEditableCell value={marzeStorageToInput((stage as any).marze)} onSave={(val) => saveStage("marze", marzeInputToStorage(val) || "")} readOnly={!canEdit} displayValue={<span className="text-xs font-sans">{formatMarze((stage as any).marze)}</span>} /></TableCell>;
      case "location": return <TableCell key={key}><span className="text-xs">{project.location || "—"}</span></TableCell>;
      case "architekt": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "architekt")} onSave={(val) => saveStage("architekt", val)} readOnly={!canEdit} className={ihClass("architekt")} /></TableCell>;
      case "konstrukter": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "konstrukter")} type="people" peopleRole="Konstruktér" onSave={(val) => saveStage("konstrukter", val)} readOnly={!canEdit} className={ihClass("konstrukter")} /></TableCell>;
      case "risk": return <TableCell key={key}><InlineEditableCell value={getStageDisplayValue(stage, project, "risk")} type="select" options={["Low", "Medium", "High"]} onSave={(val) => saveStage("risk", val)} displayValue={<RiskBadge level={getStageDisplayValue(stage, project, "risk") || ""} />} readOnly={!canEdit} className={ihClass("risk")} /></TableCell>;
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
        <TableCell className="font-sans text-xs truncate pl-4 text-muted-foreground">
          {(() => {
            const suffix = stage.stage_name.startsWith(project.project_id + "-")
              ? stage.stage_name.slice(project.project_id.length + 1)
              : stage.stage_name;
            const canEditSuffix = canEdit;
            return (
              <div className="flex items-center gap-0 h-7 leading-7">
                <span className="text-muted-foreground/60 shrink-0">{project.project_id}-</span>
                <InlineEditableCell
                  value={suffix}
                  onSave={(val) => {
                    const newStageName = `${project.project_id}-${val.replace(/^-/, "")}`;
                    saveStage("stage_name", newStageName);
                  }}
                  readOnly={!canEditSuffix}
                  className="!p-0 !h-7 !leading-7 inline-block max-w-[60px]"
                />
              </div>
            );
          })()}
        </TableCell>
      )}
      {v("project_name") && (
        <TableCell className="truncate text-xs" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <InlineEditableCell
            value={getStageDisplayValue(stage, project, "display_name") || ""}
            onSave={(val) => saveStage("display_name", val)}
            readOnly={!canEdit}
            className={ihClass("display_name")}
          />
        </TableCell>
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

// ── Stages section ──────────────────────────────────────────────────
function StagesSection({ projectId, project, isVisible, statusLabels, canEdit, renderKeys, personFilter, statusFilterSet, searchLower, showAddButton = true, saveCurrency, parentMatchesSearch = false }: { projectId: string; project: Project; isVisible: (key: string) => boolean; statusLabels: string[]; canEdit: boolean; renderKeys: string[]; personFilter: string | null; statusFilterSet: Set<string> | null; searchLower: string | null; showAddButton?: boolean; saveCurrency?: (id: string, amount: string, currency: string, oldAmount: string, oldCurrency: string) => void; parentMatchesSearch?: boolean }) {
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

  // Auto-clear freshStages after animation duration (2s)
  useEffect(() => {
    if (freshStages.size === 0) return;
    const timer = setTimeout(() => {
      setFreshStages(new Map());
    }, 2000);
    return () => clearTimeout(timer);
  }, [freshStages.size]);

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


              cancelConfirm={cancelConfirmId === stage.id}
              onCancelConfirm={() => handleCancelStage(stage.id)}
              onCancelDismiss={() => setCancelConfirmId(null)}
              dimmed={parentMatchesSearch ? false : !singleStageMatches(stage, personFilter, statusFilterSet, searchLower)}
              saveCurrency={saveCurrency}
              freshInheritedFields={freshStages.get(stage.id)}
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

// ── Memoized project row ────────────────────────────────────────────
interface ProjectRowProps {
  project: Project;
  docCount: number | undefined;
  docFailed?: boolean;
  isExpanded: boolean;
  stageCount: number;
  tpvCount: number;
  onToggleExpand: (pid: string) => void;
  onOpenTPVList: (projectId: string, projectName: string) => void;
  isVisible: (key: string) => boolean;
  renderKeys: string[];
  save: (id: string, field: string, value: string, oldValue: string) => void;
  saveCurrency: (id: string, amount: string, currency: string, oldAmount: string, oldCurrency: string) => void;
  canEdit: boolean;
  statusLabels: string[];
  customColumns: any[];
  saveCustomField: (rowId: string, colKey: string, val: string, old: string) => void;
  riskHighlight: any;
  onEditProject: (p: Project) => void;
  isFieldReadOnly: (field: string) => boolean;
}

const ProjectRow = memo(function ProjectRow({
  project: p,
  docCount,
  docFailed,
  isExpanded,
  stageCount,
  tpvCount,
  onToggleExpand,
  onOpenTPVList,
  isVisible: v,
  renderKeys,
  save,
  saveCurrency,
  canEdit,
  statusLabels,
  customColumns,
  saveCustomField,
  riskHighlight,
  onEditProject,
  isFieldReadOnly,
}: ProjectRowProps) {
  const bgStyle = useMemo(() => {
    const c = riskHighlight ? getProjectRiskColor(p, riskHighlight) : null;
    return c ? { backgroundColor: c } : {};
  }, [p.risk, p.datum_smluvni, riskHighlight]);

  return (
    <TableRow className="hover:bg-muted/50 transition-colors h-9" style={bgStyle} data-project-id={p.project_id}>
      {/* Col 1 — Icon slot */}
      <TableCell style={COL_ICON_STYLE} className="text-center px-0">
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-[10px] cursor-pointer",
            docCount !== undefined && docCount > 0 ? "text-[#223937]" : "text-[#99a5a3]"
          )}
          onClick={() => onEditProject(p)}
          title={docFailed ? "Nepodařilo se načíst – klikněte pro ruční obnovení" : undefined}
        >
          <Paperclip className="h-3 w-3" />
          {docFailed ? "?" : docCount !== undefined ? docCount : "—"}
        </span>
      </TableCell>
      {/* Col 2 — Chevron slot */}
      <TableCell style={COL_CHEVRON_STYLE} className="px-0 cursor-pointer" onClick={() => onToggleExpand(p.project_id)}>
        <ExpandArrow isExpanded={isExpanded} stageCount={stageCount} />
      </TableCell>
      {v("project_id") && (
        <TableCell className="font-sans font-semibold text-xs truncate cursor-pointer hover:underline text-primary" title={p.project_id} onClick={() => onEditProject(p)}>
          {p.project_id}
        </TableCell>
      )}
      {v("project_name") && <TableCell style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.project_name}><span className="font-medium cursor-pointer hover:underline hover:text-primary transition-colors truncate" onClick={() => onEditProject(p)}>{p.project_name}</span></TableCell>}
      {renderKeys.map((key) => renderColumnCell({ colKey: key, project: p, save, canEdit, statusLabels, saveCurrency, customColumns, saveCustomField: (rowId, colKey, val, old) => saveCustomField(rowId, colKey, val, old), isFieldReadOnly }))}
    </TableRow>
  );
});

// ── Main component ──────────────────────────────────────────────────
interface ProjectInfoTableProps {
  personFilter: string | null;
  statusFilter: string[];
  search: string;
  riskHighlight?: import("@/hooks/useRiskHighlight").RiskHighlightType;
}

export function ProjectInfoTable({ personFilter, statusFilter, search: externalSearch, riskHighlight }: ProjectInfoTableProps) {
  useDataLogRowHighlight();
  const { data: projects = [], isLoading } = useProjects();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const statusLabels = useMemo(() => statusOptions.map((s) => s.label), [statusOptions]);
  const updateProject = useUpdateProject();
  const { columns: customColumns } = useAllCustomColumns("projects");
  const updateCustomField = useUpdateCustomField();
  const { sorted: baseSorted, sortCol, sortDir, toggleSort } = useSortFilter(projects, { personFilter, statusFilter }, externalSearch);
  const allProjectIds = useMemo(() => projects.map((p) => p.project_id), [projects]);
  const projectStatuses = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const p of projects) map[p.project_id] = p.status;
    return map;
  }, [projects]);
  const { counts: docCounts, failed: docFailed } = useDocumentCounts(allProjectIds, projectStatuses);
  const [addOpen, setAddOpen] = useState(false);
  const [newProj, setNewProj] = useState({ ...emptyProject });
  const [datumWarning, setDatumWarning] = useState(false);
  const qc = useQueryClient();
  const [editProject, setEditProject] = useState<typeof projects[0] | null>(null);
  const { itemsByProject: tpvItemsByProject } = useAllTPVItems();
  const [activeTPVProject, setActiveTPVProject] = useState<{ projectId: string; projectName: string; autoImport?: boolean } | null>(null);
  const handleOpenTPVList = useCallback((projectId: string, projectName: string, autoImport?: boolean) => {
    setActiveTPVProject({ projectId, projectName, autoImport });
  }, []);
  const { projectInfo: { isVisible } } = useAllColumnVisibility();
  const { idExists, checkProjectId, reset: resetIdCheck } = useProjectIdCheck();
  const { getLabel, getWidth, updateLabel, updateWidth, getOrderedKeys, getDisplayOrderedKeys, updateDisplayOrder } = useColumnLabels("project-info");
  const [editMode, setEditMode] = useState(false);
  const { canEdit, canEditColumns, canDeleteProject, isViewer, isFieldReadOnly } = useAuth();
  const { registerExport } = useExportContext();
  const { stagesByProject } = useStagesByProject();

  // Expand/collapse state
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAddButton, setShowAddButton] = useState<Set<string>>(new Set());

  // Memoize filter Sets
  const statusFilterSet = useMemo(
    () => statusFilter && statusFilter.length > 0 ? new Set(statusFilter) : null,
    [statusFilter]
  );
  const searchLower = useMemo(
    () => externalSearch ? normalizeSearch(externalSearch) : null,
    [externalSearch]
  );

  // Frozen filter results — include project IDs fingerprint so rename triggers recalculation
  const filterFingerprint = JSON.stringify([personFilter, statusFilter, externalSearch]);
  const projectIdsFingerprint = useMemo(() => projects.map(p => p.project_id).join(","), [projects]);
  const computeKey = `${filterFingerprint}|${projects.length}|${stagesByProject.size}|${projectIdsFingerprint}`;
  const hasActiveFilters = !!(personFilter || (statusFilter && statusFilter.length > 0) || externalSearch);

  const frozenRef = useRef<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() });

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

  // Persisted group order from DB (for side panel)
  const orderedNativeKeys = useMemo(() => getOrderedKeys(PROJECT_INFO_NATIVE), [getOrderedKeys]);
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

  const allCurrentLabels = useMemo(() => {
    const rk = editMode ? localOrder : allVisibleKeys;
    const keys = ["project_id", "project_name", ...rk];
    return keys.map(k => getLabel(k, getColumnLabel(k, customColumns)));
  }, [editMode, localOrder, allVisibleKeys, getLabel, customColumns]);

  useEffect(() => {
    const handleOpenAdd = () => setAddOpen(true);
    document.addEventListener("open-add-project", handleOpenAdd);
    return () => document.removeEventListener("open-add-project", handleOpenAdd);
  }, []);

  // Register export data getter with column metadata
  useEffect(() => {
    const allExportKeys = ["project_id", "project_name", ...allVisibleKeys];
    registerExport("project-info", {
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

  const saveCurrency = useCallback((id: string, amount: string, currency: string, oldAmount: string, oldCurrency: string) => {
    const parsedAmount = amount === "" ? null : Number(amount);
    supabase.from("projects").update({ prodejni_cena: parsedAmount, currency } as any).eq("id", id).then(({ error }) => {
      if (error) {
        toast({ title: "Chyba", description: error.message, variant: "destructive" });
      } else {
        qc.invalidateQueries({ queryKey: ["projects"] });
        toast({ title: "Uloženo" });
      }
    });
  }, [qc]);

  const handleSaveCustomField = useCallback((rowId: string, colKey: string, val: string, old: string) => {
    updateCustomField.mutate({ rowId, tableName: "projects", columnKey: colKey, value: val, oldValue: old });
  }, [updateCustomField]);

  const handleEditProject = useCallback((p: Project) => {
    setEditProject(p);
  }, []);

  const handleAddProject = async () => {
    if (!newProj.project_id || !newProj.project_name) return;
    if (!newProj.datum_smluvni && !datumWarning) {
      setDatumWarning(true);
      return;
    }
    const { error } = await supabase.from("projects").insert({
      project_id: newProj.project_id,
      project_name: newProj.project_name,
      klient: newProj.klient || null,
      pm: newProj.pm || null,
      konstrukter: newProj.konstrukter || null,
      kalkulant: newProj.kalkulant || null,
      status: newProj.status || null,
      datum_smluvni: newProj.datum_smluvni || null,
      prodejni_cena: newProj.prodejni_cena ? Number(newProj.prodejni_cena) : null,
      currency: newProj.currency || "CZK",
      marze: marzeInputToStorage(newProj.marze),
      fakturace: newProj.fakturace || null,
    });
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Projekt vytvořen" });
      logActivity({ projectId: newProj.project_id, actionType: "project_created", detail: newProj.project_name });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setAddOpen(false);
      setNewProj({ ...emptyProject });
      setDatumWarning(false);
    }
  };

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
    <div className="h-full flex flex-col">
      {editMode && (
        <div className="bg-accent/10 border border-accent/30 text-accent text-xs font-medium px-3 py-1.5 rounded-t-lg shrink-0">
          Režim úpravy sloupců
        </div>
      )}
      <div className={cn("rounded-lg border bg-card flex flex-col flex-1 min-h-0", editMode && "rounded-t-none border-t-0")}>
        <div ref={tableScrollRef} className="flex-1 overflow-auto always-scrollbar rounded-t-lg">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="bg-primary/5">
                {/* Col 1 — Icon slot */}
                <TableHead style={COL_ICON_STYLE} className="text-center px-0">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground/40 mx-auto" />
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
                <ColumnVisibilityToggle tabKey="projectInfo" editMode={editMode} onToggleEditMode={canEditColumns ? handleToggleEditMode : undefined} onCancelEditMode={canEditColumns ? handleCancelEditMode : undefined} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((p) => (
                <Fragment key={p.id}>
                  <ProjectRow
                    key={p.id}
                    project={p}
                    docCount={docCounts[p.project_id]}
                    docFailed={docFailed.has(p.project_id)}
                    isExpanded={expanded.has(p.project_id)}
                    stageCount={stagesByProject.get(p.project_id)?.length ?? 0}
                    onToggleExpand={toggleExpand}
                    isVisible={v}
                    renderKeys={renderKeys}
                    save={save}
                    saveCurrency={saveCurrency}
                    canEdit={canEdit}
                    statusLabels={statusLabels}
                    customColumns={customColumns}
                    saveCustomField={handleSaveCustomField}
                    riskHighlight={riskHighlight}
                    onEditProject={handleEditProject}
                    isFieldReadOnly={isFieldReadOnly}
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
                      saveCurrency={saveCurrency}
                      parentMatchesSearch={!!searchLower && [p.project_id, p.project_name, p.klient, p.pm].some(v => normalizedIncludes(v, searchLower))}
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
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>Nový projekt</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <Label>Project ID <span className="text-[hsl(var(--accent))]">*</span></Label>
              <Input
                value={newProj.project_id}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewProj((p) => ({ ...p, project_id: val }));
                  if (val.length >= 2) checkProjectId(val);
                  else resetIdCheck();
                }}
                className={idExists ? "border-destructive" : ""}
              />
              {idExists && <p className="text-destructive text-xs mt-1">Toto ID již existuje</p>}
            </div>
            <div>
              <Label>Project Name <span className="text-[hsl(var(--accent))]">*</span></Label>
              <Input value={newProj.project_name} onChange={(e) => setNewProj((p) => ({ ...p, project_name: e.target.value }))} />
            </div>
            <div>
              <Label>Klient</Label>
              <Input value={newProj.klient} onChange={(e) => setNewProj((p) => ({ ...p, klient: e.target.value }))} />
            </div>
            <div>
              <Label>PM</Label>
              <PeopleSelectDropdown value={newProj.pm} onValueChange={(val) => setNewProj((p) => ({ ...p, pm: val }))} role="PM" />
            </div>
            <div>
              <Label>Konstruktér</Label>
              <PeopleSelectDropdown value={newProj.konstrukter} onValueChange={(val) => setNewProj((p) => ({ ...p, konstrukter: val }))} role="Konstruktér" />
            </div>
            <div>
              <Label>Kalkulant</Label>
              <PeopleSelectDropdown value={newProj.kalkulant} onValueChange={(val) => setNewProj((p) => ({ ...p, kalkulant: val }))} role="Kalkulant" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={newProj.status} onValueChange={(val) => setNewProj((p) => ({ ...p, status: val }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusLabels.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Datum smluvní</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newProj.datum_smluvni && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newProj.datum_smluvni ? formatAppDate(parseAppDate(newProj.datum_smluvni)!) : "Vyberte datum"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[99999]" align="start">
                  <Calendar mode="single" selected={newProj.datum_smluvni ? parseAppDate(newProj.datum_smluvni) : undefined} defaultMonth={newProj.datum_smluvni ? parseAppDate(newProj.datum_smluvni) ?? undefined : undefined} onSelect={(date) => { if (date) { const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, "0"); const d = String(date.getDate()).padStart(2, "0"); setNewProj((p) => ({ ...p, datum_smluvni: `${y}-${m}-${d}` })); } }} className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              {datumWarning && <p className="text-[hsl(var(--accent))] text-xs mt-1">Datum smluvní není vyplněn. Klikněte znovu pro uložení bez data.</p>}
            </div>
            <div>
              <Label>Prodejní cena</Label>
              <Input type="number" value={newProj.prodejni_cena} onChange={(e) => setNewProj((p) => ({ ...p, prodejni_cena: e.target.value }))} />
            </div>
            <div>
              <Label>Měna</Label>
              <Select value={newProj.currency} onValueChange={(val) => setNewProj((p) => ({ ...p, currency: val }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CZK">CZK</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Marže (%)</Label>
              <div className="flex items-center gap-1">
                <Input type="number" className="no-spinners" value={newProj.marze} onChange={(e) => setNewProj((p) => ({ ...p, marze: e.target.value }))} placeholder="0" />
                <span className="text-sm text-muted-foreground shrink-0">%</span>
              </div>
            </div>
            <div>
              <Label>Fakturace</Label>
              <Input value={newProj.fakturace} onChange={(e) => setNewProj((p) => ({ ...p, fakturace: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setAddOpen(false); setDatumWarning(false); resetIdCheck(); }}>Zrušit</Button>
            <Button onClick={handleAddProject} disabled={!newProj.project_id || !newProj.project_name || idExists}>Vytvořit projekt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editProject && <ProjectDetailDialog project={editProject} open={!!editProject} onOpenChange={(open) => { if (!open) setEditProject(null); }} onOpenTPVList={handleOpenTPVList} tpvItemCount={tpvItemsByProject.get(editProject.project_id)?.length ?? 0} />}
    </div>
  );
}
