import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./StatusBadge";
import { InlineEditableCell } from "./InlineEditableCell";
import { useProjects } from "@/hooks/useProjects";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { statusOrder } from "@/data/projects";

function formatCurrency(value: number | null, currency: string) {
  if (value === null || value === 0) return "—";
  return new Intl.NumberFormat(currency === "EUR" ? "de-DE" : "cs-CZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function ProjectInfoTable() {
  const { data: projects = [], isLoading } = useProjects();
  const updateProject = useUpdateProject();

  const save = (id: string, field: string, value: string, oldValue: string) => {
    updateProject.mutate({ id, field, value, oldValue });
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Načítání...</div>;

  return (
    <div className="rounded-lg border bg-card overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-primary/5">
            <TableHead className="font-semibold min-w-[120px]">Project ID</TableHead>
            <TableHead className="font-semibold min-w-[200px]">Project Name</TableHead>
            <TableHead className="font-semibold min-w-[130px]">Klient</TableHead>
            <TableHead className="font-semibold min-w-[130px]">PM</TableHead>
            <TableHead className="font-semibold min-w-[130px]">Konstruktér</TableHead>
            <TableHead className="font-semibold min-w-[110px]">Status</TableHead>
            <TableHead className="font-semibold min-w-[100px]">Datum Smluvní</TableHead>
            <TableHead className="font-semibold min-w-[120px] text-right">Prodejní cena</TableHead>
            <TableHead className="font-semibold min-w-[70px] text-right">Marže</TableHead>
            <TableHead className="font-semibold min-w-[80px] text-right">Fakturace</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((p) => (
            <TableRow key={p.id} className="hover:bg-muted/50 transition-colors">
              <TableCell className="font-mono text-xs">{p.project_id}</TableCell>
              <TableCell>
                <InlineEditableCell value={p.project_name} onSave={(v) => save(p.id, "project_name", v, p.project_name)} className="font-medium" />
              </TableCell>
              <TableCell>
                <InlineEditableCell value={p.klient} onSave={(v) => save(p.id, "klient", v, p.klient || "")} />
              </TableCell>
              <TableCell>
                <InlineEditableCell value={p.pm} onSave={(v) => save(p.id, "pm", v, p.pm || "")} />
              </TableCell>
              <TableCell>
                <InlineEditableCell value={p.konstrukter} onSave={(v) => save(p.id, "konstrukter", v, p.konstrukter || "")} />
              </TableCell>
              <TableCell>
                <InlineEditableCell
                  value={p.status}
                  type="select"
                  options={statusOrder}
                  onSave={(v) => save(p.id, "status", v, p.status || "")}
                  displayValue={p.status ? <StatusBadge status={p.status} /> : "—"}
                />
              </TableCell>
              <TableCell>
                <InlineEditableCell value={p.datum_smluvni} onSave={(v) => save(p.id, "datum_smluvni", v, p.datum_smluvni || "")} />
              </TableCell>
              <TableCell className="text-right">
                <InlineEditableCell
                  value={p.prodejni_cena}
                  type="number"
                  onSave={(v) => save(p.id, "prodejni_cena", v, String(p.prodejni_cena ?? ""))}
                  displayValue={<span className="font-mono text-sm">{formatCurrency(p.prodejni_cena, p.currency || "CZK")}</span>}
                />
              </TableCell>
              <TableCell className="text-right">
                <InlineEditableCell value={p.marze} onSave={(v) => save(p.id, "marze", v, p.marze || "")} />
              </TableCell>
              <TableCell className="text-right">
                <InlineEditableCell value={p.fakturace} onSave={(v) => save(p.id, "fakturace", v, p.fakturace || "")} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
