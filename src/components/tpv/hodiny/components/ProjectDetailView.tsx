/**
 * ProjectDetailView — main editor for hours allocation per project.
 *
 * Layout:
 *   header — back button + project info + summary
 *   actions bar — bulk submit / bulk approve (visible based on permissions)
 *   table — one row per tpv_item with editable hodiny_navrh + workflow buttons
 *
 * Workflow logic per row:
 *   draft / virtual:
 *     - kalkulant edits hodiny_navrh inline (debounced upsert)
 *     - "Odoslať PM" button (canSubmitHours)
 *   submitted:
 *     - locked field
 *     - PM sees: Schváliť | Vrátiť (with reason)
 *   approved:
 *     - read-only check icon
 *   returned:
 *     - kalkulant sees return_reason
 *     - kalkulant can edit + re-submit
 */

import { useEffect, useMemo, useState, useRef } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  RotateCcw,
  Send,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDateLong } from "../../shared/helpers";

import {
  useProjectItemsWithAllocations,
  useUpsertAllocation,
  useSubmitAllocation,
  useApproveAllocation,
  useReturnAllocation,
  useBulkSubmit,
  useBulkApprove,
} from "../hooks";
import type { HoursAllocationView } from "../types";
import { HoursStatusBadge } from "./HoursStatusBadge";

interface ProjectDetailViewProps {
  projectId: string;
  onBack: () => void;
  canSubmit: boolean;
  canApprove: boolean;
}

