/**
 * PerMaterialView — materials grouped by name (case-insensitive).
 *
 * Užitočné pre nákupcu: "ko­ľko MDF dosiek 18mm potrebujem celkom
 * naprieč všetkými projektmi" → bulk-objednávka.
 *
 * Aggregates: total ks, suma podľa stavu, distinct projektov.
 */

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Pencil,
  Truck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { MaterialStav, MaterialView } from "../types";
import { MATERIAL_STAV, STAV_LABEL } from "../types";
import { groupByMaterialName } from "../api";
import { MaterialStatusBadge } from "./MaterialStatusBadge";
import { useBulkUpdateStatus } from "../hooks";
import { formatDateShort } from "../../shared/helpers";

interface PerMaterialViewProps {
  rows: MaterialView[];
  canWrite: boolean;
  onEdit: (id: string) => void;
}

interface MaterialGroupSummary {
  key: string;
  displayName: string;
  totalQty: number;
  unitSet: Set<string>;
  byStav: Record<MaterialStav, number>; // count of rows
  qtyByStav: Record<MaterialStav, number>; // sum of mnozstvo
  projectIds: Set<string>;
  rows: MaterialView[];
}

function summarizeGroups(
  grouped: Map<string, MaterialView[]>
): MaterialGroupSummary[] {
  const out: MaterialGroupSummary[] = [];
  for (const [key, items] of grouped.entries()) {
    let totalQty = 0;
    const unitSet = new Set<string>();
    const byStav: Record<MaterialStav, number> = {
      nezadany: 0,
      objednane: 0,
      caka: 0,
      dodane: 0,
    };
    const qtyByStav: Record<MaterialStav, number> = {
      nezadany: 0,
      objednane: 0,
      caka: 0,
      dodane: 0,
    };
    const projectIds = new Set<string>();
    for (const v of items) {
      const q = v.mnozstvo ?? 0;
      totalQty += q;
      qtyByStav[v.stav] += q;
      byStav[v.stav] += 1;
      if (v.jednotka) unitSet.add(v.jednotka);
      projectIds.add(v.project_id);
    }
    out.push({
      key,
      displayName: items[0]?.nazov ?? key,
      totalQty,
      unitSet,
      byStav,
      qtyByStav,
      projectIds,
      rows: items,
    });
  }
  out.sort((a, b) => b.rows.length - a.rows.length);
  return out;
}

export function PerMaterialView({
  rows,
  canWrite,
  onEdit,
}: PerMaterialViewProps) {
  const grouped = useMemo(() => groupByMaterialName(rows), [rows]);
  const summaries = useMemo(() => summarizeGroups(grouped), [grouped]);

  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStav, setBulkStav] = useState<MaterialStav>("objednane");
  const bulkUpdate = useBulkUpdateStatus();

  function toggleGroup(k: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }
  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }
  async function applyBulk() {
    await bulkUpdate.mutateAsync({
      ids: Array.from(selected),
      stav: bulkStav,
    });
    clearSelection();
  }

  if (summaries.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        Žiadne materiály.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Bulk action bar */}
      {selected.size > 0 && canWrite && (
        <div className="flex items-center gap-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2">
          <Truck className="h-4 w-4 text-primary" />
          <span className="text-sm">
            <span className="font-medium">{selected.size}</span> položiek
            vybraných
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Select
              value={bulkStav}
              onValueChange={(v) => setBulkStav(v as MaterialStav)}
            >
              <SelectTrigger className="w-44 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MATERIAL_STAV.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STAV_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={applyBulk}
              disabled={bulkUpdate.isPending}
            >
              Aplikovať
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              Zrušiť
            </Button>
          </div>
        </div>
      )}

      {summaries.map((s) => {
        const isOpen = openKeys.has(s.key);
        const unitLabel =
          s.unitSet.size === 1 ? Array.from(s.unitSet)[0] : "mix";
        return (
          <div
            key={s.key}
            className="rounded-lg border border-border/60 bg-card/40 overflow-hidden"
          >
            <button
              type="button"
              onClick={() => toggleGroup(s.key)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-left",
                "hover:bg-accent/30 transition-colors"
              )}
            >
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{s.displayName}</div>
                <div className="text-[11px] text-muted-foreground">
                  {s.rows.length} riadkov · {s.projectIds.size} projektov
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="font-mono text-base">
                  {Number.isInteger(s.totalQty) ? s.totalQty : s.totalQty.toFixed(2)}
                </span>
                <span className="text-muted-foreground">{unitLabel}</span>
                <div className="flex flex-wrap items-center gap-1">
                  {(MATERIAL_STAV as readonly MaterialStav[]).map((st) =>
                    s.byStav[st] > 0 ? (
                      <Badge
                        key={st}
                        variant="outline"
                        className={cn(
                          "gap-1 font-normal",
                          st === "dodane"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : st === "objednane"
                              ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                              : st === "caka"
                                ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                                : "border-muted-foreground/30 bg-muted/40 text-muted-foreground"
                        )}
                      >
                        <span className="font-mono">{s.byStav[st]}</span>
                        <span className="text-[10px] uppercase tracking-wide opacity-80">
                          {STAV_LABEL[st]}
                        </span>
                      </Badge>
                    ) : null
                  )}
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border/60 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-muted-foreground text-[11px] uppercase tracking-wide">
                    <tr>
                      {canWrite && <th className="px-3 py-2 w-px" />}
                      <th className="px-3 py-2 text-left">Projekt</th>
                      <th className="px-3 py-2 text-left">Prvok</th>
                      <th className="px-3 py-2 text-right">Množ.</th>
                      <th className="px-3 py-2 text-left">Dodávateľ</th>
                      <th className="px-3 py-2 text-left">Stav</th>
                      <th className="px-3 py-2 text-left">Termíny</th>
                      <th className="px-3 py-2 w-px" />
                    </tr>
                  </thead>
                  <tbody>
                    {s.rows.map((m) => (
                      <tr
                        key={m.id}
                        className="border-t border-border/40 hover:bg-accent/20"
                      >
                        {canWrite && (
                          <td className="px-3 py-2">
                            <Checkbox
                              checked={selected.has(m.id)}
                              onCheckedChange={() => toggleRow(m.id)}
                            />
                          </td>
                        )}
                        <td className="px-3 py-2">
                          <div className="font-medium truncate max-w-[260px]">
                            {m.project?.project_name ?? m.project_id}
                          </div>
                          {m.project?.klient && (
                            <div className="text-[11px] text-muted-foreground truncate max-w-[260px]">
                              {m.project.klient}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {m.tpv_item?.item_code ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {m.mnozstvo ?? "—"}
                          {m.jednotka ? (
                            <span className="text-muted-foreground">
                              {" "}
                              {m.jednotka}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          {m.dodavatel ?? (
                            <span className="text-muted-foreground italic">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <MaterialStatusBadge stav={m.stav} size="sm" />
                        </td>
                        <td className="px-3 py-2 text-[11px] whitespace-nowrap">
                          {m.objednane_dat && (
                            <div>
                              <span className="text-muted-foreground">
                                obj.{" "}
                              </span>
                              {formatDateShort(m.objednane_dat)}
                            </div>
                          )}
                          {m.dodane_dat && (
                            <div>
                              <span className="text-muted-foreground">
                                dod.{" "}
                              </span>
                              {formatDateShort(m.dodane_dat)}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          {canWrite && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => onEdit(m.id)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
