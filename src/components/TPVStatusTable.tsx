import { useState } from "react";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { StatusBadge, RiskBadge, ProgressBar } from "./StatusBadge";
import { InlineEditableCell } from "./InlineEditableCell";
import { SortableHeader } from "./SortableHeader";
import { TableSearchBar } from "./TableSearchBar";
import { useProjects } from "@/hooks/useProjects";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { useSortFilter } from "@/hooks/useSortFilter";
import { statusOrder } from "@/data/projects";
import { ChevronRight } from "lucide-react";
import { TPVItemsView } from "./TPVItemsView";
import { TableHeader, TableHead } from "@/components/ui/table";

export function TPVStatusTable() {
  const { data: projects = [], isLoading } = useProjects();
  const updateProject = useUpdateProject();
  const { sorted, search, setSearch, sortCol, sortDir, toggleSort } = useSortFilter(projects);
  const [openProject, setOpenProject] = useState<{ project_id: string; project_name: string } | null>(null);

  const save = (id: string, field: string, value: string, oldValue: string) => {
    updateProject.mutate({ id, field, value, oldValue });
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Načítání...</div>;

  if (openProject) {
    return <TPVItemsView projectId={openProject.project_id} projectName={openProject.project_name} onBack={() => setOpenProject(null)} />;
  }

  const sh = { sortCol, sortDir, onSort: toggleSort };

  return (
    <div>
      <TableSearchBar value={search} onChange={setSearch} />
      <div className="rounded-lg border bg-card overflow-auto always-scrollbar">
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/5">
              <TableHead className="w-8"></TableHead>
              <SortableHeader label="Project ID" column="project_id" {...sh} className="min-w-[120px]" />
              <SortableHeader label="Project Name" column="project_name" {...sh} className="min-w-[200px]" />
              <SortableHeader label="PM" column="pm" {...sh} className="min-w-[130px]" />
              <SortableHeader label="Klient" column="klient" {...sh} className="min-w-[130px]" />
              <SortableHeader label="Konstruktér" column="konstrukter" {...sh} className="min-w-[150px]" />
              <SortableHeader label="Náročnost" column="narocnost" {...sh} className="min-w-[90px]" />
              <SortableHeader label="Hodiny TPV" column="hodiny_tpv" {...sh} className="min-w-[90px]" />
              <SortableHeader label="% Status" column="percent_tpv" {...sh} className="min-w-[120px]" />
              <SortableHeader label="Status" column="status" {...sh} className="min-w-[110px]" />
              <SortableHeader label="Risk" column="tpv_risk" {...sh} className="min-w-[80px]" />
              <SortableHeader label="Zaměření" column="zamereni" {...sh} className="min-w-[100px]" />
              <SortableHeader label="Datum TPV" column="datum_tpv" {...sh} className="min-w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <TableRow key={p.id} className="hover:bg-muted/50 transition-colors">
                <TableCell className="w-8 cursor-pointer" onClick={() => setOpenProject({ project_id: p.project_id, project_name: p.project_name })}>
                  <ChevronRight className="h-4 w-4" />
                </TableCell>
                <TableCell className="font-mono text-xs">{p.project_id}</TableCell>
                <TableCell><InlineEditableCell value={p.project_name} onSave={(v) => save(p.id, "project_name", v, p.project_name)} className="font-medium" /></TableCell>
                <TableCell><InlineEditableCell value={p.pm} onSave={(v) => save(p.id, "pm", v, p.pm || "")} /></TableCell>
                <TableCell><InlineEditableCell value={p.klient} onSave={(v) => save(p.id, "klient", v, p.klient || "")} /></TableCell>
                <TableCell><InlineEditableCell value={p.konstrukter} onSave={(v) => save(p.id, "konstrukter", v, p.konstrukter || "")} /></TableCell>
                <TableCell>
                  <InlineEditableCell value={p.narocnost} type="select" options={["Low", "Medium", "High"]} onSave={(v) => save(p.id, "narocnost", v, p.narocnost || "")} displayValue={<RiskBadge level={p.narocnost || ""} />} />
                </TableCell>
                <TableCell><InlineEditableCell value={p.hodiny_tpv} onSave={(v) => save(p.id, "hodiny_tpv", v, p.hodiny_tpv || "")} /></TableCell>
                <TableCell>
                  <InlineEditableCell value={p.percent_tpv} type="number" onSave={(v) => save(p.id, "percent_tpv", v, String(p.percent_tpv ?? ""))} displayValue={<ProgressBar value={p.percent_tpv || 0} />} />
                </TableCell>
                <TableCell>
                  <InlineEditableCell value={p.status} type="select" options={statusOrder} onSave={(v) => save(p.id, "status", v, p.status || "")} displayValue={p.status ? <StatusBadge status={p.status} /> : "—"} />
                </TableCell>
                <TableCell>
                  <InlineEditableCell value={p.tpv_risk} type="select" options={["Low", "Medium", "High"]} onSave={(v) => save(p.id, "tpv_risk", v, p.tpv_risk || "")} displayValue={<RiskBadge level={p.tpv_risk || ""} />} />
                </TableCell>
                <TableCell><InlineEditableCell value={p.zamereni} onSave={(v) => save(p.id, "zamereni", v, p.zamereni || "")} /></TableCell>
                <TableCell><InlineEditableCell value={p.datum_tpv} type="date" onSave={(v) => save(p.id, "datum_tpv", v, p.datum_tpv || "")} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
