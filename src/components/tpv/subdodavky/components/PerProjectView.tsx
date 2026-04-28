/**
 * PerProjectView — grouped accordion of subcontracts by project.
 *
 * Each project group shows:
 *   - Header: project code, name, PM, expedice, summary stats
 *   - Body: table of subcontracts with status strip, type pill,
 *           supplier link, dates, price, stav, action button
 *
 * Click on supplier name → opens Supplier CRM modal (placeholder hook).
 */

import { useMemo, useState } from "react";
import { ChevronDown, AlertCircle } from "lucide-react";

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

import { SubcontractStatusBadge, TypePill } from "./StatusBadge";
import {
  groupByProject,
  computeStatusStrip,
  classifyType,
  formatDateShort,
  formatMoneyCompact,
  STRIP_BORDER_CLASSES,
  daysUntil,
} from "../helpers";
import type { SubcontractView, SubcontractPermissions } from "../types";

interface PerProjectViewProps {
  subcontracts: SubcontractView[];
  permissions: SubcontractPermissions;
  onOpenSubcontract: (sub: SubcontractView) => void;
  onOpenSupplier: (supplierId: string) => void;
  onSendRFQ: (sub: SubcontractView) => void;
  onMarkOrdered: (sub: SubcontractView) => void;
  onMarkDelivered: (sub: SubcontractView) => void;
}

