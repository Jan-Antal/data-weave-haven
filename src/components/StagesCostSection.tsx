/**
 * Etapy section for ProjectDetailDialog — shows per-stage cost breakdown.
 * Only rendered when project has 2+ stages.
 */
import { useState, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { RozpadCeny, type CostValues } from "./RozpadCeny";
import { useProjectStages, useUpdateStage, useAddStage, useDeleteStage } from "@/hooks/useProjectStages";
import { formatCurrency, marzeStorageToInput, marzeInputToStorage, formatMarze } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./ConfirmDialog";
import type { ProjectStage } from "@/hooks/useProjectStages";

interface StagesCostSectionProps {
  projectId: string;
  readOnly?: boolean;
  /** Current plan_use_project_price value from project */
  useProjectPrice?: boolean;
  /** Callback to toggle plan_use_project_price */
  onToggleProjectPrice?: (value: boolean) => void;
}

function StageCostRow({ stage, readOnly, onRequestDelete }: { stage: ProjectStage; readOnly: boolean; onRequestDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const updateStage = useUpdateStage();
  const [localPrice, setLocalPrice] = useState(String(stage.prodejni_cena ?? ""));
  const [localMarze, setLocalMarze] = useState(marzeStorageToInput(stage.marze));
  const [priceEditing, setPriceEditing] = useState(false);

  const save = useCallback((field: string, value: any) => {
    updateStage.mutate({
      id: stage.id,
      field,
      value,
      projectId: stage.project_id,
    });
  }, [stage.id, stage.project_id, updateStage]);

  const handleCostChange = useCallback((updates: Partial<CostValues>) => {
    for (const [key, value] of Object.entries(updates)) {
      save(key, value);
    }
  }, [save]);

  const costValues: CostValues = {
    cost_preset_id: (stage as any).cost_preset_id ?? null,
    cost_material_pct: (stage as any).cost_material_pct ?? null,
    cost_overhead_pct: (stage as any).cost_overhead_pct ?? null,
    cost_doprava_pct: (stage as any).cost_doprava_pct ?? null,
    cost_production_pct: (stage as any).cost_production_pct ?? null,
    cost_subcontractors_pct: (stage as any).cost_subcontractors_pct ?? null,
    cost_montaz_pct: (stage as any).cost_montaz_pct ?? null,
    cost_is_custom: (stage as any).cost_is_custom ?? false,
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-xs font-medium truncate">{stage.stage_name}</span>
        {stage.display_name && (
          <span className="text-xs text-muted-foreground truncate">— {stage.display_name}</span>
        )}
        <span className="ml-auto text-xs font-medium shrink-0">
          {stage.prodejni_cena
            ? formatCurrency(stage.prodejni_cena, (stage as any).currency || "CZK")
            : "—"}
        </span>
        {stage.marze && (
          <Badge variant="outline" className="text-[10px] h-5 shrink-0">
            {formatMarze(stage.marze)}
          </Badge>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border bg-muted/20 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Prodejní cena</Label>
              {readOnly ? (
                <Input
                  value={stage.prodejni_cena ? Number(stage.prodejni_cena).toLocaleString("cs-CZ") : "—"}
                  disabled
                  className="h-8 text-xs"
                />
              ) : (
                <Input
                  type={priceEditing ? "number" : "text"}
                  className="h-8 text-xs no-spinners"
                  value={priceEditing ? localPrice : (localPrice ? Number(localPrice).toLocaleString("cs-CZ") : "")}
                  onChange={(e) => setLocalPrice(e.target.value)}
                  onFocus={() => setPriceEditing(true)}
                  onBlur={() => {
                    setPriceEditing(false);
                    const num = localPrice === "" ? null : Number(localPrice);
                    save("prodejni_cena", num);
                  }}
                />
              )}
            </div>
            <div>
              <Label className="text-[10px]">Marže</Label>
              {readOnly ? (
                <Input value={localMarze ? `${localMarze} %` : "—"} disabled className="h-8 text-xs" />
              ) : (
                <div className="relative">
                  <Input
                    type="number"
                    className="h-8 text-xs no-spinners pr-6"
                    value={localMarze}
                    onChange={(e) => setLocalMarze(e.target.value)}
                    onBlur={() => save("marze", marzeInputToStorage(localMarze) || null)}
                    placeholder="15"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
                </div>
              )}
            </div>
          </div>

          <RozpadCeny
            projectId={stage.project_id}
            prodejniCena={stage.prodejni_cena ?? null}
            marze={stage.marze ? parseFloat(String(stage.marze).replace(",", ".")) : null}
            currency={(stage as any).currency || "CZK"}
            costValues={costValues}
            onChange={handleCostChange}
            readOnly={readOnly}
          />

          {!readOnly && (
            <div className="flex justify-end pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={(e) => { e.stopPropagation(); onRequestDelete(stage.id); }}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Smazat etapu
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function StagesCostSection({ projectId, readOnly = false, useProjectPrice = false, onToggleProjectPrice }: StagesCostSectionProps) {
  const { data: stages = [] } = useProjectStages(projectId);
  const addStage = useAddStage();
  const deleteStage = useDeleteStage();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const isAutoSum = !useProjectPrice;
  const stageCurrency = stages[0]?.currency || "CZK";

  const totalPrice = stages.reduce((sum, s) => sum + (s.prodejni_cena ?? 0), 0);

  // Weighted average margin
  const weightedMarze = useMemo(() => {
    const totalWeight = stages.reduce((acc, s) => acc + (s.prodejni_cena ?? 0), 0);
    if (totalWeight <= 0) return null;
    const weightedSum = stages.reduce((acc, s) => {
      const price = s.prodejni_cena ?? 0;
      const raw = s.marze ? parseFloat(String(s.marze).replace(",", ".")) : 0;
      // Normalize to decimal (0.25 = 25%)
      const decimal = raw > 1 ? raw / 100 : raw;
      return acc + price * decimal;
    }, 0);
    // Return as percentage for display (e.g. 25.3)
    return Math.round((weightedSum / totalWeight) * 1000) / 10;
  }, [stages]);

  if (stages.length < 2) return null;

  const handleAddStage = () => {
    const letters = stages.map(s => {
      const m = s.stage_name.match(/-([A-Z])$/);
      return m ? m[1] : null;
    }).filter(Boolean) as string[];
    const lastChar = letters.sort().pop();
    const suffix = lastChar ? String.fromCharCode(lastChar.charCodeAt(0) + 1) : "A";
    addStage.mutate({ project_id: projectId, stage_name: `${projectId}-${suffix}`, stage_order: stages.length });
  };

  return (
    <div className="space-y-2">
      <div className="relative flex items-center mt-5 mb-3">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-border" />
        </div>
        <span className="relative bg-background pr-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground flex items-center gap-1.5">
          <span className="text-[18px] leading-none">📐</span> ETAPY ({stages.length})
        </span>
      </div>

      {/* Auto-sum toggle */}
      {onToggleProjectPrice && (
        <div className="flex items-center justify-between gap-2 py-1 px-1">
          <div className="flex items-center gap-2">
            <Switch
              checked={isAutoSum}
              onCheckedChange={(checked) => onToggleProjectPrice(!checked)}
              className="h-4 w-8 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-4"
            />
            <span className="text-[10px] font-medium text-muted-foreground">
              {isAutoSum ? "Σ Auto-suma z etap" : "Manuální cena projektu"}
            </span>
          </div>
          {isAutoSum && weightedMarze != null && (
            <span className="text-[10px] text-muted-foreground">
              Ø marže: {weightedMarze} %
            </span>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        {stages.map((stage) => (
          <StageCostRow key={stage.id} stage={stage} readOnly={readOnly} onRequestDelete={setDeleteId} />
        ))}
      </div>

      {isAutoSum && totalPrice > 0 && (
        <div className="flex justify-between items-center pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">Σ Součet etap:</span>
          <span className="text-xs font-semibold">
            {Math.round(totalPrice).toLocaleString("cs-CZ")} {stageCurrency === "EUR" ? "€" : "Kč"}
          </span>
        </div>
      )}

      {!readOnly && (
        <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground hover:text-foreground w-full" onClick={handleAddStage}>
          <Plus className="h-3 w-3 mr-1" /> Přidat etapu
        </Button>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onConfirm={() => {
          if (deleteId) {
            const s = stages.find(st => st.id === deleteId);
            deleteStage.mutate({ id: deleteId, projectId, stageName: s?.stage_name });
            setDeleteId(null);
          }
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
