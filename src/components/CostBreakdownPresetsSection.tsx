import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Trash2, Star, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  useCostBreakdownPresets,
  useUpsertPreset,
  useDeletePreset,
  useSetDefaultPreset,
  type CostBreakdownPreset,
} from "@/hooks/useCostBreakdownPresets";
import {
  useProductionSettings,
  useUpdateProductionSettings,
} from "@/hooks/useProductionSettings";

const SEGMENT_COLORS = [
  { key: "material_pct", label: "Mat.", color: "#f97316" },
  { key: "production_pct", label: "Výroba", color: "#3a8a36" },
  { key: "subcontractors_pct", label: "Subdod.", color: "#2563eb" },
  { key: "overhead_pct", label: "Režie", color: "#6b7280" },
  { key: "doprava_pct", label: "Doprava", color: "#eab308" },
  { key: "montaz_pct", label: "Montáž", color: "#8b5cf6" },
];

function BreakdownBar({ preset }: { preset: CostBreakdownPreset }) {
  const total = SEGMENT_COLORS.reduce((s, seg) => s + ((preset as any)[seg.key] || 0), 0);
  return (
    <div className="flex h-3 rounded-full overflow-hidden bg-muted w-full" title={`Součet: ${total}%`}>
      {SEGMENT_COLORS.map((seg) => {
        const val = (preset as any)[seg.key] || 0;
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

function PresetCard({
  preset,
  onUpdate,
  onDelete,
  onSetDefault,
}: {
  preset: CostBreakdownPreset;
  onUpdate: (p: Partial<CostBreakdownPreset> & { id: string }) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}) {
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);

  const total = SEGMENT_COLORS.reduce((s, seg) => s + ((preset as any)[seg.key] || 0), 0);
  const isValid = total === 100;

  const handleFieldBlur = (key: string) => {
    const val = editing[key];
    if (val === undefined) return;
    const num = parseFloat(val);
    if (!isNaN(num) && num !== (preset as any)[key]) {
      onUpdate({ id: preset.id, [key]: num });
    }
    setEditing((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  return (
    <div className="border rounded-lg p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSetDefault(preset.id)}
          className={`shrink-0 ${preset.is_default ? "text-amber-500" : "text-muted-foreground/30 hover:text-amber-400"} transition-colors`}
          title={preset.is_default ? "Výchozí šablona" : "Nastavit jako výchozí"}
        >
          <Star className="h-4 w-4" fill={preset.is_default ? "currentColor" : "none"} />
        </button>
        <Input
          className="h-7 text-sm font-medium flex-1"
          defaultValue={preset.name}
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value !== preset.name) {
              onUpdate({ id: preset.id, name: e.target.value.trim() });
            }
          }}
        />
        <button
          onClick={() => setDeleteOpen(true)}
          className="text-muted-foreground/50 hover:text-destructive transition-colors shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <Input
        className="h-7 text-xs"
        placeholder="Popis (nepovinný)"
        defaultValue={preset.description || ""}
        onBlur={(e) => {
          const v = e.target.value.trim() || null;
          if (v !== preset.description) {
            onUpdate({ id: preset.id, description: v });
          }
        }}
      />

      <div className="grid grid-cols-6 gap-1">
        {SEGMENT_COLORS.map((seg) => (
          <div key={seg.key}>
            <Label className="text-[9px] text-muted-foreground block text-center">{seg.label}</Label>
            <div className="relative">
              <Input
                className="h-7 text-xs text-center pr-4 no-spinners"
                type="number"
                value={editing[seg.key] ?? String((preset as any)[seg.key] ?? 0)}
                onChange={(e) => setEditing((prev) => ({ ...prev, [seg.key]: e.target.value }))}
                onBlur={() => handleFieldBlur(seg.key)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
              <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
            </div>
          </div>
        ))}
      </div>

      <BreakdownBar preset={preset} />

      {!isValid && (
        <p className="text-[10px] text-destructive font-medium">
          Součet: {total}% (musí být 100%)
        </p>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onConfirm={() => { onDelete(preset.id); setDeleteOpen(false); }}
        onCancel={() => setDeleteOpen(false)}
        title="Smazat šablonu?"
        description={`Opravdu chcete smazat šablonu "${preset.name}"?`}
      />
    </div>
  );
}

export function CostBreakdownPresetsSection({ readOnly = false }: { readOnly?: boolean }) {
  const { data: presets = [], isLoading } = useCostBreakdownPresets();
  const upsertPreset = useUpsertPreset();
  const deletePreset = useDeletePreset();
  const setDefaultPreset = useSetDefaultPreset();
  const { data: settings } = useProductionSettings();
  const updateSettings = useUpdateProductionSettings();

  const [hourlyRate, setHourlyRate] = useState<string>("");
  const [monthlyCapacity, setMonthlyCapacity] = useState<string>("");

  // Sync from settings
  const rateVal = hourlyRate || String(settings?.hourly_rate ?? 550);
  const capVal = monthlyCapacity || String(settings?.monthly_capacity_hours ?? 3500);

  const handleAddPreset = () => {
    upsertPreset.mutate(
      { name: "Nová šablona", material_pct: 15, overhead_pct: 25, logistics_pct: 15, production_pct: 25, subcontractors_pct: 10, margin_pct: 10, sort_order: presets.length },
      { onSuccess: () => toast({ title: "Šablona vytvořena" }) }
    );
  };

  const handleUpdate = (p: Partial<CostBreakdownPreset> & { id: string }) => {
    upsertPreset.mutate(p);
  };

  const handleDelete = (id: string) => {
    deletePreset.mutate(id, {
      onSuccess: () => toast({ title: "Šablona smazána" }),
      onError: (err: any) => toast({ title: "Chyba", description: err.message, variant: "destructive" }),
    });
  };

  const handleSetDefault = (id: string) => {
    setDefaultPreset.mutate(id);
  };

  const handleSaveSettings = (field: "hourly_rate" | "monthly_capacity_hours", value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) {
      updateSettings.mutate({ [field]: num });
    }
  };

  if (isLoading) return <p className="text-xs text-muted-foreground">Načítání...</p>;

  return (
    <div className={`space-y-4 ${readOnly ? "pointer-events-none opacity-80" : ""}`}>
      {/* Production capacity settings */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Hodinová sazba</Label>
          <div className="relative">
            <Input
              type="number"
              className="h-8 text-sm pr-12 no-spinners"
              value={rateVal}
              onChange={(e) => setHourlyRate(e.target.value)}
              onBlur={() => handleSaveSettings("hourly_rate", rateVal)}
              disabled={readOnly}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">Kč/h</span>
          </div>
        </div>
        <div>
          <Label className="text-xs">Měsíční kapacita</Label>
          <div className="relative">
            <Input
              type="number"
              className="h-8 text-sm pr-6 no-spinners"
              value={capVal}
              onChange={(e) => setMonthlyCapacity(e.target.value)}
              onBlur={() => handleSaveSettings("monthly_capacity_hours", capVal)}
              disabled={readOnly}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">h</span>
          </div>
        </div>
      </div>

      {/* Presets list */}
      <div className="space-y-2">
        {presets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            onUpdate={readOnly ? () => {} : handleUpdate}
            onDelete={readOnly ? () => {} : handleDelete}
            onSetDefault={readOnly ? () => {} : handleSetDefault}
          />
        ))}
      </div>

      {!readOnly && (
        <Button variant="outline" size="sm" className="w-full" onClick={handleAddPreset}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Nová šablona
        </Button>
      )}
    </div>
  );
}
