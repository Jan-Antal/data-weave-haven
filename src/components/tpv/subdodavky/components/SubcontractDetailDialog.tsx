/**
 * SubcontractDetailDialog — view & edit single subcontract.
 *
 * Sections:
 *   1. Header: nazov, project, supplier, stav badge
 *   2. Quick info grid: type, qty, dates, prices
 *   3. RFQ section (if any requests exist): list of bids + "Open compare" button
 *   4. Actions: edit / mark ordered / mark delivered / cancel / delete
 *
 * For full editing, this dialog provides inline patches for common fields.
 * Bigger edits would happen in a separate edit form (out of scope for v1).
 */

import { useState } from "react";
import {
  Edit2,
  Send,
  PackageCheck,
  PackageOpen,
  Trash2,
  Trophy,
  ExternalLink,
  History as HistoryIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import {
  SubcontractStatusBadge,
  RequestStatusBadge,
  TypePill,
} from "./StatusBadge";
import { QuoteCompareDialog, EnterQuoteDialog } from "./QuoteCompareDialog";
import { AuditTrail } from "../../shared";
import {
  useUpdateSubcontract,
  useDeleteSubcontract,
  useCreateRFQRequests,
} from "../hooks";
import { useSubcontractAuditTrail } from "../../shared";
import {
  formatMoney,
  formatDateLong,
  classifyType,
  STAV_LABELS,
  REQUEST_STAV_LABELS,
} from "../helpers";
import type {
  SubcontractView,
  SubcontractPermissions,
  SubcontractRequestView,
  SubcontractStav,
  RequestStav,
} from "../types";
import { SUBCONTRACT_STAV, REQUEST_STAV } from "../types";
import { SuppliersMultiPicker } from "./SupplierPicker";

interface SubcontractDetailDialogProps {
  subcontract: SubcontractView;
  permissions: SubcontractPermissions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSupplier?: (supplierId: string) => void;
}

export function SubcontractDetailDialog({
  subcontract,
  permissions,
  open,
  onOpenChange,
  onOpenSupplier,
}: SubcontractDetailDialogProps) {
  const [showQuotes, setShowQuotes] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [enterQuoteFor, setEnterQuoteFor] =
    useState<SubcontractRequestView | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAddRFQ, setShowAddRFQ] = useState(false);

  const update = useUpdateSubcontract();
  const del = useDeleteSubcontract();

  const { data: auditEntries = [], isLoading: auditLoading } =
    useSubcontractAuditTrail(showHistory ? subcontract.id : undefined);

  const type = classifyType(subcontract);

  const handleMarkOrdered = () => {
    update.mutate({
      id: subcontract.id,
      patch: {
        stav: SUBCONTRACT_STAV.OBJEDNANE,
        objednane_dat: new Date().toISOString().slice(0, 10),
      },
    });
  };

  const handleMarkDelivered = () => {
    update.mutate({
      id: subcontract.id,
      patch: {
        stav: SUBCONTRACT_STAV.DODANE,
        dodane_dat: new Date().toISOString().slice(0, 10),
      },
    });
  };

  const handleCancel = () => {
    update.mutate({
      id: subcontract.id,
      patch: { stav: SUBCONTRACT_STAV.ZRUSENO },
    });
  };

  const handleDelete = async () => {
    try {
      await del.mutateAsync(subcontract.id);
      onOpenChange(false);
    } catch {
      // toast in hook
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="text-lg flex items-center gap-3">
                  <TypePill type={type} />
                  <span>{subcontract.nazov}</span>
                </DialogTitle>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                  <span className="font-mono text-xs">{subcontract.project_id}</span>
                  {subcontract.project?.project_name && (
                    <>
                      <span className="text-muted-foreground/50">·</span>
                      <span>{subcontract.project.project_name}</span>
                    </>
                  )}
                  {subcontract.tpv_item && (
                    <>
                      <span className="text-muted-foreground/50">·</span>
                      <span className="font-mono text-xs">
                        {subcontract.tpv_item.item_code}
                      </span>
                    </>
                  )}
                  <SubcontractStatusBadge stav={subcontract.stav} className="ml-1" />
                </div>
              </div>
              <Button
                variant={showHistory ? "default" : "outline"}
                size="sm"
                onClick={() => setShowHistory((v) => !v)}
                title="Zobraziť históriu zmien"
              >
                <HistoryIcon className="h-4 w-4 mr-1" />
                História
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0 space-y-5">
            {showHistory ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  História všetkých zmien tejto subdodávky a jej RFQ ponúk.
                </p>
                <AuditTrail
                  entries={auditEntries}
                  isLoading={auditLoading}
                  emptyMessage="Žiadne záznamy v histórii — subdodávka ešte nebola upravená po vytvorení."
                  valueFormatter={(key, value) => {
                    if (key === "stav" && typeof value === "string") {
                      return (
                        STAV_LABELS[value as SubcontractStav] ??
                        REQUEST_STAV_LABELS[value as RequestStav] ??
                        undefined
                      );
                    }
                    return undefined;
                  }}
                />
              </div>
            ) : (
              <>
            {/* Description */}
            {subcontract.popis && (
              <div className="text-sm whitespace-pre-wrap">
                {subcontract.popis}
              </div>
            )}

            {/* Quick info grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InfoCard label="Množstvo">
                {subcontract.mnozstvo
                  ? `${subcontract.mnozstvo} ${subcontract.jednotka ?? ""}`
                  : "—"}
              </InfoCard>
              <InfoCard label="Plánovaná cena">
                {formatMoney(subcontract.cena_predpokladana, subcontract.mena)}
              </InfoCard>
              <InfoCard label="Finálna cena">
                {subcontract.cena_finalna != null ? (
                  <span className="font-semibold">
                    {formatMoney(subcontract.cena_finalna, subcontract.mena)}
                  </span>
                ) : (
                  "—"
                )}
              </InfoCard>
              <InfoCard label="Typ spolupráce">
                <span className="inline-flex items-center gap-1.5">
                  <TypePill type={type} />
                  {type === "A" ? "Free-issue" : "Buy-finished"}
                </span>
              </InfoCard>
              <InfoCard label="Odoslané">
                {formatDateLong(subcontract.objednane_dat)}
              </InfoCard>
              <InfoCard label="Návrat plánovaný">
                {formatDateLong(subcontract.dodane_dat)}
              </InfoCard>
              <InfoCard label="Vytvorené">
                {formatDateLong(subcontract.created_at)}
              </InfoCard>
              <InfoCard label="Aktualizované">
                {formatDateLong(subcontract.updated_at)}
              </InfoCard>
            </div>

            {/* Supplier */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Dodávateľ
              </Label>
              {subcontract.supplier ? (
                <div className="border rounded-lg p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenSupplier?.(subcontract.supplier!.id)
                      }
                      className="font-semibold hover:underline decoration-dotted underline-offset-2 inline-flex items-center gap-1.5"
                    >
                      {subcontract.supplier.nazov}
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                      {subcontract.supplier.kontakt_telefon && (
                        <span>{subcontract.supplier.kontakt_telefon}</span>
                      )}
                      {subcontract.supplier.kontakt_email && (
                        <>
                          <span className="text-muted-foreground/50">·</span>
                          <span>{subcontract.supplier.kontakt_email}</span>
                        </>
                      )}
                    </div>
                    {subcontract.supplier.kategorie?.length ? (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {subcontract.supplier.kategorie.map((k) => (
                          <Badge
                            key={k}
                            variant="secondary"
                            className="text-xs"
                          >
                            {k}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="border border-dashed rounded-lg p-4 text-sm text-muted-foreground flex items-center justify-between">
                  <span>
                    {subcontract.stav === SUBCONTRACT_STAV.RFQ
                      ? "Dopyt rozposlaný — čakáme na ponuky"
                      : "Bez prideleného dodávateľa"}
                  </span>
                  {permissions.canSendRFQ &&
                    subcontract.stav === SUBCONTRACT_STAV.NAVRH && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAddRFQ(true)}
                      >
                        <Send className="h-3.5 w-3.5 mr-1" />
                        Rozposlať RFQ
                      </Button>
                    )}
                </div>
              )}
            </div>

            {/* RFQ section */}
            {subcontract.requests && subcontract.requests.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    RFQ ponuky ({subcontract.requests.length})
                  </Label>
                  <div className="flex gap-2">
                    {permissions.canSendRFQ && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAddRFQ(true)}
                      >
                        + Ďalší dodávateľ
                      </Button>
                    )}
                    {permissions.canAwardRFQ &&
                      subcontract.requests.some(
                        (r) => r.stav === REQUEST_STAV.RECEIVED
                      ) && (
                        <Button
                          size="sm"
                          onClick={() => setShowQuotes(true)}
                        >
                          <Trophy className="h-3.5 w-3.5 mr-1" />
                          Porovnať & vybrať
                        </Button>
                      )}
                  </div>
                </div>
                <div className="border rounded-lg divide-y">
                  {subcontract.requests.map((req) => (
                    <RFQRow
                      key={req.id}
                      request={req}
                      canEdit={permissions.canEdit}
                      onEnterQuote={() => setEnterQuoteFor(req)}
                    />
                  ))}
                </div>
              </div>
            )}
              </>
            )}
          </div>

          {/* Footer actions */}
          <DialogFooter className="px-6 py-3 border-t bg-muted/30 shrink-0 flex-row justify-between sm:justify-between flex-wrap gap-2">
            <div className="flex gap-2">
              {permissions.canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Odstrániť
                </Button>
              )}
            </div>
            <div className="flex gap-2 flex-wrap justify-end">
              {permissions.canEdit &&
                subcontract.stav !== SUBCONTRACT_STAV.ZRUSENO &&
                subcontract.stav !== SUBCONTRACT_STAV.DODANE && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    disabled={update.isPending}
                  >
                    Zrušiť subdodávku
                  </Button>
                )}
              {permissions.canEdit &&
                subcontract.stav === SUBCONTRACT_STAV.PONUKA && (
                  <Button
                    onClick={handleMarkOrdered}
                    disabled={update.isPending}
                    size="sm"
                  >
                    <Send className="h-4 w-4 mr-1" />
                    Označiť ako objednané
                  </Button>
                )}
              {permissions.canEdit &&
                subcontract.stav === SUBCONTRACT_STAV.OBJEDNANE && (
                  <Button
                    onClick={handleMarkDelivered}
                    disabled={update.isPending}
                    size="sm"
                  >
                    <PackageCheck className="h-4 w-4 mr-1" />
                    Označiť ako dodané
                  </Button>
                )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sub-dialogs */}
      {showQuotes && (
        <QuoteCompareDialog
          subcontract={subcontract}
          open={showQuotes}
          onOpenChange={setShowQuotes}
        />
      )}

      {enterQuoteFor && (
        <EnterQuoteDialog
          request={enterQuoteFor}
          open={!!enterQuoteFor}
          onOpenChange={(o) => !o && setEnterQuoteFor(null)}
        />
      )}

      {showAddRFQ && (
        <AddRFQDialog
          subcontractId={subcontract.id}
          existingSupplierIds={
            subcontract.requests?.map((r) => r.supplier_id) ?? []
          }
          open={showAddRFQ}
          onOpenChange={setShowAddRFQ}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          onConfirm={handleDelete}
          isPending={del.isPending}
          subcontractName={subcontract.nazov}
        />
      )}
    </>
  );
}