export function ProjectDetailView({
  projectId,
  onBack,
  canSubmit,
  canApprove,
}: ProjectDetailViewProps) {
  const itemsQ = useProjectItemsWithAllocations(projectId);
  const items = itemsQ.data ?? [];

  // Selection for bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Return-reason dialog
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState("");

  // Local edit state (for debounce / unsaved changes)
  const [edits, setEdits] = useState<Record<string, string>>({});

  function handleEdit(itemKey: string, value: string) {
    setEdits((prev) => ({ ...prev, [itemKey]: value }));
  }
  function clearEdit(itemKey: string) {
    setEdits((prev) => {
      const next = { ...prev };
      delete next[itemKey];
      return next;
    });
  }

  function toggleRow(idOrItemId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idOrItemId)) next.delete(idOrItemId);
      else next.add(idOrItemId);
      return next;
    });
  }

  // Project header
  const project = items[0]?.project ?? null;

  // Aggregates
  const totals = useMemo(() => {
    const acc = {
      total: items.length,
      planSum: 0,
      navrhSum: 0,
      approvedSum: 0,
      draft: 0,
      submitted: 0,
      approved: 0,
      returned: 0,
      missing: 0,
    };
    for (const i of items) {
      acc.planSum += i.tpv_item.hodiny_plan ?? 0;
      acc.navrhSum += i.hodiny_navrh ?? 0;
      if (i.stav === "approved") acc.approvedSum += i.hodiny_navrh ?? 0;
      if (i.isVirtual) acc.missing += 1;
      else acc[i.stav] += 1;
    }
    return acc;
  }, [items]);

  // Bulk actions
  const bulkSubmitM = useBulkSubmit();
  const bulkApproveM = useBulkApprove();

  // Selected real ids only (virtual rows can't be bulk-selected)
  const selectedRealIds = useMemo(() => {
    const out: string[] = [];
    for (const i of items) {
      if (!i.isVirtual && selected.has(i.id)) out.push(i.id);
    }
    return out;
  }, [items, selected]);

  const submittableSelectedIds = useMemo(
    () =>
      items
        .filter(
          (i) =>
            !i.isVirtual &&
            selected.has(i.id) &&
            (i.stav === "draft" || i.stav === "returned")
        )
        .map((i) => i.id),
    [items, selected]
  );

  const approvableSelectedIds = useMemo(
    () =>
      items
        .filter(
          (i) => !i.isVirtual && selected.has(i.id) && i.stav === "submitted"
        )
        .map((i) => i.id),
    [items, selected]
  );

  function clearSelection() {
    setSelected(new Set());
  }

  if (itemsQ.isLoading) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        Načítavam prvky projektu...
      </div>
    );
  }

  if (itemsQ.isError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
        <div className="font-semibold text-destructive">Chyba pri načítaní</div>
        <div className="text-sm text-destructive/90 mt-1">
          {itemsQ.error instanceof Error
            ? itemsQ.error.message
            : "Neznáma chyba"}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => itemsQ.refetch()}
        >
          Skúsiť znova
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 mt-0.5"
          onClick={onBack}
          aria-label="Späť"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate">
            {project?.project_name ?? projectId}
          </h2>
          <div className="text-xs text-muted-foreground">
            {project?.klient ? `${project.klient} · ` : ""}
            {project?.pm ? `PM: ${project.pm} · ` : ""}
            {totals.total} prvkov
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex items-center gap-3 text-sm">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              CN
            </div>
            <div className="font-mono tabular-nums font-semibold">
              {totals.planSum > 0 ? totals.planSum : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              návrh
            </div>
            <div className="font-mono tabular-nums font-semibold">
              {totals.navrhSum > 0 ? totals.navrhSum : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              schválené
            </div>
            <div
              className={cn(
                "font-mono tabular-nums font-semibold",
                totals.approvedSum > 0
                  ? "text-emerald-300"
                  : "text-muted-foreground"
              )}
            >
              {totals.approvedSum > 0 ? totals.approvedSum : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedRealIds.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2">
          <span className="text-sm">
            <span className="font-medium">{selectedRealIds.length}</span>{" "}
            vybraných
          </span>
          <div className="ml-auto flex items-center gap-2">
            {canSubmit && submittableSelectedIds.length > 0 && (
              <Button
                size="sm"
                onClick={async () => {
                  await bulkSubmitM.mutateAsync(submittableSelectedIds);
                  clearSelection();
                }}
                disabled={bulkSubmitM.isPending}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Odoslať PM ({submittableSelectedIds.length})
              </Button>
            )}
            {canApprove && approvableSelectedIds.length > 0 && (
              <Button
                size="sm"
                variant="default"
                onClick={async () => {
                  await bulkApproveM.mutateAsync(approvableSelectedIds);
                  clearSelection();
                }}
                disabled={bulkApproveM.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Schváliť ({approvableSelectedIds.length})
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={clearSelection}>
              Zrušiť
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {items.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          Tento projekt nemá žiadne TPV prvky. Pridaj ich v Project Info.
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-[11px] uppercase tracking-wide">
              <tr>
                <th className="px-2 py-2 w-px" />
                <th className="px-3 py-2 text-left">Prvok</th>
                <th className="px-3 py-2 text-right">CN</th>
                <th className="px-3 py-2 text-right">Návrh</th>
                <th className="px-3 py-2 text-right">Δ</th>
                <th className="px-3 py-2 text-left">Stav</th>
                <th className="px-3 py-2 text-left">Workflow</th>
                <th className="px-3 py-2 w-px" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <HoursRow
                  key={item.tpv_item.id}
                  item={item}
                  selected={selected.has(item.id)}
                  onToggleSelect={() => toggleRow(item.id)}
                  edit={edits[item.tpv_item.id]}
                  onEdit={(v) => handleEdit(item.tpv_item.id, v)}
                  onClearEdit={() => clearEdit(item.tpv_item.id)}
                  canSubmit={canSubmit}
                  canApprove={canApprove}
                  onRequestReturn={(id) => {
                    setReturningId(id);
                    setReturnReason("");
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Return-reason dialog */}
      <ReturnDialog
        open={!!returningId}
        onClose={() => setReturningId(null)}
        allocationId={returningId}
        reason={returnReason}
        onReasonChange={setReturnReason}
      />
    </div>
  );
}

// ============================================================
// Row component
// ============================================================

interface HoursRowProps {
  item: HoursAllocationView;
  selected: boolean;
  onToggleSelect: () => void;
  edit: string | undefined;
  onEdit: (v: string) => void;
  onClearEdit: () => void;
  canSubmit: boolean;
  canApprove: boolean;
  onRequestReturn: (id: string) => void;
}

function HoursRow({
  item,
  selected,
  onToggleSelect,
  edit,
  onEdit,
  onClearEdit,
  canSubmit,
  canApprove,
  onRequestReturn,
}: HoursRowProps) {
  const upsert = useUpsertAllocation();
  const submit = useSubmitAllocation();
  const approve = useApproveAllocation();

  const cn_ = item.tpv_item.hodiny_plan ?? null;
  // The "current value" shown — local edit overrides server until saved
  const displayValue =
    edit !== undefined ? edit : item.hodiny_navrh != null ? String(item.hodiny_navrh) : "";

  const isLocked =
    item.stav === "submitted" || item.stav === "approved";
  const lockedForSubmit = !canSubmit;
  const isReturned = item.stav === "returned";

  const editable = !isLocked && (canSubmit || isReturned);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function persistDebounced(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const num = value.trim() ? Number(value.replace(",", ".")) : null;
      if (value.trim() && (!Number.isFinite(num) || (num as number) < 0)) {
        return; // invalid — don't save
      }
      upsert.mutate(
        {
          project_id: item.project_id,
          tpv_item_id: item.tpv_item_id,
          hodiny_navrh: num,
          stav: item.isVirtual ? "draft" : undefined,
        },
        { onSuccess: () => onClearEdit() }
      );
    }, 500);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const numEdit = edit !== undefined ? Number(edit.replace(",", ".")) : NaN;
  const effectiveNavrh = Number.isFinite(numEdit)
    ? numEdit
    : item.hodiny_navrh ?? null;
  const delta =
    effectiveNavrh != null && cn_ != null ? effectiveNavrh - cn_ : null;

  const isSubmittable =
    !item.isVirtual &&
    item.stav !== "submitted" &&
    item.stav !== "approved" &&
    item.hodiny_navrh != null &&
    canSubmit;

  return (
    <>
      <tr className="border-t border-border/40 hover:bg-accent/20 align-top">
        <td className="px-2 py-2">
          {!item.isVirtual && (
            <Checkbox
              checked={selected}
              onCheckedChange={onToggleSelect}
              disabled={item.stav === "approved"}
            />
          )}
        </td>
        <td className="px-3 py-2">
          <div className="font-mono text-xs">{item.tpv_item.item_code}</div>
          <div className="text-sm">{item.tpv_item.nazev ?? "—"}</div>
          {item.tpv_item.popis && (
            <div className="text-[11px] text-muted-foreground line-clamp-1 max-w-md">
              {item.tpv_item.popis}
            </div>
          )}
        </td>

        {/* CN */}
        <td className="px-3 py-2 text-right font-mono tabular-nums">
          {cn_ != null ? cn_ : "—"}
        </td>

        {/* Návrh — editable inline */}
        <td className="px-3 py-2 text-right">
          {editable ? (
            <Input
              value={displayValue}
              onChange={(e) => {
                onEdit(e.target.value);
                persistDebounced(e.target.value);
              }}
              inputMode="decimal"
              placeholder="—"
              className="h-7 w-20 text-right font-mono text-xs ml-auto"
              disabled={lockedForSubmit && !isReturned}
            />
          ) : (
            <span className="font-mono tabular-nums">
              {item.hodiny_navrh != null ? item.hodiny_navrh : "—"}
            </span>
          )}
        </td>

        {/* Δ */}
        <td className="px-3 py-2 text-right font-mono tabular-nums text-xs">
          {delta == null ? (
            "—"
          ) : (
            <span
              className={cn(
                delta > 0
                  ? "text-amber-300"
                  : delta < 0
                    ? "text-emerald-300"
                    : "text-muted-foreground"
              )}
            >
              {delta > 0 ? "+" : ""}
              {delta}
            </span>
          )}
        </td>

        {/* Stav */}
        <td className="px-3 py-2">
          {item.isVirtual ? (
            <Badge
              variant="outline"
              className="gap-1 font-normal border-muted-foreground/30 bg-muted/40 text-muted-foreground"
            >
              chýba
            </Badge>
          ) : (
            <HoursStatusBadge stav={item.stav} size="sm" />
          )}
          {item.submitted_at && (
            <div className="text-[10px] text-muted-foreground mt-1">
              odoslané {formatDateLong(item.submitted_at)}
            </div>
          )}
          {item.approved_at && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              schválené {formatDateLong(item.approved_at)}
            </div>
          )}
          {isReturned && item.return_reason && (
            <div className="text-[10px] text-red-300 mt-1 max-w-[200px]">
              <AlertTriangle className="h-3 w-3 inline mr-0.5" />
              {item.return_reason}
            </div>
          )}
        </td>

        {/* Workflow buttons */}
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {isSubmittable && (
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => submit.mutate({ id: item.id })}
                disabled={submit.isPending}
              >
                <Send className="h-3 w-3 mr-1" />
                Odoslať
              </Button>
            )}
            {item.stav === "submitted" && canApprove && (
              <>
                <Button
                  size="sm"
                  className="h-7 bg-emerald-600 hover:bg-emerald-500"
                  onClick={() => approve.mutate({ id: item.id })}
                  disabled={approve.isPending}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Schváliť
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-red-300 border-red-500/40"
                  onClick={() => onRequestReturn(item.id)}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Vrátiť
                </Button>
              </>
            )}
          </div>
        </td>

        <td className="px-2 py-2 text-right">
          {item.notes && (
            <Badge
              variant="outline"
              className="text-[10px] font-normal"
              title={item.notes}
            >
              <ChevronDown className="h-3 w-3" />
            </Badge>
          )}
        </td>
      </tr>
    </>
  );
}

// ============================================================
// Return-reason Dialog
// ============================================================

interface ReturnDialogProps {
  open: boolean;
  onClose: () => void;
  allocationId: string | null;
  reason: string;
  onReasonChange: (v: string) => void;
}

function ReturnDialog({
  open,
  onClose,
  allocationId,
  reason,
  onReasonChange,
}: ReturnDialogProps) {
  const returnM = useReturnAllocation();

  async function handleConfirm() {
    if (!allocationId || !reason.trim()) return;
    await returnM.mutateAsync({
      id: allocationId,
      return_reason: reason.trim(),
    });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vrátiť kalkulantovi</DialogTitle>
          <DialogDescription>
            Vysvetli prečo nemôžeš schváliť návrh hodín. Kalkulant
            uvidí dôvod a môže návrh upraviť a poslať znova.
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label className="text-xs">Dôvod *</Label>
          <Textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={4}
            placeholder="napr. Hodiny na T05 sú nereálne — uprav podľa skutočnosti."
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={returnM.isPending}
          >
            Zrušiť
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!reason.trim() || returnM.isPending}
            className="bg-red-600 hover:bg-red-500"
          >
            {returnM.isPending ? "Vraciam..." : "Vrátiť"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
