import { useState } from "react";
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from "@/components/ui/table";
import { RiskBadge, ProgressBar } from "./StatusBadge";
import { InlineEditableCell } from "./InlineEditableCell";
import { SortableHeader } from "./SortableHeader";
import { useProjects } from "@/hooks/useProjects";
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
import { useAllColumnVisibility } from "./ColumnVisibilityContext";

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

const DEFAULT_STYLES: Record<string, React.CSSProperties> = {
  project_id: { width: 90, minWidth: 90 },
  project_name: { minWidth: 180 },
  konstrukter: { minWidth: 110 },
  narocnost: { width: 90, minWidth: 85 },
  hodiny_tpv: { width: 90, minWidth: 85 },
  percent_tpv: { width: 110, minWidth: 100 },
  tpv_poznamka: { minWidth: 140 },
};

export function TPVStatusTable({ personFilter, statusFilter, search: externalSearch, riskHighlight }: TPVStatusTableProps) {
  const { data: projects = [], isLoading } = useProjects();
  const updateProject = useUpdateProject();
  const { sorted, sortCol, sortDir, toggleSort } = useSortFilter(projects, { personFilter, statusFilter }, externalSearch);
  const { tpvStatus: { isVisible, columns } } = useAllColumnVisibility();
  const { getLabel, getWidth, updateLabel, updateWidth } = useColumnLabels("tpv-status");
  const [editMode, setEditMode] = useState(false);
  const { canEdit, canEditColumns } = useAuth();

  const [activeProject, setActiveProject] = useState<{ projectId: string; projectName: string } | null>(null);

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
              {v("konstrukter") && <SortableHeader label="Konstruktér" column="konstrukter" {...sh} style={colStyle("konstrukter")} {...editProps("konstrukter", "Konstruktér")} />}
              {v("narocnost") && <SortableHeader label="Náročnost" column="narocnost" {...sh} style={colStyle("narocnost")} {...editProps("narocnost", "Náročnost")} />}
              {v("hodiny_tpv") && <SortableHeader label="Hodiny TPV" column="hodiny_tpv" {...sh} style={colStyle("hodiny_tpv")} {...editProps("hodiny_tpv", "Hodiny TPV")} />}
              {v("percent_tpv") && <SortableHeader label="% Rozpracovanost" column="percent_tpv" {...sh} style={colStyle("percent_tpv")} {...editProps("percent_tpv", "% Rozpracovanost")} />}
              {v("tpv_poznamka") && <SortableHeader label="Poznámka TPV" column="tpv_poznamka" {...sh} style={colStyle("tpv_poznamka")} {...editProps("tpv_poznamka", "Poznámka TPV")} />}
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
                {v("konstrukter") && <TableCell><InlineEditableCell value={p.konstrukter} type="people" peopleRole="Konstruktér" onSave={(val) => save(p.id, "konstrukter", val, p.konstrukter || "")} readOnly={!canEdit} /></TableCell>}
                {v("narocnost") && (
                  <TableCell>
                    <InlineEditableCell value={p.narocnost} type="select" options={["Low", "Medium", "High"]} onSave={(val) => save(p.id, "narocnost", val, p.narocnost || "")} displayValue={<RiskBadge level={p.narocnost || ""} />} readOnly={!canEdit} />
                  </TableCell>
                )}
                {v("hodiny_tpv") && <TableCell><InlineEditableCell value={p.hodiny_tpv} onSave={(val) => save(p.id, "hodiny_tpv", val, p.hodiny_tpv || "")} readOnly={!canEdit} /></TableCell>}
                {v("percent_tpv") && (
                  <TableCell>
                    <InlineEditableCell value={p.percent_tpv} type="number" onSave={(val) => save(p.id, "percent_tpv", val, String(p.percent_tpv ?? ""))} displayValue={<ProgressBar value={p.percent_tpv || 0} />} readOnly={!canEdit} />
                  </TableCell>
                )}
                {v("tpv_poznamka") && <TableCell><InlineEditableCell value={p.tpv_poznamka} type="textarea" onSave={(val) => save(p.id, "tpv_poznamka", val, p.tpv_poznamka || "")} readOnly={!canEdit} /></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