// ============================================================
// SMALL HELPERS
// ============================================================

function InfoCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="text-sm font-medium mt-1">{children}</div>
    </div>
  );
}

function RFQRow({
  request,
  canEdit,
  onEnterQuote,
}: {
  request: SubcontractRequestView;
  canEdit: boolean;
  onEnterQuote: () => void;
}) {
  return (
    <div className="px-4 py-3 grid grid-cols-[1fr_120px_120px_140px_100px] gap-3 items-center text-sm">
      <div>
        <div className="font-medium">{request.supplier.nazov}</div>
        {request.poznamka && (
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {request.poznamka}
          </div>
        )}
      </div>
      <div className="text-right tabular-nums">
        {request.cena_nabidka != null
          ? formatMoney(request.cena_nabidka, request.mena ?? "CZK")
          : "—"}
      </div>
      <div className="text-xs text-muted-foreground">
        {request.termin_dodani
          ? `do ${formatDateLong(request.termin_dodani)}`
          : "—"}
      </div>
      <RequestStatusBadge stav={request.stav} />
      <div>
        {canEdit && request.stav === REQUEST_STAV.SENT && (
          <Button size="sm" variant="outline" onClick={onEnterQuote}>
            <Edit2 className="h-3 w-3 mr-1" />
            Zadať ponuku
          </Button>
        )}
        {canEdit && request.stav === REQUEST_STAV.RECEIVED && (
          <Button size="sm" variant="ghost" onClick={onEnterQuote}>
            Upraviť
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ADD RFQ — quick dialog to send RFQ to additional suppliers
// ============================================================

function AddRFQDialog({
  subcontractId,
  existingSupplierIds,
  open,
  onOpenChange,
}: {
  subcontractId: string;
  existingSupplierIds: string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [poznamka, setPoznamka] = useState("");
  const create = useCreateRFQRequests();

  const filtered = selected.filter((id) => !existingSupplierIds.includes(id));

  const submit = async () => {
    if (filtered.length === 0) return;
    try {
      await create.mutateAsync({
        subcontract_id: subcontractId,
        supplier_ids: filtered,
        poznamka: poznamka.trim() || undefined,
      });
      onOpenChange(false);
    } catch {
      // toast in hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pridať dodávateľov k RFQ</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Dodávatelia</Label>
            <SuppliersMultiPicker
              values={selected}
              onChange={setSelected}
            />
            {filtered.length < selected.length && (
              <p className="text-xs text-amber-600">
                {selected.length - filtered.length} dodávateľov už dostalo RFQ —
                budú vynechaní.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Poznámka (voliteľné)</Label>
            <Input
              value={poznamka}
              onChange={(e) => setPoznamka(e.target.value)}
              placeholder="Špeciálne požiadavky, urgentnosť…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušiť
          </Button>
          <Button
            onClick={submit}
            disabled={filtered.length === 0 || create.isPending}
          >
            {create.isPending
              ? "Odosielam…"
              : `Rozposlať (${filtered.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// CONFIRM DELETE
// ============================================================

function ConfirmDeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  subcontractName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
  subcontractName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600 flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Odstrániť subdodávku?
          </DialogTitle>
        </DialogHeader>
        <p className="py-3 text-sm">
          Naozaj chceš odstrániť subdodávku{" "}
          <strong>{subcontractName}</strong>? Táto akcia je nevratná.
          Všetky súvisiace RFQ ponuky budú tiež odstránené.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušiť
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "Odstraňujem…" : "Áno, odstrániť"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
