import { useState, Fragment } from "react";
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from "@/components/ui/table";
import { StatusBadge, RiskBadge, ProgressBar } from "./StatusBadge";
import { InlineEditableCell } from "./InlineEditableCell";
import { SortableHeader } from "./SortableHeader";
import { useProjects } from "@/hooks/useProjects";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { useSortFilter } from "@/hooks/useSortFilter";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { ChevronRight } from "lucide-react";
import { useColumnVisibility } from "@/hooks/useColumnVisibility";
import { ColumnVisibilityToggle } from "./ColumnVisibilityToggle";
import { useTPVItems } from "@/hooks/useTPVItems";
import { TPVItemsView } from "./TPVItemsView";

const TPV_COLUMNS = [
  { key: "project_id", label: "Project ID", locked: true },
  { key: "project_name", label: "Project Name", locked: true },
  { key: "pm", label: "PM" },
  { key: "klient", label: "Klient" },
  { key: "konstrukter", label: "Konstruktér" },
  { key: "narocnost", label: "Náročnost" },
  { key: "hodiny_tpv", label: "Hodiny TPV" },
  { key: "percent_tpv", label: "% Status" },
  { key: "status", label: "Status" },
  { key: "tpv_risk", label: "Risk" },
  { key: "zamereni", label: "Zaměření" },
  { key: "expedice", label: "Expedice" },
  { key: "predani", label: "Předání" },
  { key: "tpv_poznamka", label: "Poznámka" },
];

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
}

export function TPVStatusTable({ personFilter, statusFilter, search: externalSearch }: TPVStatusTableProps) {
  const { data: projects = [], isLoading } = useProjects();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const statusLabels = statusOptions.map((s) => s.label);
  const updateProject = useUpdateProject();
  const { sorted, sortCol, sortDir, toggleSort } = useSortFilter(projects, { personFilter, statusFilter }, externalSearch);
  const { isVisible, toggleColumn, columns } = useColumnVisibility("col-vis-tpv-status", TPV_COLUMNS);

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

  return (
    <div>
      <div className="rounded-lg border bg-card overflow-x-scroll always-scrollbar">
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/5">
              <TableHead className="w-8"></TableHead>
              {v("project_id") && <SortableHeader label="Project ID" column="project_id" {...sh} className="min-w-[130px]" />}
              {v("project_name") && <SortableHeader label="Project Name" column="project_name" {...sh} className="min-w-[180px]" />}
              {v("pm") && <SortableHeader label="PM" column="pm" {...sh} className="min-w-[140px]" />}
              {v("klient") && <SortableHeader label="Klient" column="klient" {...sh} className="min-w-[120px]" />}
              {v("konstrukter") && <SortableHeader label="Konstruktér" column="konstrukter" {...sh} className="min-w-[140px]" />}
              {v("narocnost") && <SortableHeader label="Náročnost" column="narocnost" {...sh} className="min-w-[90px]" />}
              {v("hodiny_tpv") && <SortableHeader label="Hodiny TPV" column="hodiny_tpv" {...sh} className="min-w-[90px]" />}
              {v("percent_tpv") && <SortableHeader label="% Status" column="percent_tpv" {...sh} className="min-w-[120px]" />}
              {v("status") && <SortableHeader label="Status" column="status" {...sh} className="min-w-[110px]" />}
              {v("tpv_risk") && <SortableHeader label="Risk" column="tpv_risk" {...sh} className="min-w-[80px]" />}
              {v("zamereni") && <SortableHeader label="Zaměření" column="zamereni" {...sh} className="min-w-[90px]" />}
              {v("expedice") && <SortableHeader label="Expedice" column="expedice" {...sh} className="min-w-[90px]" />}
              {v("predani") && <SortableHeader label="Předání" column="predani" {...sh} className="min-w-[90px]" />}
              {v("tpv_poznamka") && <SortableHeader label="Poznámka" column="tpv_poznamka" {...sh} className="min-w-[175px]" />}
              <ColumnVisibilityToggle columns={columns} isVisible={isVisible} toggleColumn={toggleColumn} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <TableRow key={p.id} className="hover:bg-muted/50 transition-colors h-9">
                <TableCell
                  className="w-8 cursor-pointer"
                  onClick={() => setActiveProject({ projectId: p.project_id, projectName: p.project_name })}
                >
                  <ExpandArrow projectId={p.project_id} />
                </TableCell>
                {v("project_id") && <TableCell className="font-mono text-xs truncate" title={p.project_id}>{p.project_id}</TableCell>}
                {v("project_name") && <TableCell><InlineEditableCell value={p.project_name} onSave={(val) => save(p.id, "project_name", val, p.project_name)} className="font-medium" /></TableCell>}
                {v("pm") && <TableCell><InlineEditableCell value={p.pm} type="people" peopleRole="PM" onSave={(val) => save(p.id, "pm", val, p.pm || "")} /></TableCell>}
                {v("klient") && <TableCell><InlineEditableCell value={p.klient} onSave={(val) => save(p.id, "klient", val, p.klient || "")} /></TableCell>}
                {v("konstrukter") && <TableCell><InlineEditableCell value={p.konstrukter} type="people" peopleRole="Konstruktér" onSave={(val) => save(p.id, "konstrukter", val, p.konstrukter || "")} /></TableCell>}
                {v("narocnost") && (
                  <TableCell>
                    <InlineEditableCell value={p.narocnost} type="select" options={["Low", "Medium", "High"]} onSave={(val) => save(p.id, "narocnost", val, p.narocnost || "")} displayValue={<RiskBadge level={p.narocnost || ""} />} />
                  </TableCell>
                )}
                {v("hodiny_tpv") && <TableCell><InlineEditableCell value={p.hodiny_tpv} onSave={(val) => save(p.id, "hodiny_tpv", val, p.hodiny_tpv || "")} /></TableCell>}
                {v("percent_tpv") && (
                  <TableCell>
                    <InlineEditableCell value={p.percent_tpv} type="number" onSave={(val) => save(p.id, "percent_tpv", val, String(p.percent_tpv ?? ""))} displayValue={<ProgressBar value={p.percent_tpv || 0} />} />
                  </TableCell>
                )}
                {v("status") && (
                  <TableCell>
                    <InlineEditableCell value={p.status} type="select" options={statusLabels} onSave={(val) => save(p.id, "status", val, p.status || "")} displayValue={p.status ? <StatusBadge status={p.status} /> : "—"} />
                  </TableCell>
                )}
                {v("tpv_risk") && (
                  <TableCell>
                    <InlineEditableCell value={p.tpv_risk} type="select" options={["Low", "Medium", "High"]} onSave={(val) => save(p.id, "tpv_risk", val, p.tpv_risk || "")} displayValue={<RiskBadge level={p.tpv_risk || ""} />} />
                  </TableCell>
                )}
                {v("zamereni") && <TableCell><InlineEditableCell value={p.zamereni} type="date" onSave={(val) => save(p.id, "zamereni", val, p.zamereni || "")} /></TableCell>}
                {v("expedice") && <TableCell><InlineEditableCell value={p.expedice} type="date" onSave={(val) => save(p.id, "expedice", val, p.expedice || "")} /></TableCell>}
                {v("predani") && <TableCell><InlineEditableCell value={p.predani} type="date" onSave={(val) => save(p.id, "predani", val, p.predani || "")} /></TableCell>}
                {v("tpv_poznamka") && <TableCell><InlineEditableCell value={p.tpv_poznamka} type="textarea" onSave={(val) => save(p.id, "tpv_poznamka", val, p.tpv_poznamka || "")} /></TableCell>}
                <TableCell className="w-10" />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
