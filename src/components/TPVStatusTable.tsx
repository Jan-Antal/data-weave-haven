import { useState, useMemo, useEffect, useCallback, type MutableRefObject } from "react";
import { useAllCustomColumns, useUpdateCustomField } from "@/hooks/useCustomColumns";
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from "@/components/ui/table";
import { RiskBadge, ProgressBar } from "./StatusBadge";
import { InlineEditableCell } from "./InlineEditableCell";
import { SortableHeader } from "./SortableHeader";
import { useProjects } from "@/hooks/useProjects";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { useSortFilter } from "@/hooks/useSortFilter";
import { ChevronRight, ChevronDown } from "lucide-react";
import { ColumnVisibilityToggle } from "./ColumnVisibilityToggle";
import { useTPVItems } from "@/hooks/useTPVItems";
import { TPVItemsView } from "./TPVItemsView";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { getTPVDashboardRiskColor } from "@/hooks/useRiskHighlight";
import { useAllColumnVisibility, PROJECT_INFO_NATIVE, PM_NATIVE, TPV_NATIVE, ALL_COLUMNS } from "./ColumnVisibilityContext";
import { getColumnStyle, renderColumnHeader, renderColumnCell, getColumnLabel } from "./CrossTabColumns";
import { useHeaderDrag } from "@/hooks/useHeaderDrag";
import { useExportContext } from "./ExportContext";
import { getProjectCellValue } from "@/lib/exportExcel";
import { useProjectHierarchy } from "@/hooks/useProjectHierarchy";

const NATIVE_KEYS = ["project_id", "project_name", ...TPV_NATIVE];
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key);

function ExpandArrow({ projectId }: { projectId: string }) {
  const { data: items = [] } = useTPVItems(projectId);
  const hasItems = items.length > 0;
  return (
    <ChevronRight className={`h-5 w-5 stroke-[3] ${hasItems ? "text-accent fill-accent/20" : "text-muted-foreground/50"}`} />
  );
}

interface TPVStatusTableProps {
  personFilter: string | null;
  statusFilter: string[];
  search: string;
  riskHighlight?: import("@/hooks/useRiskHighlight").RiskHighlightType;
  onRequestTab?: () => void;
  closeDetailRef?: MutableRefObject<(() => void) | null>;
}

export function TPVStatusTable({ personFilter, statusFilter, search: externalSearch, riskHighlight, onRequestTab, closeDetailRef }: TPVStatusTableProps) {
  const { data: projects = [], isLoading } = useProjects();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const statusLabels = statusOptions.map((s) => s.label);
  const updateProject = useUpdateProject();
  const { columns: customColumns } = useAllCustomColumns("projects");
  const updateCustomField = useUpdateCustomField();
  const { sorted, sortCol, sortDir, toggleSort } = useSortFilter(projects, { personFilter, statusFilter }, externalSearch);
  const { tpvStatus: { isVisible } } = useAllColumnVisibility();
  const { getLabel, getWidth, updateLabel, updateWidth, getOrderedKeys, getDisplayOrderedKeys, updateDisplayOrder } = useColumnLabels("tpv-status");
  const [editMode, setEditMode] = useState(false);
  const { canEdit, canEditColumns } = useAuth();
  const { registerExport } = useExportContext();
  const [activeProject, setActiveProject] = useState<{ projectId: string; projectName: string } | null>(null);

  // Hierarchy
  const { hierarchicalRows, toggleExpand, isExpanded } = useProjectHierarchy(
    projects,
    sorted,
    { personFilter: personFilter ?? undefined, statusFilter, search: externalSearch }
  );

  useEffect(() => {
    if (closeDetailRef) {
      closeDetailRef.current = () => setActiveProject(null);
      return () => { closeDetailRef.current = null; };
    }
  }, [closeDetailRef]);

  const orderedNativeKeys = useMemo(() => getOrderedKeys(TPV_NATIVE), [getOrderedKeys]);
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

  useEffect(() => {
    const allExportKeys = ["project_id", "project_name", ...allVisibleKeys];
    registerExport("tpv-status", {
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

  const save = (id: string, field: string, value: string, oldValue: string) => {
    updateProject.mutate({ id, field, value, oldValue });
  };

  if (activeProject) {
    return (
      <TPVItemsView
        projectId={activeProject.projectId}
        projectName={activeProject.projectName}
        onBack={() => {
          setActiveProject(null);
          onRequestTab?.();
        }}
      />
    );
  }

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
              <ColumnVisibilityToggle tabKey="tpvStatus" editMode={editMode} onToggleEditMode={canEditColumns ? handleToggleEditMode : undefined} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {hierarchicalRows.map((hr) => {
              const p = hr.row;
              const tpvHighlight = getTPVDashboardRiskColor(p as any, riskHighlight ?? null);
              const rowStyle: React.CSSProperties = {
                ...(tpvHighlight.bg ? { backgroundColor: tpvHighlight.bg } : {}),
                ...(hr.visibleViaChild ? { opacity: 0.6 } : {}),
              };
              return (
                <TableRow
                  key={`${p.id}${hr.isChild ? '-child' : ''}`}
                  className={cn(
                    "hover:bg-muted/50 transition-colors h-9",
                    hr.isChild && "bg-muted/30 border-l-2 border-l-primary/20"
                  )}
                  style={rowStyle}
                >
                  <TableCell
                    className="w-[32px] cursor-pointer relative"
                    onClick={() => {
                      if (hr.isParent) toggleExpand(p.project_id);
                      else if (!hr.isChild) setActiveProject({ projectId: p.project_id, projectName: p.project_name });
                    }}
                  >
                    {tpvHighlight.dotColor && !hr.isChild && (
                      <span
                        className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full"
                        style={{ width: 6, height: 6, backgroundColor: tpvHighlight.dotColor }}
                      />
                    )}
                    {hr.isParent ? (
                      isExpanded(p.project_id)
                        ? <ChevronDown className="h-5 w-5 stroke-[3] text-accent" />
                        : <ChevronRight className="h-5 w-5 stroke-[3] text-accent fill-accent/20" />
                    ) : !hr.isChild ? (
                      <ExpandArrow projectId={p.project_id} />
                    ) : null}
                  </TableCell>
                  {v("project_id") && (
                    <TableCell className="font-mono text-xs truncate" title={p.project_id}>
                      <span className={hr.isChild ? "pl-4" : ""}>
                        {hr.isChild && <span className="text-muted-foreground mr-1">↳</span>}
                        {p.project_id}
                      </span>
                      {hr.isParent && !isExpanded(p.project_id) && hr.childCount > 0 && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">({hr.childCount})</span>
                      )}
                    </TableCell>
                  )}
                  {v("project_name") && <TableCell style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.project_name}><InlineEditableCell value={p.project_name} onSave={(val) => save(p.id, "project_name", val, p.project_name)} className="font-medium" readOnly={!canEdit} /></TableCell>}
                  {renderKeys.map((key) => renderColumnCell({ colKey: key, project: p, save, canEdit, statusLabels, customColumns, saveCustomField: (rowId, colKey, val, old) => updateCustomField.mutate({ rowId, tableName: "projects", columnKey: colKey, value: val, oldValue: old }) }))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
