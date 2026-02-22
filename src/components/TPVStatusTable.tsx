import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, RiskBadge, ProgressBar } from "./StatusBadge";
import { tpvStatusData } from "@/data/projects";

export function TPVStatusTable() {
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
          {tpvStatusData.map((p, i) => (
            <TableRow key={i} className="hover:bg-muted/50 transition-colors">
              <TableCell className="font-mono text-xs">{p.projectId}</TableCell>
              <TableCell className="font-medium">{p.projectName}</TableCell>
              <TableCell>{p.pm || "—"}</TableCell>
              <TableCell>{p.klient}</TableCell>
              <TableCell>{p.konstrukter || "—"}</TableCell>
              <TableCell><RiskBadge level={p.narocnost} /></TableCell>
              <TableCell>{p.hodinyTPV || "—"}</TableCell>
              <TableCell><ProgressBar value={p.percentStatus} /></TableCell>
              <TableCell>{p.status ? <StatusBadge status={p.status} /> : "—"}</TableCell>
              <TableCell><RiskBadge level={p.riskLevel} /></TableCell>
              <TableCell>{p.datumZamereni || "—"}</TableCell>
              <TableCell>{p.datumTPV || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
