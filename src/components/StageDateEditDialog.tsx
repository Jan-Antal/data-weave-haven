import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Trash2, AlertTriangle } from "lucide-react";
import { formatAppDate, parseAppDate } from "@/lib/dateFormat";
import { cn } from "@/lib/utils";
import { useUpdateStage } from "@/hooks/useProjectStages";
import { addEditedField } from "@/lib/stageInheritance";
import { useAuth } from "@/hooks/useAuth";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import type { ProjectStage } from "@/hooks/useProjectStages";
import type { Project } from "@/hooks/useProjects";

const DATE_FIELDS = [
  { key: "start_date", label: "Datum Objednání" },
  { key: "tpv_date", label: "TPV" },
  { key: "expedice", label: "Expedice" },
  { key: "predani", label: "Předání" },
  { key: "datum_smluvni", label: "Datum Smluvní" },
] as const;

type FieldKey = (typeof DATE_FIELDS)[number]["key"];

// No longer needed — values are now stored directly on stage

interface StageDateEditDialogProps {
  stage: ProjectStage | null;
  project?: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StageDateEditDialog({ stage, project, open, onOpenChange }: StageDateEditDialogProps) {
  const updateStage = useUpdateStage();
  const { isViewer, isFieldReadOnly } = useAuth();
  const [values, setValues] = useState<Record<FieldKey, string | null>>({
    start_date: null,
    datum_smluvni: null,
    tpv_date: null,
    expedice: null,
    predani: null,
  });
  // Track which fields are inherited (stage has no own value)
  const [inheritedFields, setInheritedFields] = useState<Set<FieldKey>>(new Set());
  const [openPickers, setOpenPickers] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (stage && open) {
      setValues({
        start_date: (stage as any).start_date ?? null,
        datum_smluvni: (stage as any).datum_smluvni ?? null,
        tpv_date: (stage as any).tpv_date ?? null,
        expedice: (stage as any).expedice ?? null,
        predani: (stage as any).predani ?? null,
      });
      setInheritedFields(new Set());
    }
  }, [stage, open]);

  const orderWarnings = useMemo(() => {
    const ORDER: { key: FieldKey; label: string }[] = [
      { key: "start_date", label: "Objednání" },
      { key: "tpv_date", label: "TPV" },
      { key: "expedice", label: "Expedice" },
      { key: "predani", label: "Předání" },
      { key: "datum_smluvni", label: "Smluvní" },
    ];
    const warnings: { message: string; fields: Set<string>; severity: "orange" | "red" }[] = [];
    for (let i = 0; i < ORDER.length; i++) {
      const aRaw = values[ORDER[i].key];
      const aDate = aRaw ? parseAppDate(aRaw) : null;
      if (!aDate) continue;
      for (let j = i + 1; j < ORDER.length; j++) {
        const bRaw = values[ORDER[j].key];
        const bDate = bRaw ? parseAppDate(bRaw) : null;
        if (!bDate) continue;
        if (aDate > bDate) {
          const isSevere = (ORDER[j].key === "datum_smluvni") && (ORDER[i].key === "expedice" || ORDER[i].key === "predani");
          warnings.push({
            message: `${ORDER[i].label} je po ${ORDER[j].label}`,
            fields: new Set([ORDER[i].key, ORDER[j].key]),
            severity: isSevere ? "red" : "orange",
          });
        }
      }
    }
    return warnings;
  }, [values]);

  const fieldsWithWarning = useMemo(() => {
    const s = new Set<string>();
    orderWarnings.forEach(w => w.fields.forEach(f => s.add(f)));
    return s;
  }, [orderWarnings]);

  if (!stage) return null;

  // Map stage field keys to project-level field keys for permission checks
  const fieldPermissionMap: Record<string, string> = {
    start_date: "datum_objednavky",
    datum_smluvni: "datum_smluvni",
    tpv_date: "tpv_date",
    expedice: "expedice",
    predani: "predani",
  };

  const handleSave = async () => {
    let currentStage = stage;
    for (const f of DATE_FIELDS) {
      const oldVal = (stage as any)[f.key] ?? "";
      const newVal = values[f.key] ?? "";
      if (oldVal !== newVal) {
        const newEditedFields = addEditedField(currentStage, f.key);
        updateStage.mutate({
          id: stage.id,
          field: f.key,
          value: newVal || null,
          projectId: stage.project_id,
          oldValue: oldVal,
          stageName: stage.stage_name,
          editedFields: newEditedFields,
        });
        // Update local reference so subsequent calls accumulate edited fields
        currentStage = { ...currentStage, manually_edited_fields: newEditedFields } as any;
      }
    }
    onOpenChange(false);
  };

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const hasChanges = DATE_FIELDS.some(f => {
    const oldVal = (stage as any)[f.key] ?? "";
    const newVal = values[f.key] ?? "";
    return oldVal !== newVal;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {stage.stage_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {DATE_FIELDS.map((f) => {
            const raw = values[f.key];
            const parsed = raw ? parseAppDate(raw) : undefined;
            const mappedField = fieldPermissionMap[f.key] ?? f.key;
            const readOnly = isFieldReadOnly(mappedField, (stage as any)[f.key] ?? null);
            const hasWarning = fieldsWithWarning.has(f.key);

            return (
              <div key={f.key} className="flex items-center gap-0">
                <span className={cn(
                  "text-xs font-medium w-[120px] shrink-0",
                  readOnly && "text-muted-foreground",
                  !readOnly && inheritedFields.has(f.key) && "text-muted-foreground/60"
                )}>{f.label}{inheritedFields.has(f.key) && <span className="text-[10px] ml-1 text-muted-foreground/40">(zděděno)</span>}</span>
                <div className="w-6 shrink-0 flex items-center justify-center">
                  {hasWarning ? (() => {
                    const fieldWarnings = orderWarnings.filter(w => w.fields.has(f.key));
                    const hasRed = fieldWarnings.some(w => w.severity === "red");
                    return (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertTriangle className="h-3.5 w-3.5" style={{ color: hasRed ? "#dc2626" : "#f4a261" }} />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-[220px]">
                          {fieldWarnings.map((w, i) => (
                            <div key={i} style={{ color: w.severity === "red" ? "#dc2626" : undefined }}>{w.message}</div>
                          ))}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    );
                  })() : null}
                </div>
                <Popover
                  open={openPickers[f.key] || false}
                  onOpenChange={(o) => {
                    if (readOnly) return;
                    setOpenPickers((prev) => ({ ...prev, [f.key]: o }));
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={readOnly}
                      className={cn(
                        "h-8 w-[140px] justify-start text-left font-normal text-xs",
                        !parsed && "text-muted-foreground",
                        parsed && inheritedFields.has(f.key) && "text-muted-foreground/60",
                        readOnly && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                      {parsed ? formatAppDate(parsed) : "—"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-[99999]" align="start" side="bottom" sideOffset={4}>
                    <Calendar
                      mode="single"
                      selected={parsed}
                      defaultMonth={parsed || new Date()}
                      onSelect={(date) => {
                        setValues((prev) => ({
                          ...prev,
                          [f.key]: date ? formatAppDate(date) : null,
                        }));
                        setInheritedFields((prev) => { const next = new Set(prev); next.delete(f.key); return next; });
                        setOpenPickers((prev) => ({ ...prev, [f.key]: false }));
                      }}
                      disabled={isWeekend}
                      weekStartsOn={1}
                      className={cn("p-3 pointer-events-auto")}
                    />
                    <div className="border-t px-3 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive w-full justify-start"
                        onClick={() => {
                          setValues((prev) => ({ ...prev, [f.key]: null }));
                          setOpenPickers((prev) => ({ ...prev, [f.key]: false }));
                        }}
                      >
                        <Trash2 className="h-3 w-3 mr-1.5" />
                        Smazat datum
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {isViewer ? "Zavřít" : "Zrušit"}
          </Button>
          {!isViewer && (
            <Button size="sm" onClick={handleSave} disabled={!hasChanges}>
              Uložit
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