export function PerProjectView({
  subcontracts,
  permissions,
  onOpenSubcontract,
  onOpenSupplier,
  onSendRFQ,
  onMarkOrdered,
  onMarkDelivered,
}: PerProjectViewProps) {
  const groups = useMemo(() => groupByProject(subcontracts), [subcontracts]);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(groups.slice(0, 3).map((g) => g.project.project_id)) // first 3 expanded
  );

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <AlertCircle className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">
          Žiadne subdodávky neboli nájdené pre zvolený filter.
        </p>
      </div>
    );
  }

  const toggle = (projectId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const expandAll = () =>
    setExpanded(new Set(groups.map((g) => g.project.project_id)));
  const collapseAll = () => setExpanded(new Set());

  return (
    <div className="space-y-3">
      {/* Toolbar — summary + bulk expand/collapse */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border rounded-lg">
        <span className="text-sm text-muted-foreground">
          <strong className="text-foreground">{groups.length} projektov</strong>{" "}
          s otvorenými subdodávkami · {subcontracts.length} operácií celkom
        </span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={expandAll}>
          Rozbaliť všetko
        </Button>
        <Button variant="ghost" size="sm" onClick={collapseAll}>
          Zbaliť všetko
        </Button>
      </div>

      {/* Project groups */}
      {groups.map((group) => {
        const isOpen = expanded.has(group.project.project_id);
        const overdueCount = group.subcontracts.filter((s) => {
          const days = daysUntil(s.dodane_dat);
          return days != null && days < 0 && s.stav !== "dodane";
        }).length;

        return (
          <div
            key={group.project.project_id}
            className="bg-card border rounded-lg overflow-hidden"
          >
            {/* Group header */}
            <button
              type="button"
              onClick={() => toggle(group.project.project_id)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform shrink-0",
                  !isOpen && "-rotate-90"
                )}
              />
              <span className="font-mono text-xs font-semibold text-muted-foreground">
                {group.project.project_id}
              </span>
              <span className="font-semibold text-sm">
                {group.project.project_name ?? "(bez názvu)"}
              </span>
              {group.project.pm && (
                <span className="text-xs text-muted-foreground">
                  · PM: {group.project.pm}
                </span>
              )}

              <div className="flex-1" />

              <div className="flex items-center gap-3 text-xs">
                {overdueCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-red-600 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {overdueCount} po termíne
                  </span>
                )}
                <span className="text-muted-foreground">
                  {group.subcontracts.length}{" "}
                  {group.subcontracts.length === 1 ? "subdodávka" : "subdodávok"}
                </span>
                <span className="text-muted-foreground">
                  {formatMoneyCompact(group.total_predpokladana)} Kč
                </span>
              </div>
            </button>

            {/* Group body */}
            {isOpen && (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[35%]">Operácia</TableHead>
                    <TableHead className="w-[60px]">Typ</TableHead>
                    <TableHead className="w-[180px]">Dodávateľ</TableHead>
                    <TableHead className="w-[110px]">Odoslanie</TableHead>
                    <TableHead className="w-[110px]">Návrat plán</TableHead>
                    <TableHead className="w-[110px] text-right">Cena</TableHead>
                    <TableHead className="w-[140px]">Stav</TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.subcontracts.map((sub) => {
                    const stripColor = computeStatusStrip(sub);
                    const type = classifyType(sub);
                    const overdueDelivery =
                      sub.dodane_dat &&
                      new Date(sub.dodane_dat).getTime() < Date.now() &&
                      sub.stav !== "dodane";

                    return (
                      <TableRow
                        key={sub.id}
                        className={cn(
                          "cursor-pointer",
                          STRIP_BORDER_CLASSES[stripColor]
                        )}
                        onClick={() => onOpenSubcontract(sub)}
                      >
                        <TableCell>
                          <div className="font-medium">{sub.nazov}</div>
                          {sub.popis && (
                            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {sub.popis}
                            </div>
                          )}
                          {sub.tpv_item && (
                            <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                              {sub.tpv_item.item_code}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <TypePill type={type} />
                        </TableCell>
                        <TableCell>
                          {sub.supplier ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenSupplier(sub.supplier!.id);
                              }}
                              className="text-left hover:underline decoration-dotted underline-offset-2"
                            >
                              {sub.supplier.nazov}
                            </button>
                          ) : (
                            <span className="text-muted-foreground italic text-xs">
                              {sub.stav === "rfq"
                                ? `RFQ rozposlané (${sub.requests?.length ?? 0})`
                                : "—"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {sub.objednane_dat ? (
                            <span>{formatDateShort(sub.objednane_dat)}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">
                              nezadané
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              overdueDelivery && "text-red-600 font-medium"
                            )}
                          >
                            {formatDateShort(sub.dodane_dat)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {sub.cena_finalna != null
                            ? formatMoneyCompact(sub.cena_finalna)
                            : sub.cena_predpokladana != null
                            ? formatMoneyCompact(sub.cena_predpokladana)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <SubcontractStatusBadge stav={sub.stav} />
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <RowActionButton
                            sub={sub}
                            permissions={permissions}
                            onSendRFQ={onSendRFQ}
                            onMarkOrdered={onMarkOrdered}
                            onMarkDelivered={onMarkDelivered}
                            onOpenDetail={onOpenSubcontract}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Context-sensitive primary action button per row.
 * Shows the most relevant next action based on current stav.
 */
function RowActionButton({
  sub,
  permissions,
  onSendRFQ,
  onMarkOrdered,
  onMarkDelivered,
  onOpenDetail,
}: {
  sub: SubcontractView;
  permissions: SubcontractPermissions;
  onSendRFQ: (sub: SubcontractView) => void;
  onMarkOrdered: (sub: SubcontractView) => void;
  onMarkDelivered: (sub: SubcontractView) => void;
  onOpenDetail: (sub: SubcontractView) => void;
}) {
  if (sub.stav === "navrh" && permissions.canSendRFQ) {
    return (
      <Button size="sm" onClick={() => onSendRFQ(sub)}>
        Rozposlať RFQ
      </Button>
    );
  }

  if (sub.stav === "ponuka" && permissions.canEdit) {
    return (
      <Button size="sm" onClick={() => onMarkOrdered(sub)}>
        Objednať
      </Button>
    );
  }

  if (sub.stav === "objednane" && permissions.canEdit) {
    return (
      <Button size="sm" variant="outline" onClick={() => onMarkDelivered(sub)}>
        Prevziať
      </Button>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={() => onOpenDetail(sub)}>
      Detail
    </Button>
  );
}
