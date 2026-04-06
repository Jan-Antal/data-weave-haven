/**
 * Etapy section for ProjectDetailDialog — shows per-stage cost breakdown.
 * Only rendered when project has 2+ stages.
 */
import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { RozpadCeny, type CostValues } from "./RozpadCeny";
import { useProjectStages, useUpdateStage } from "@/hooks/useProjectStages";
import { formatCurrency, marzeStorageToInput, marzeInputToStorage, formatMarze } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { ProjectStage } from "@/hooks/useProjectStages";

interface StagesCostSectionProps {
  projectId: string;
  readOnly?: boolean;
}

function StageCostRow({ stage, readOnly }: { stage: ProjectStage; readOnly: boolean }) {
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
    // Save each changed field to the stage
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

  const hasCostData = costValues.cost_material_pct != null;

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
            costValues={costValues}
            onChange={handleCostChange}
            readOnly={readOnly}
          />
        </div>
      )}
    </div>
  );
}

export function StagesCostSection({ projectId, readOnly = false }: StagesCostSectionProps) {
  const { data: stages = [] } = useProjectStages(projectId);

  if (stages.length < 2) return null;

  const totalPrice = stages.reduce((sum, s) => sum + (s.prodejni_cena ?? 0), 0);

  return (
    <div className="space-y-2">
      {/* Section header */}
      <div className="relative flex items-center mt-5 mb-3">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-border" />
        </div>
        <span className="relative bg-background pr-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground flex items-center gap-1.5">
          <span className="text-[18px] leading-none">📐</span> ETAPY ({stages.length})
        </span>
      </div>

      {/* Stage rows */}
      <div className="space-y-1.5">
        {stages.map((stage) => (
          <StageCostRow key={stage.id} stage={stage} readOnly={readOnly} />
        ))}
      </div>

      {/* Total */}
      {totalPrice > 0 && (
        <div className="flex justify-between items-center pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">Součet etap:</span>
          <span className="text-xs font-semibold">
            {Math.round(totalPrice).toLocaleString("cs-CZ")} Kč
          </span>
        </div>
      )}
    </div>
  );
}
