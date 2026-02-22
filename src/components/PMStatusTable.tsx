import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, RiskBadge } from "./StatusBadge";
import { pmStatusData } from "@/data/projects";

export function PMStatusTable() {
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
          {pmStatusData.map((p, i) => (
            <TableRow key={i} className="hover:bg-muted/50 transition-colors">
              <TableCell className="font-mono text-xs">{p.projectId}</TableCell>
              <TableCell className="font-medium">{p.projectName}</TableCell>
              <TableCell>{p.klient}</TableCell>
              <TableCell>{p.pm}</TableCell>
              <TableCell><StatusBadge status={p.status} /></TableCell>
              <TableCell><RiskBadge level={p.riskLevel} /></TableCell>
              <TableCell>{p.datumSmluvni || "—"}</TableCell>
              <TableCell>{p.datumZamereni || "—"}</TableCell>
              <TableCell>{p.datumTPV || "—"}</TableCell>
              <TableCell>{p.datumExpedice || "—"}</TableCell>
              <TableCell>{p.datumPredani || "—"}</TableCell>
              <TableCell className="text-xs max-w-[200px] truncate" title={p.poznamka}>{p.poznamka || "—"}</TableCell>
              <TableCell className="text-right font-mono text-sm">
                {p.prodejniCena ? new Intl.NumberFormat("cs-CZ").format(p.prodejniCena) : "—"}
              </TableCell>
              <TableCell className="text-right">{p.marze || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
