import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useCostBreakdownPresets, type CostBreakdownPreset } from "@/hooks/useCostBreakdownPresets";
import { useProductionSettings } from "@/hooks/useProductionSettings";

const SEGMENT_COLORS = [
  { key: "material_pct", label: "Mat.", color: "#d97706" },
  { key: "overhead_pct", label: "Režie", color: "#6b7280" },
  { key: "logistics_pct", label: "Log.", color: "#3b82f6" },
  { key: "production_pct", label: "Výroba", color: "#3a8a36" },
  { key: "subcontractors_pct", label: "Subdod.", color: "#8b5cf6" },
  { key: "margin_pct", label: "Marže", color: "#99a5a3" },
];

interface CostValues {
  cost_preset_id: string | null;
  cost_material_pct: number | null;
  cost_overhead_pct: number | null;
  cost_logistics_pct: number | null;
  cost_production_pct: number | null;
  cost_subcontractors_pct: number | null;
  cost_margin_pct: number | null;
  cost_is_custom: boolean;
}

interface RozpadCenyProps {
  projectId: string;
  prodejniCena: number | null;
  costValues: CostValues;
  onChange: (updates: Partial<CostValues>) => void;
  readOnly?: boolean;
  kalkulantSlot?: React.ReactNode;
}

function BreakdownBar({ values }: { values: Record<string, number> }) {
  const total = Object.values(values).reduce((s, v) => s + (v || 0), 0);
  return (
    <div className="flex h-2.5 rounded-full overflow-hidden bg-muted w-full">
      {SEGMENT_COLORS.map((seg) => {
        const val = values[seg.key.replace("cost_", "")] || values[seg.key] || 0;
        if (val <= 0) return null;
        return (
          <div
            key={seg.key}
            style={{ width: `${(val / Math.max(total, 1)) * 100}%`, backgroundColor: seg.color }}
            className="transition-all duration-200"
            title={`${seg.label}: ${val}%`}
          />
        );
      })}
    </div>
  );
}

export function RozpadCeny({ projectId, prodejniCena, costValues, onChange, readOnly, kalkulantSlot }: RozpadCenyProps) {
  const { data: presets = [] } = useCostBreakdownPresets();
  const { data: settings } = useProductionSettings();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const hasPreset = !!costValues.cost_preset_id;
  const hasValues = costValues.cost_material_pct != null;

  const pctValues: Record<string, number> = {
    material_pct: costValues.cost_material_pct ?? 0,
    overhead_pct: costValues.cost_overhead_pct ?? 0,
    logistics_pct: costValues.cost_logistics_pct ?? 0,
    production_pct: costValues.cost_production_pct ?? 0,
    subcontractors_pct: costValues.cost_subcontractors_pct ?? 0,
    margin_pct: costValues.cost_margin_pct ?? 0,
  };

  const total = Object.values(pctValues).reduce((s, v) => s + v, 0);

  const handlePresetSelect = (presetId: string) => {
    if (presetId === "__none__") {
      onChange({
        cost_preset_id: null,
        cost_material_pct: null,
        cost_overhead_pct: null,
        cost_logistics_pct: null,
        cost_production_pct: null,
        cost_subcontractors_pct: null,
        cost_margin_pct: null,
        cost_is_custom: false,
      });
      return;
    }
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    onChange({
      cost_preset_id: preset.id,
      cost_material_pct: preset.material_pct,
      cost_overhead_pct: preset.overhead_pct,
      cost_logistics_pct: preset.logistics_pct,
      cost_production_pct: preset.production_pct,
      cost_subcontractors_pct: preset.subcontractors_pct,
      cost_margin_pct: preset.margin_pct,
      cost_is_custom: false,
    });
  };

  const handlePctChange = (key: string, value: string) => {
    setEditing((prev) => ({ ...prev, [key]: value }));
  };

  const handlePctBlur = (key: string) => {
    const val = editing[key];
    if (val === undefined) return;
    const num = parseFloat(val);
    if (!isNaN(num)) {
      const costKey = `cost_${key}` as keyof CostValues;
      onChange({ [costKey]: num, cost_is_custom: true });
    }
    setEditing((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Compute production summary
  const productionPct = pctValues.production_pct || 0;
  const productionCzk = prodejniCena ? prodejniCena * productionPct / 100 : 0;
  const hourlyRate = settings?.hourly_rate ?? 550;
  const productionHours = hourlyRate > 0 ? productionCzk / hourlyRate : 0;

  const selectedPreset = presets.find((p) => p.id === costValues.cost_preset_id);
  const presetLabel = selectedPreset
    ? `${selectedPreset.name}${costValues.cost_is_custom ? " (Upraveno)" : ""}`
    : undefined;

  if (readOnly && !hasValues) return null;

  return (
    <div className="col-span-2 space-y-2">
      <div className="grid grid-cols-2 gap-x-3">
        <div>
          <Label className="text-xs">Rozpad ceny</Label>
          {!readOnly ? (
            <Select
              value={costValues.cost_preset_id || "__none__"}
              onValueChange={handlePresetSelect}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Vybrat šablonu...">{presetLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[99999]">
                <SelectItem value="__none__">— Žádná šablona —</SelectItem>
                {presets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input value={presetLabel || "—"} disabled className="h-9 bg-muted text-muted-foreground cursor-not-allowed opacity-70" />
          )}
        </div>
        {kalkulantSlot}
      </div>

      {hasValues && (
        <>
          <BreakdownBar values={pctValues} />

          {prodejniCena != null && prodejniCena > 0 && productionPct > 0 && (
            <p className="text-xs text-muted-foreground">
              Výroba: <span className="font-medium text-foreground">{Math.round(productionCzk).toLocaleString("cs-CZ")} Kč</span>
              {" · "}
              <span className="font-medium text-foreground">{Math.round(productionHours).toLocaleString("cs-CZ")}h</span>
            </p>
          )}

          {!readOnly && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Skrýt %" : "Upravit %"}
            </button>
          )}

          {(expanded || readOnly) && (
            <div className="grid grid-cols-6 gap-1">
              {SEGMENT_COLORS.map((seg) => (
                <div key={seg.key}>
                  <Label className="text-[9px] text-muted-foreground block text-center">{seg.label}</Label>
                  <div className="relative">
                    <Input
                      className="h-7 text-xs text-center pr-4 no-spinners"
                      type={readOnly ? "text" : "number"}
                      value={readOnly ? `${pctValues[seg.key]}` : (editing[seg.key] ?? String(pctValues[seg.key] ?? 0))}
                      onChange={(e) => handlePctChange(seg.key, e.target.value)}
                      onBlur={() => handlePctBlur(seg.key)}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      disabled={readOnly}
                    />
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!readOnly && expanded && total !== 100 && (
            <p className="text-[10px] text-destructive font-medium">
              Součet: {total}% (musí být 100%)
            </p>
          )}
        </>
      )}
    </div>
  );
}
