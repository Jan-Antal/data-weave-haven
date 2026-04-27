/**
 * Quick-edit dialog for project stage prices and margins.
 * Triggered from clicking on the Σ (summary) marže/prodejni_cena cell in ProjectInfoTable.
 * Compact, focused workflow — no need to open full Project Detail.
 */
import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useProjectStages, useUpdateStage } from "@/hooks/useProjectStages";
import { marzeStorageToInput, marzeInputToStorage, formatCurrency } from "@/lib/currency";

interface StageQuickEditDialogProps {
  projectId: string | null;
  projectName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFullDetail?: () => void;
  readOnly?: boolean;
}

const DEFAULT_MARGIN_PCT = 15;

export function StageQuickEditDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
  onOpenFullDetail,
  readOnly = false,
}: StageQuickEditDialogProps) {
  const { data: stages = [] } = useProjectStages(projectId || "");
  const updateStage = useUpdateStage();

  // Local input state per-stage so typing doesn't cause re-render storms
  const [localPrices, setLocalPrices] = useState<Record<string, string>>({});
  const [localMarze, setLocalMarze] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    const p: Record<string, string> = {};
    const m: Record<string, string> = {};
    for (const s of stages) {
      p[s.id] = s.prodejni_cena != null ? String(s.prodejni_cena) : "";
      m[s.id] = marzeStorageToInput(s.marze);
    }
    setLocalPrices(p);
    setLocalMarze(m);
  }, [open, stages]);

  const currency = stages[0]?.currency || "CZK";

  // Live totals based on local edits
  const { totalPrice, weightedMarze } = useMemo(() => {
    let total = 0;
    let weightedSum = 0;
    let plainSum = 0;
    let plainCount = 0;
    for (const s of stages) {
      const priceStr = localPrices[s.id] ?? "";
      const marzeStr = localMarze[s.id] ?? "";
      const price = priceStr === "" ? 0 : Number(priceStr);
      const marzePct = marzeStr === "" ? DEFAULT_MARGIN_PCT : Number(marzeStr.replace(",", "."));
      total += isFinite(price) ? price : 0;
      if (isFinite(marzePct)) {
        plainSum += marzePct;
        plainCount += 1;
        if (isFinite(price) && price > 0) {
          weightedSum += price * (marzePct / 100);
        }
      }
    }
    let weighted: number | null = null;
    if (total > 0) {
      weighted = Math.round((weightedSum / total) * 1000) / 10;
    } else if (plainCount > 0) {
      weighted = Math.round((plainSum / plainCount) * 10) / 10;
    }
    return { totalPrice: total, weightedMarze: weighted };
  }, [stages, localPrices, localMarze]);

  const savePrice = (stage: typeof stages[number]) => {
    const local = localPrices[stage.id] ?? "";
    const num = local === "" ? null : Number(local);
    const current = stage.prodejni_cena ?? null;
    if (String(num ?? "") === String(current ?? "")) return;
    updateStage.mutate({ id: stage.id, field: "prodejni_cena", value: num, projectId: stage.project_id });
  };

  const saveMarze = (stage: typeof stages[number]) => {
    const local = localMarze[stage.id] ?? "";
    const next = marzeInputToStorage(local) || null;
    const current = stage.marze ?? null;
    if (String(next ?? "") === String(current ?? "")) return;
    updateStage.mutate({ id: stage.id, field: "marze", value: next, projectId: stage.project_id });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-sm flex items-baseline gap-2">
            <span className="font-semibold">Etapy projektu</span>
            {projectId && (
              <span className="text-xs text-muted-foreground font-mono">{projectId}</span>
            )}
          </DialogTitle>
          {projectName && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">{projectName}</div>
          )}
          <div className="flex items-center justify-between gap-4 mt-3 text-xs">
            <div>
              <span className="text-muted-foreground">Σ Cena: </span>
              <span className="font-semibold">{formatCurrency(totalPrice, currency)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Ø Marže: </span>
              <span className="font-semibold">{weightedMarze != null ? `${weightedMarze} %` : "—"}</span>
            </div>
          </div>
        </DialogHeader>

        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {stages.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">Žádné etapy.</div>
          )}
          {stages.map((stage) => {
            const stageLetter = (stage.stage_name.match(/-([A-Z])$/)?.[1]) || stage.stage_name;
            return (
              <div key={stage.id} className="space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-primary">{stageLetter}</span>
                  {stage.display_name && (
                    <span className="text-xs text-muted-foreground truncate">— {stage.display_name}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Prodejní cena</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        className="h-8 text-xs no-spinners pr-10"
                        value={localPrices[stage.id] ?? ""}
                        onChange={(e) => setLocalPrices((prev) => ({ ...prev, [stage.id]: e.target.value }))}
                        onBlur={() => savePrice(stage)}
                        disabled={readOnly}
                        placeholder="0"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                        {currency === "EUR" ? "€" : "Kč"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Marže</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        className="h-8 text-xs no-spinners pr-6"
                        value={localMarze[stage.id] ?? ""}
                        onChange={(e) => setLocalMarze((prev) => ({ ...prev, [stage.id]: e.target.value }))}
                        onBlur={() => saveMarze(stage)}
                        disabled={readOnly}
                        placeholder="15"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {onOpenFullDetail && (
          <DialogFooter className="px-5 py-3 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-muted-foreground hover:text-foreground"
              onClick={() => {
                onOpenChange(false);
                onOpenFullDetail();
              }}
            >
              Otevřít detail projektu <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
