/**
 * QuoteCompareDialog — RFQ quote comparison & winner selection.
 *
 * Opens from subcontract detail when stav='rfq_pending' and at least one
 * request has stav='received'. Shows a comparison table with:
 *   - Supplier name + rating + on-time rate
 *   - Quoted price + currency
 *   - Lead time
 *   - Validity (termin_dodani)
 *   - Winner radio + Award button
 *
 * On award: marks chosen request 'awarded', others 'rejected',
 * updates subcontract.dodavatel_id + cena_finalna.
 */

import { useState, useMemo } from "react";
import { Trophy, Clock, Award } from "lucide-react";

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

import { RequestStatusBadge } from "./StatusBadge";
import { useAwardRFQRequest, useUpdateRFQRequest } from "../hooks";
import {
  formatMoney,
  formatDateLong,
  formatMoneyCompact,
} from "../helpers";
import type { SubcontractView, SubcontractRequestView } from "../types";
import { REQUEST_STAV } from "../types";

interface QuoteCompareDialogProps {
  subcontract: SubcontractView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuoteCompareDialog({
  subcontract,
  open,
  onOpenChange,
}: QuoteCompareDialogProps) {
  const requests = subcontract.requests ?? [];
  const receivedRequests = requests.filter(
    (r) => r.stav === REQUEST_STAV.RECEIVED || r.stav === REQUEST_STAV.ACCEPTED
  );

  const [selectedWinnerId, setSelectedWinnerId] = useState<string | null>(
    () => requests.find((r) => r.stav === REQUEST_STAV.ACCEPTED)?.id ?? null
  );

  const award = useAwardRFQRequest();

  const winner = useMemo(
    () => receivedRequests.find((r) => r.id === selectedWinnerId),
    [receivedRequests, selectedWinnerId]
  );

  const lowestPrice = useMemo(() => {
    const prices = receivedRequests
      .map((r) => r.cena_nabidka)
      .filter((p): p is number => p != null);
    return prices.length > 0 ? Math.min(...prices) : null;
  }, [receivedRequests]);

  const handleAward = async () => {
    if (!selectedWinnerId) return;
    try {
      await award.mutateAsync(selectedWinnerId);
      onOpenChange(false);
    } catch {
      // toast in hook
    }
  };

  const budget = subcontract.cena_predpokladana ?? null;
  const winnerPrice = winner?.cena_nabidka ?? null;
  const savings =
    budget != null && winnerPrice != null ? budget - winnerPrice : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Porovnanie ponúk
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{subcontract.nazov}</span>{" "}
            · {subcontract.project_id} · Rozposlané{" "}
            <strong>{requests.length} dodávateľom</strong> ·{" "}
            {receivedRequests.length} odpovedalo
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
          {receivedRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <Clock className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">
                Zatiaľ žiadne ponuky neboli prijaté.
              </p>
              <p className="text-xs mt-1">
                Po doplnení cenovej ponuky dodávateľom sa tu objaví riadok na
                porovnanie.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Vyber dodávateľa s najlepšou ponukou. Po výbere vznikne
                subdodávka s prideleným dodávateľom a ostatné ponuky budú
                označené ako zamietnuté.
              </p>

              <div className="border rounded-lg overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[40px_minmax(0,1fr)_110px_100px_120px_100px] gap-3 px-4 py-2.5 bg-muted/40 border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <div />
                  <div>Dodávateľ</div>
                  <div className="text-right">Cena</div>
                  <div className="text-right">Termín</div>
                  <div>Platné do</div>
                  <div />
                </div>

                {/* Rows */}
                {receivedRequests.map((req) => {
                  const isSelected = req.id === selectedWinnerId;
                  const isLowest =
                    req.cena_nabidka != null &&
                    lowestPrice != null &&
                    req.cena_nabidka === lowestPrice;
                  const isAlreadyAwarded =
                    req.stav === REQUEST_STAV.ACCEPTED;

                  return (
                    <div
                      key={req.id}
                      className={cn(
                        "grid grid-cols-[40px_minmax(0,1fr)_110px_100px_120px_100px] gap-3 px-4 py-3 items-center border-b last:border-b-0 cursor-pointer hover:bg-muted/30 transition-colors",
                        isSelected &&
                          "bg-green-50 hover:bg-green-50 border-l-4 border-l-green-500"
                      )}
                      onClick={() => setSelectedWinnerId(req.id)}
                    >
                      <div>
                        <input
                          type="radio"
                          name="winner"
                          checked={isSelected}
                          onChange={() => setSelectedWinnerId(req.id)}
                          className="accent-green-600"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate flex items-center gap-2">
                          {req.supplier.nazov}
                          {req.supplier.rating != null && (
                            <span className="text-amber-500 text-xs">
                              {"★".repeat(req.supplier.rating)}
                            </span>
                          )}
                          {isLowest && !isAlreadyAwarded && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                              Najnižšia
                            </span>
                          )}
                          {isAlreadyAwarded && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-green-700 bg-green-100 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                              <Award className="h-3 w-3" />
                              Vybraný
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {req.supplier.kategorie?.join(", ")}
                          {req.poznamka && ` · ${req.poznamka}`}
                        </div>
                      </div>
                      <div className="text-right tabular-nums font-semibold">
                        {req.cena_nabidka != null
                          ? formatMoney(req.cena_nabidka, req.mena ?? "CZK")
                          : "—"}
                      </div>
                      <div className="text-right text-sm">
                        {req.termin_dodani
                          ? `do ${formatDateLong(req.termin_dodani)}`
                          : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {req.responded_at
                          ? formatDateLong(req.responded_at)
                          : "—"}
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <RequestStatusBadge stav={req.stav} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pending requests (not yet responded) */}
              {requests.some((r) => r.stav === REQUEST_STAV.SENT) && (
                <div className="mt-4 px-4 py-3 bg-muted/30 rounded-lg border text-xs">
                  <div className="font-semibold text-muted-foreground mb-1.5 uppercase tracking-wide">
                    Čaká sa na odpoveď
                  </div>
                  <div className="space-y-1">
                    {requests
                      .filter((r) => r.stav === REQUEST_STAV.SENT)
                      .map((r) => (
                        <div
                          key={r.id}
                          className="flex items-center gap-2 text-muted-foreground"
                        >
                          <Clock className="h-3 w-3" />
                          <span>{r.supplier.nazov}</span>
                          {r.sent_at && (
                            <span className="text-[11px]">
                              · poslané {formatDateLong(r.sent_at)}
                            </span>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Budget vs winner panel */}
              {winner && winnerPrice != null && (
                <div
                  className={cn(
                    "mt-4 px-4 py-3 rounded-lg border text-sm",
                    savings != null && savings >= 0
                      ? "bg-green-50 border-green-200 text-green-900"
                      : "bg-amber-50 border-amber-200 text-amber-900"
                  )}
                >
                  {budget != null ? (
                    <>
                      <strong>Plánovaný budget</strong>{" "}
                      {formatMoneyCompact(budget)} {subcontract.mena} ·{" "}
                      <strong>vybraná ponuka</strong>{" "}
                      {formatMoneyCompact(winnerPrice)}{" "}
                      {winner.mena ?? subcontract.mena}
                      {savings != null && (
                        <>
                          {" · "}
                          {savings >= 0 ? (
                            <strong className="text-green-700">
                              úspora {formatMoneyCompact(savings)} (
                              {budget > 0
                                ? `−${Math.round((savings / budget) * 100)}%`
                                : ""}
                              )
                            </strong>
                          ) : (
                            <strong className="text-red-700">
                              prekročenie {formatMoneyCompact(-savings)} (
                              {budget > 0
                                ? `+${Math.round((-savings / budget) * 100)}%`
                                : ""}
                              )
                            </strong>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <strong>Vybraná ponuka:</strong>{" "}
                      {formatMoney(winnerPrice, winner.mena ?? "CZK")}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t bg-muted/30 shrink-0 flex-row justify-between sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušiť
          </Button>
          <Button
            onClick={handleAward}
            disabled={!selectedWinnerId || award.isPending}
          >
            {award.isPending ? (
              "Ukladám…"
            ) : (
              <>
                <Award className="h-4 w-4 mr-1" />
                Potvrdiť výber
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// QUOTE INPUT DIALOG — for entering received bids
// ============================================================

interface EnterQuoteDialogProps {
  request: SubcontractRequestView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Quick dialog for PM/nakupci to enter a received bid into a pending RFQ request.
 * Marks request as 'received'.
 */
export function EnterQuoteDialog({
  request,
  open,
  onOpenChange,
}: EnterQuoteDialogProps) {
  const [cena, setCena] = useState(request.cena_nabidka?.toString() ?? "");
  const [termin, setTermin] = useState(request.termin_dodani ?? "");
  const [poznamka, setPoznamka] = useState(request.poznamka ?? "");

  const update = useUpdateRFQRequest();

  const submit = async () => {
    if (!cena) return;
    try {
      await update.mutateAsync({
        id: request.id,
        patch: {
          cena_nabidka: Number(cena),
          mena: request.mena ?? "CZK",
          termin_dodani: termin || undefined,
          stav: REQUEST_STAV.RECEIVED,
          responded_at: new Date().toISOString(),
          poznamka: poznamka.trim() || undefined,
        },
      });
      onOpenChange(false);
    } catch {
      // toast in hook
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Zadať ponuku</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Dodávateľ: <strong>{request.supplier.nazov}</strong>
          </p>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Cena ponuky <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={cena}
                onChange={(e) => setCena(e.target.value)}
                placeholder="11 200"
              />
              <div className="flex items-center px-3 border rounded-md bg-muted text-sm font-medium">
                {request.mena ?? "CZK"}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Termín dodania</label>
            <Input
              type="date"
              value={termin}
              onChange={(e) => setTermin(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Poznámka</label>
            <Input
              value={poznamka}
              onChange={(e) => setPoznamka(e.target.value)}
              placeholder="Voliteľná poznámka k ponuke"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušiť
          </Button>
          <Button onClick={submit} disabled={!cena || update.isPending}>
            {update.isPending ? "Ukladám…" : "Uložiť ponuku"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
