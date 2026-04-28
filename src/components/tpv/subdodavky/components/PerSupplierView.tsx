/**
 * PerSupplierView — grouped by supplier.
 *
 * Each supplier card shows:
 *   - Supplier header: name, rating, contact info, KPIs (leadtime, on-time, obrat)
 *   - Jobs list: subcontracts where this supplier is dodavatel
 *
 * Subcontracts WITHOUT supplier (still in draft/RFQ pending) are shown
 * separately at the top in an "Unassigned" section.
 */

import { useMemo } from "react";
import { ExternalLink, AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { SubcontractStatusBadge } from "./StatusBadge";
import {
  groupBySupplier,
  formatDateShort,
  formatMoneyCompact,
  computeStatusStrip,
  STRIP_BORDER_CLASSES,
} from "../helpers";
import type { SubcontractView } from "../types";

interface PerSupplierViewProps {
  subcontracts: SubcontractView[];
  onOpenSubcontract: (sub: SubcontractView) => void;
  onOpenSupplier: (supplierId: string) => void;
}

export function PerSupplierView({
  subcontracts,
  onOpenSubcontract,
  onOpenSupplier,
}: PerSupplierViewProps) {
  const grouped = useMemo(() => groupBySupplier(subcontracts), [subcontracts]);
  const unassigned = useMemo(
    () => subcontracts.filter((s) => !s.dodavatel_id),
    [subcontracts]
  );

  if (grouped.size === 0 && unassigned.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <AlertCircle className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">Žiadne subdodávky neboli nájdené.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border rounded-lg">
        <span className="text-sm text-muted-foreground">
          <strong className="text-foreground">
            {grouped.size} aktívnych dodávateľov
          </strong>
          {" · "}
          {subcontracts.length} otvorených subdodávok
          {unassigned.length > 0 && (
            <>
              {" · "}
              <span className="text-amber-600 font-medium">
                {unassigned.length} bez dodávateľa
              </span>
            </>
          )}
        </span>
      </div>

      {/* Unassigned section */}
      {unassigned.length > 0 && (
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
            <div className="text-sm font-semibold text-amber-900">
              Bez prideleného dodávateľa
            </div>
            <div className="text-xs text-amber-700 mt-0.5">
              Tieto subdodávky čakajú na dokončenie RFQ alebo priame zadanie.
            </div>
          </div>
          <div className="divide-y">
            {unassigned.map((sub) => {
              const stripColor = computeStatusStrip(sub);
              return (
                <div
                  key={sub.id}
                  className={cn(
                    "px-4 py-3 hover:bg-muted/40 cursor-pointer flex items-center gap-3",
                    STRIP_BORDER_CLASSES[stripColor]
                  )}
                  onClick={() => onOpenSubcontract(sub)}
                >
                  <div className="font-mono text-xs text-muted-foreground">
                    {sub.project_id}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {sub.nazov}
                    </div>
                    {sub.requests && sub.requests.length > 0 && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        RFQ rozposlané {sub.requests.length} dodávateľom
                      </div>
                    )}
                  </div>
                  <SubcontractStatusBadge stav={sub.stav} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Supplier groups */}
      {Array.from(grouped.values())
        .sort((a, b) => b.items.length - a.items.length)
        .map(({ supplier, items }) => {
          const totalValue = items.reduce(
            (sum, sub) =>
              sum + Number(sub.cena_finalna ?? sub.cena_predpokladana ?? 0),
            0
          );

          return (
            <div
              key={supplier.id}
              className="bg-card border rounded-lg overflow-hidden"
            >
              {/* Supplier header */}
              <div className="px-4 py-3 flex items-start gap-4 border-b bg-muted/20">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onOpenSupplier(supplier.id)}
                      className="font-semibold text-sm hover:underline decoration-dotted underline-offset-2 inline-flex items-center gap-1.5"
                    >
                      {supplier.nazov}
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </button>
                    {supplier.rating != null && (
                      <span
                        className="text-amber-500 text-xs"
                        title={`Rating ${supplier.rating}/5`}
                      >
                        {"★".repeat(supplier.rating)}
                        {"☆".repeat(Math.max(0, 5 - supplier.rating))}
                      </span>
                    )}
                    {supplier.kategorie?.map((kat) => (
                      <Badge key={kat} variant="secondary" className="text-xs">
                        {kat}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                    {supplier.kontakt_telefon && (
                      <span>{supplier.kontakt_telefon}</span>
                    )}
                    {supplier.kontakt_email && (
                      <>
                        <span className="text-muted-foreground/50">·</span>
                        <span>{supplier.kontakt_email}</span>
                      </>
                    )}
                    {supplier.adresa && (
                      <>
                        <span className="text-muted-foreground/50">·</span>
                        <span>{supplier.adresa}</span>
                      </>
                    )}
                    {supplier.ico && (
                      <>
                        <span className="text-muted-foreground/50">·</span>
                        <span>IČO {supplier.ico}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                      Aktívne
                    </div>
                    <div className="text-sm font-bold">
                      {items.length}{" "}
                      {items.length === 1 ? "zákazka" : "zákaziek"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                      Hodnota
                    </div>
                    <div className="text-sm font-bold tabular-nums">
                      {formatMoneyCompact(totalValue)} Kč
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenSupplier(supplier.id)}
                  >
                    CRM
                  </Button>
                </div>
              </div>

              {/* Jobs list */}
              <div className="divide-y">
                {items.map((sub) => (
                  <div
                    key={sub.id}
                    className="px-4 py-2.5 hover:bg-muted/40 cursor-pointer grid grid-cols-[100px_120px_1fr_110px_110px_140px] gap-3 items-center text-sm"
                    onClick={() => onOpenSubcontract(sub)}
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {sub.project_id}
                    </span>
                    <span className="truncate text-xs">
                      {sub.project?.project_name ?? ""}
                    </span>
                    <span className="truncate">{sub.nazov}</span>
                    <span className="text-xs text-muted-foreground">
                      {sub.objednane_dat
                        ? `Obj. ${formatDateShort(sub.objednane_dat)}`
                        : "neobj."}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Návrat {formatDateShort(sub.dodane_dat)}
                    </span>
                    <SubcontractStatusBadge stav={sub.stav} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
