import { useState, Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, RiskBadge, ProgressBar } from "./StatusBadge";
import { InlineEditableCell } from "./InlineEditableCell";
import { useProjects } from "@/hooks/useProjects";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { statusOrder } from "@/data/projects";
import { ChevronRight } from "lucide-react";
import { TPVItemsView } from "./TPVItemsView";

export function TPVStatusTable() {
  const { data: projects = [], isLoading } = useProjects();
  const updateProject = useUpdateProject();
  const [openProject, setOpenProject] = useState<{ project_id: string; project_name: string } | null>(null);

  const save = (id: string, field: string, value: string, oldValue: string) => {
    updateProject.mutate({ id, field, value, oldValue });
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Načítání...</div>;

  if (openProject) {
    return <TPVItemsView projectId={openProject.project_id} projectName={openProject.project_name} onBack={() => setOpenProject(null)} />;
  }

  return (
    <div className="rounded-lg border bg-card overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-primary/5">
            <TableHead className="w-8"></TableHead>
            <TableHead className="font-semibold min-w-[120px]">Project ID</TableHead>
            <TableHead className="font-semibold min-w-[200px]">Project Name</TableHead>
            <TableHead className="font-semibold min-w-[130px]">PM</TableHead>
            <TableHead className="font-semibold min-w-[130px]">Klient</TableHead>
            <TableHead className="font-semibold min-w-[150px]">Konstruktér</TableHead>
            <TableHead className="font-semibold min-w-[90px]">Náročnost</TableHead>
            <TableHead className="font-semibold min-w-[90px]">Hodiny TPV</TableHead>
            <TableHead className="font-semibold min-w-[120px]">% Status</TableHead>
            <TableHead className="font-semibold min-w-[110px]">Status</TableHead>
            <TableHead className="font-semibold min-w-[80px]">Risk</TableHead>
            <TableHead className="font-semibold min-w-[100px]">Zaměření</TableHead>
            <TableHead className="font-semibold min-w-[100px]">Datum TPV</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((p) => (
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
              <TableCell><InlineEditableCell value={p.datum_tpv} onSave={(v) => save(p.id, "datum_tpv", v, p.datum_tpv || "")} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
