import { useState, useEffect, useCallback } from "react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseAppDate, formatAppDate } from "@/lib/dateFormat";
import { useUpdateStage, type ProjectStage } from "@/hooks/useProjectStages";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { useAuth } from "@/hooks/useAuth";

interface MobileStageDetailSheetProps {
  stage: ProjectStage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MILESTONE_FIELDS = [
  { key: "zamereni", label: "Zaměření" },
  { key: "tpv_date", label: "TPV" },
  { key: "expedice", label: "Expedice" },
  { key: "montaz", label: "Montáž" },
  { key: "predani", label: "Předání" },
] as const;

type FieldKey = "zamereni" | "tpv_date" | "expedice" | "montaz" | "predani" | "datum_smluvni" | "status" | "notes";

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = parseAppDate(dateStr);
  if (!d) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function DateUrgencyBadge({ dateStr }: { dateStr: string | null | undefined }) {
  const days = daysUntil(dateStr);
  if (days === null) return null;
  if (days < 0)
    return <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">⚠ Po termínu {Math.abs(days)} dní</span>;
  if (days <= 7)
    return <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">⚠ Za {days} dní</span>;
  return null;
}

function DateField({ value, onChange, label, disabled }: { value: string | null; onChange: (v: string | null) => void; label: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const parsed = value ? parseAppDate(value) : null;
  const display = parsed ? formatAppDate(parsed) : "—";

  if (disabled) {
    return (
      <div className="flex items-center justify-between py-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm">{display}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-1.5 text-sm hover:text-primary transition-colors min-h-[32px]">
            <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
            {display}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={parsed || undefined}
            defaultMonth={parsed || undefined}
            onSelect={(date) => {
              if (date) {
                const yyyy = date.getFullYear();
                const mm = String(date.getMonth() + 1).padStart(2, "0");
                const dd = String(date.getDate()).padStart(2, "0");
                onChange(`${yyyy}-${mm}-${dd}`);
              }
              setOpen(false);
            }}
            className={cn("p-3 pointer-events-auto")}
          />
          {value && (
            <div className="px-3 pb-2">
              <Button variant="ghost" size="sm" className="w-full text-xs text-destructive" onClick={() => { onChange(null); setOpen(false); }}>
                Smazat datum
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function MobileStageDetailSheet({ stage, open, onOpenChange }: MobileStageDetailSheetProps) {
  const updateStage = useUpdateStage();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const { isViewer } = useAuth();
  const canEdit = !isViewer;

  // Local state for editable fields
  const [status, setStatus] = useState(stage?.status || "");
  const [datumSmluvni, setDatumSmluvni] = useState(stage?.datum_smluvni || null);
  const [notes, setNotes] = useState(stage?.notes || "");
  const [milestones, setMilestones] = useState<Record<string, string | null>>({});

  // Reset state when stage changes
  useEffect(() => {
    if (stage) {
      setStatus(stage.status || "");
      setDatumSmluvni(stage.datum_smluvni || null);
      setNotes(stage.notes || "");
      setMilestones({
        zamereni: stage.zamereni || null,
        tpv_date: stage.tpv_date || null,
        expedice: stage.expedice || null,
        montaz: stage.montaz || null,
        predani: stage.predani || null,
      });
    }
  }, [stage]);

  const saveField = useCallback((field: string, value: any) => {
    if (!stage) return;
    const oldValue = (stage as any)[field] ?? "";
    if (String(value ?? "") === String(oldValue ?? "")) return;
    updateStage.mutate({
      id: stage.id,
      field,
      value,
      projectId: stage.project_id,
      oldValue: String(oldValue),
      stageName: stage.stage_name,
    });
  }, [stage, updateStage]);

  const handleStatusChange = useCallback((v: string) => {
    setStatus(v);
    saveField("status", v);
  }, [saveField]);

  const handleDatumSmluvniChange = useCallback((v: string | null) => {
    setDatumSmluvni(v);
    saveField("datum_smluvni", v);
  }, [saveField]);

  const handleMilestoneChange = useCallback((key: string, v: string | null) => {
    setMilestones(prev => ({ ...prev, [key]: v }));
    saveField(key, v);
  }, [saveField]);

  const handleNotesSave = useCallback(() => {
    saveField("notes", notes);
  }, [notes, saveField]);

  if (!stage) return null;

  const stageDisplayName = stage.display_name || stage.stage_name;
  const stageId = stage.project_id + "-" + stage.stage_name.replace(/^Etapa\s*/i, "");

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[50vh]">
        <div className="flex items-start justify-between px-4 pt-2 pb-1">
          <DrawerHeader className="p-0 text-left flex-1 min-w-0">
            <DrawerTitle className="text-base font-semibold truncate">{stageDisplayName}</DrawerTitle>
            <p className="text-xs text-muted-foreground font-sans mt-0.5">{stage.project_id}</p>
          </DrawerHeader>
          <DrawerClose asChild>
            <button className="p-1.5 rounded-md hover:bg-muted transition-colors shrink-0 mt-0.5">
              <X className="h-4 w-4" />
            </button>
          </DrawerClose>
        </div>

        <div className="overflow-y-auto px-4 pb-4 space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Status</span>
            {canEdit ? (
              <Select value={status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue>
                    {status ? <StatusBadge status={status} /> : "—"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(opt => (
                    <SelectItem key={opt.id} value={opt.label} className="text-xs">
                      <StatusBadge status={opt.label} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <StatusBadge status={status || "—"} />
            )}
          </div>

          {/* Datum Smluvní */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Datum Smluvní</span>
              <DateUrgencyBadge dateStr={datumSmluvni} />
            </div>
            <DateField value={datumSmluvni} onChange={handleDatumSmluvniChange} label="" disabled={!canEdit} />
          </div>

          {/* Milníky */}
          <div>
            <span className="text-sm font-medium">Milníky</span>
            <div className="mt-1 divide-y divide-border">
              {MILESTONE_FIELDS.map(({ key, label }) => (
                <DateField
                  key={key}
                  value={milestones[key] ?? null}
                  onChange={(v) => handleMilestoneChange(key, v)}
                  label={label}
                  disabled={!canEdit}
                />
              ))}
            </div>
          </div>

          {/* Poznámka */}
          <div>
            <span className="text-sm font-medium">Poznámka</span>
            {canEdit ? (
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleNotesSave}
                className="mt-1 text-sm min-h-[60px]"
                placeholder="Poznámka k etapě..."
              />
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{notes || "—"}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="px-4 py-3 border-t">
            <Button
              className="w-full"
              onClick={() => onOpenChange(false)}
            >
              Zavřít
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
