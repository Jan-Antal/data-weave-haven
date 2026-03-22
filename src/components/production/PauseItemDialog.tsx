import { useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { logActivity } from "@/lib/activityLog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PauseItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: string;
  itemName: string;
  itemCode?: string | null;
  source: "schedule" | "inbox";
}

const REASON_OPTIONS = [
  { value: "material", label: "Čeká na materiál", short: "Materiál" },
  { value: "subdodavka", label: "Čeká na subdodávku", short: "Subdodávka" },
  { value: "klient", label: "Čeká na rozhodnutí klienta", short: "Klient" },
  { value: "jine", label: "Jiné", short: "Jiné" },
] as const;

export function PauseItemDialog({ open, onOpenChange, itemId, itemName, itemCode, source }: PauseItemDialogProps) {
  const qc = useQueryClient();
  const { pushUndo } = useUndoRedo();
  const [reason, setReason] = useState("material");
  const [customReason, setCustomReason] = useState("");
  const [expectedDate, setExpectedDate] = useState<Date | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const handlePause = useCallback(async () => {
    setSubmitting(true);
    try {
      const pauseReason = reason === "jine" ? (customReason || "Jiné") : REASON_OPTIONS.find(r => r.value === reason)?.short || reason;
      const pauseData = {
        status: "paused" as const,
        pause_reason: pauseReason,
        pause_expected_date: expectedDate ? expectedDate.toISOString().split("T")[0] : null,
      };

      if (source === "schedule") {
        // Support multiple IDs (comma-separated for bundle pause)
        const ids = itemId.split(",").map(id => id.trim()).filter(Boolean);

        // Collect all split siblings for each item
        const allIds = new Set(ids);
        for (const id of ids) {
          const { data: item } = await supabase.from("production_schedule").select("split_group_id").eq("id", id).single();
          if (item?.split_group_id) {
            const { data: siblings } = await supabase.from("production_schedule")
              .select("id")
              .or(`split_group_id.eq.${item.split_group_id},id.eq.${item.split_group_id}`)
              .in("status", ["scheduled", "in_progress"]);
            if (siblings) siblings.forEach(s => allIds.add(s.id));
          }
        }

        const { error } = await supabase.from("production_schedule").update(pauseData).in("id", Array.from(allIds));
        if (error) throw error;
      } else {
        throw new Error("Inbox items cannot be paused - schedule them first");
      }

      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["production-inbox"] });
      qc.invalidateQueries({ queryKey: ["production-progress"] });

      // Log activity
      logActivity({
        projectId: "_production_",
        actionType: "item_paused",
        oldValue: "Naplánováno",
        newValue: "Pozastaveno",
        detail: JSON.stringify({ item_name: itemName, item_code: itemCode, pause_reason: pauseReason, pause_expected_date: expectedDate?.toISOString().split("T")[0] }),
      });

      toast({ title: `⏸ ${itemName} pozastaveno` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  }, [reason, customReason, expectedDate, itemId, itemName, source, qc, onOpenChange]);

  const cleanName = itemName.replace(/\s*\((\d+\/\d+)\)$/, "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[360px] p-0 gap-0" style={{ borderRadius: 12 }}>
        <div className="px-5 pt-5 pb-2">
          <div className="text-[13px] font-semibold" style={{ color: "#223937" }}>
            ⏸ Pozastavit: {cleanName}
          </div>
          {itemCode && (
            <div className="text-[11px] font-sans mt-0.5" style={{ color: "#99a5a3" }}>{itemCode}</div>
          )}
        </div>

        <div className="px-5 pb-3 space-y-2.5">
          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: "#6b7a78" }}>Důvod</label>
            <div className="space-y-1">
              {REASON_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={reason === opt.value}
                    onChange={() => setReason(opt.value)}
                    className="accent-amber-600"
                  />
                  <span className="text-[10px]" style={{ color: "#223937" }}>{opt.label}</span>
                </label>
              ))}
            </div>
            {reason === "jine" && (
              <input
                type="text"
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                placeholder="Vlastní důvod..."
                className="w-full text-[11px] px-2.5 py-1.5 rounded-md bg-transparent outline-none mt-1.5"
                style={{ border: "1px solid #e2ddd6", color: "#223937" }}
              />
            )}
          </div>

          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: "#6b7a78" }}>
              Očekávané uvolnění (volitelné)
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-md text-left",
                    !expectedDate && "text-muted-foreground"
                  )}
                  style={{ border: "1px solid #e2ddd6", color: expectedDate ? "#223937" : "#99a5a3" }}
                >
                  <CalendarIcon className="h-3 w-3" />
                  {expectedDate ? format(expectedDate, "d.M.yyyy") : "Vyberte datum"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[99999]" align="start">
                <Calendar
                  mode="single"
                  selected={expectedDate}
                  onSelect={setExpectedDate}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                  weekStartsOn={1}
                  disabled={(date) => date.getDay() === 0 || date.getDay() === 6}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid #ece8e2" }}>
          <button
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors"
            style={{ color: "#6b7a78", border: "1px solid #e2ddd6" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f0eee9")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            Zrušit
          </button>
          <button
            onClick={handlePause}
            disabled={submitting}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-md text-white transition-colors"
            style={{
              backgroundColor: "#d97706",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Pozastavuji..." : "Pozastavit"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function getPauseShortLabel(reason: string | null): string {
  if (!reason) return "Pozastaveno";
  return reason;
}
