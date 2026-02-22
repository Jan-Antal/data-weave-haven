import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./StatusBadge";
import { projectInfoData } from "@/data/projects";

function formatCurrency(value: number | null, currency: string) {
  if (value === null || value === 0) return "—";
  return new Intl.NumberFormat(currency === "EUR" ? "de-DE" : "cs-CZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function ProjectInfoTable() {
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
          {projectInfoData.map((p) => (
            <TableRow key={p.id} className="hover:bg-muted/50 transition-colors">
              <TableCell className="font-mono text-xs">{p.projectId}</TableCell>
              <TableCell className="font-medium">{p.projectName}</TableCell>
              <TableCell>{p.klient}</TableCell>
              <TableCell>{p.pm}</TableCell>
              <TableCell>{p.konstrukter || "—"}</TableCell>
              <TableCell><StatusBadge status={p.status} /></TableCell>
              <TableCell>{p.datumSmluvni || "—"}</TableCell>
              <TableCell className="text-right font-mono text-sm">{formatCurrency(p.prodejniCena, p.currency)}</TableCell>
              <TableCell className="text-right">{p.marze || "—"}</TableCell>
              <TableCell className="text-right">{p.fakturace || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
