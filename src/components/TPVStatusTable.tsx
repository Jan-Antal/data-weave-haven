import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, RiskBadge, ProgressBar } from "./StatusBadge";
import { useProjects } from "@/hooks/useProjects";

export function TPVStatusTable() {
  const { data: projects = [], isLoading } = useProjects();

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Načítání...</div>;

  return (
    <div className="rounded-lg border bg-card overflow-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-primary/5">
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
              <TableCell className="font-mono text-xs">{p.project_id}</TableCell>
              <TableCell className="font-medium">{p.project_name}</TableCell>
              <TableCell>{p.pm || "—"}</TableCell>
              <TableCell>{p.klient || "—"}</TableCell>
              <TableCell>{p.konstrukter || "—"}</TableCell>
              <TableCell><RiskBadge level={p.narocnost || ""} /></TableCell>
              <TableCell>{p.hodiny_tpv || "—"}</TableCell>
              <TableCell><ProgressBar value={p.percent_tpv || 0} /></TableCell>
              <TableCell>{p.status ? <StatusBadge status={p.status} /> : "—"}</TableCell>
              <TableCell><RiskBadge level={p.tpv_risk || ""} /></TableCell>
              <TableCell>{p.zamereni || "—"}</TableCell>
              <TableCell>{p.datum_tpv || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
