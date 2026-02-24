import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from "@/components/ui/table";
import { RiskBadge, ProgressBar } from "./StatusBadge";
import { InlineEditableCell } from "./InlineEditableCell";
import { SortableHeader } from "./SortableHeader";
import { useProjects } from "@/hooks/useProjects";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { useSortFilter } from "@/hooks/useSortFilter";
import { ChevronRight } from "lucide-react";
import { ColumnVisibilityToggle } from "./ColumnVisibilityToggle";
import { useTPVItems } from "@/hooks/useTPVItems";
import { TPVItemsView } from "./TPVItemsView";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { getProjectRiskColor } from "@/hooks/useRiskHighlight";
import { useAllColumnVisibility, TPV_NATIVE, ALL_COLUMNS } from "./ColumnVisibilityContext";
import { getColumnStyle, renderColumnHeader, renderColumnCell } from "./CrossTabColumns";

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
}

export function TPVStatusTable({ personFilter, statusFilter, search: externalSearch, riskHighlight }: TPVStatusTableProps) {
  const { data: projects = [], isLoading } = useProjects();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const statusLabels = statusOptions.map((s) => s.label);
  const updateProject = useUpdateProject();
  const { sorted, sortCol, sortDir, toggleSort } = useSortFilter(projects, { personFilter, statusFilter }, externalSearch);
  const { tpvStatus: { isVisible } } = useAllColumnVisibility();
  const { getLabel, getWidth, updateLabel, updateWidth, getOrderedKeys } = useColumnLabels("tpv-status");
  const [editMode, setEditMode] = useState(false);
  const { canEdit, canEditColumns } = useAuth();
  const [activeProject, setActiveProject] = useState<{ projectId: string; projectName: string } | null>(null);

  const orderedNativeKeys = useMemo(() => getOrderedKeys(TPV_NATIVE), [getOrderedKeys]);
  const orderedAllKeys = useMemo(() => getOrderedKeys(ALL_KEYS), [getOrderedKeys]);

  const save = (id: string, field: string, value: string, oldValue: string) => {
    updateProject.mutate({ id, field, value, oldValue });
  };

  if (activeProject) {
    return (
      <TPVItemsView
        projectId={activeProject.projectId}
        projectName={activeProject.projectName}
        onBack={() => setActiveProject(null)}
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
  });

  const visibleNative = orderedNativeKeys.filter((k) => v(k));
  const visibleCross = orderedAllKeys.filter((k) => !NATIVE_KEYS.includes(k) && v(k));

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
              <TableHead style={{ minWidth: 32, width: 32 }} className="shrink-0"></TableHead>
              {v("project_id") && renderColumnHeader(headerProps("project_id"))}
              {v("project_name") && renderColumnHeader(headerProps("project_name"))}
              {visibleNative.map((key) => renderColumnHeader(headerProps(key)))}
              {visibleCross.map((key) => renderColumnHeader(headerProps(key)))}
              <ColumnVisibilityToggle tabKey="tpvStatus" editMode={editMode} onToggleEditMode={canEditColumns ? () => setEditMode(!editMode) : undefined} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <TableRow key={p.id} className="hover:bg-muted/50 transition-colors h-9" style={(() => { const c = riskHighlight ? getProjectRiskColor(p, riskHighlight) : null; return c ? { backgroundColor: c } : {}; })()}>
                <TableCell
                  className="w-[32px] cursor-pointer"
                  onClick={() => setActiveProject({ projectId: p.project_id, projectName: p.project_name })}
                >
                  <ExpandArrow projectId={p.project_id} />
                </TableCell>
                {v("project_id") && <TableCell className="font-mono text-xs truncate" title={p.project_id}>{p.project_id}</TableCell>}
                {v("project_name") && <TableCell><InlineEditableCell value={p.project_name} onSave={(val) => save(p.id, "project_name", val, p.project_name)} className="font-medium" readOnly={!canEdit} /></TableCell>}
                {visibleNative.map((key) => renderColumnCell({ colKey: key, project: p, save, canEdit, statusLabels }))}
                {visibleCross.map((key) => renderColumnCell({ colKey: key, project: p, save, canEdit, statusLabels }))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
