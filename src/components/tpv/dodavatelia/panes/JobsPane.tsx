/**
 * Supplier CRM — Zákazky pane.
 * List of all subcontracts assigned to this supplier (filterable by stav).
 */

import { useState, useMemo } from "react";
import { Loader2, ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useSupplierSubcontracts } from "../hooks";
import { SubcontractStatusBadge } from "../../subdodavky/components/StatusBadge";
import { formatDateShort, formatMoneyCompact } from "../../shared/helpers";
import { STAV_LABELS } from "../../subdodavky/helpers";
import type { SubcontractStav, TpvSubcontractRow } from "../../subdodavky/types";

type Filter = "all" | "active" | "delivered" | "cancelled";

interface JobsPaneProps {
  supplierId: string;
}

export function JobsPane({ supplierId }: JobsPaneProps) {
  const { data: subcontracts = [], isLoading } =
    useSupplierSubcontracts(supplierId);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return subcontracts;
    if (filter === "delivered")
      return subcontracts.filter((s) => s.stav === "dodane");
    if (filter === "cancelled")
      return subcontracts.filter((s) => s.stav === "zruseno");
    // active
    return subcontracts.filter(
      (s) => s.stav !== "dodane" && s.stav !== "zruseno"
    );
  }, [subcontracts, filter]);

  const counts = useMemo(() => {
    const c = { all: subcontracts.length, active: 0, delivered: 0, cancelled: 0 };
    for (const s of subcontracts) {
      if (s.stav === "dodane") c.delivered++;
      else if (s.stav === "zruseno") c.cancelled++;
      else c.active++;
    }
    return c;
  }, [subcontracts]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Načítavam zákazky…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        <FilterChip
          label="Všetky"
          count={counts.all}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <FilterChip
          label="Aktívne"
          count={counts.active}
          active={filter === "active"}
          onClick={() => setFilter("active")}
        />
        <FilterChip
          label="Dodané"
          count={counts.delivered}
          active={filter === "delivered"}
          onClick={() => setFilter("delivered")}
        />
        <FilterChip
          label="Zrušené"
          count={counts.cancelled}
          active={filter === "cancelled"}
          onClick={() => setFilter("cancelled")}
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="border rounded-lg p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {subcontracts.length === 0
              ? "Tento dodávateľ ešte nemá žiadnu zákazku."
              : "Žiadne zákazky nezodpovedajú filtru."}
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[110px]">Projekt</TableHead>
                <TableHead>Operácia</TableHead>
                <TableHead className="w-[100px] text-right">Cena</TableHead>
                <TableHead className="w-[100px]">Odoslané</TableHead>
                <TableHead className="w-[100px]">Návrat</TableHead>
                <TableHead className="w-[140px]">Stav</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">
                    {s.project_id}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{s.nazov}</div>
                    {s.popis && (
                      <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {s.popis}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {s.cena_finalna != null
                      ? formatMoneyCompact(s.cena_finalna)
                      : s.cena_predpokladana != null
                      ? formatMoneyCompact(s.cena_predpokladana)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDateShort(s.objednane_dat)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDateShort(s.dodane_dat)}
                  </TableCell>
                  <TableCell>
                    <SubcontractStatusBadge stav={s.stav} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// FILTER CHIP
// ============================================================

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1 rounded-full text-xs font-medium border inline-flex items-center gap-1.5 transition-colors",
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-background text-foreground border-border hover:bg-muted/50"
      )}
    >
      {label}
      <span
        className={cn(
          "text-[10px] font-bold px-1.5 rounded",
          active ? "bg-background/20" : "bg-muted text-muted-foreground"
        )}
      >
        {count}
      </span>
    </button>
  );
}
