import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, RiskBadge } from "./StatusBadge";
import { useProjects } from "@/hooks/useProjects";

export function PMStatusTable() {
  const { data: projects = [], isLoading } = useProjects();

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
            <TableHead className="font-semibold min-w-[110px]">Status</TableHead>
            <TableHead className="font-semibold min-w-[80px]">Risk</TableHead>
            <TableHead className="font-semibold min-w-[100px]">Smluvní</TableHead>
            <TableHead className="font-semibold min-w-[100px]">Zaměření</TableHead>
            <TableHead className="font-semibold min-w-[100px]">TPV</TableHead>
            <TableHead className="font-semibold min-w-[100px]">Expedice</TableHead>
            <TableHead className="font-semibold min-w-[100px]">Předání</TableHead>
            <TableHead className="font-semibold min-w-[200px]">Poznámka</TableHead>
            <TableHead className="font-semibold min-w-[120px] text-right">Prodejní cena</TableHead>
            <TableHead className="font-semibold min-w-[70px] text-right">Marže</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((p) => (
            <TableRow key={p.id} className="hover:bg-muted/50 transition-colors">
              <TableCell className="font-mono text-xs">{p.project_id}</TableCell>
              <TableCell className="font-medium">{p.project_name}</TableCell>
              <TableCell>{p.klient || "—"}</TableCell>
              <TableCell>{p.pm || "—"}</TableCell>
              <TableCell>{p.status ? <StatusBadge status={p.status} /> : "—"}</TableCell>
              <TableCell><RiskBadge level={p.risk || ""} /></TableCell>
              <TableCell>{p.datum_smluvni || "—"}</TableCell>
              <TableCell>{p.zamereni || "—"}</TableCell>
              <TableCell>{p.tpv_date || "—"}</TableCell>
              <TableCell>{p.expedice || "—"}</TableCell>
              <TableCell>{p.predani || "—"}</TableCell>
              <TableCell className="text-xs max-w-[200px] truncate" title={p.pm_poznamka || ""}>{p.pm_poznamka || "—"}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {p.prodejni_cena ? new Intl.NumberFormat("cs-CZ").format(p.prodejni_cena) : "—"}
              </TableCell>
              <TableCell className="text-right">{p.marze || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
