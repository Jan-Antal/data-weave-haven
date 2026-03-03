import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import type { ScheduleItem } from "@/hooks/useProductionSchedule";

interface CompletionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  projectId: string;
  weekLabel: string;
  items: ScheduleItem[];
  preCheckedIds?: string[];
}

export function CompletionDialog({
  open,
  onOpenChange,
  projectName,
  projectId,
  weekLabel,
  items,
  preCheckedIds,
}: CompletionDialogProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    new Set(preCheckedIds ?? [])
  );
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const toggleItem = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleComplete = useCallback(async () => {
    if (checkedIds.size === 0) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const ids = Array.from(checkedIds);
      const { error } = await supabase
        .from("production_schedule")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          completed_by: user.id,
        })
        .in("id", ids);
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["production-schedule"] });
      qc.invalidateQueries({ queryKey: ["production-expedice"] });
      qc.invalidateQueries({ queryKey: ["production-inbox"] });

      toast({ title: `${ids.length} položek přesunuto do Expedice` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  }, [checkedIds, qc, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[380px] p-0 gap-0"
        style={{ borderRadius: 12 }}
      >
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-[14px] font-semibold" style={{ color: "#223937" }}>
            {projectName} ({projectId})
          </DialogTitle>
          <DialogDescription className="text-[11px] font-mono" style={{ color: "#99a5a3" }}>
            {weekLabel}
          </DialogDescription>
        </DialogHeader>

        {/* Select all / Deselect all */}
        {(() => {
          const uncompleted = items.filter((i) => i.status !== "completed");
          const allChecked = uncompleted.length > 0 && uncompleted.every((i) => checkedIds.has(i.id));
          return uncompleted.length > 1 ? (
            <div className="px-5 pb-1.5">
              <label
                className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8f7f5")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={() => {
                    if (allChecked) {
                      setCheckedIds(new Set());
                    } else {
                      setCheckedIds(new Set(uncompleted.map((i) => i.id)));
                    }
                  }}
                />
                <span className="text-[11px] font-semibold" style={{ color: "#6b7a78" }}>
                  {allChecked ? "Odznačit vše" : "Vybrat vše"}
                </span>
                <span className="font-mono text-[10px] ml-auto" style={{ color: "#99a5a3" }}>
                  {checkedIds.size}/{uncompleted.length}
                </span>
              </label>
            </div>
          ) : null;
        })()}

        <div className="px-5 pb-3 space-y-1.5 max-h-[300px] overflow-y-auto">
          {items.map((item) => {
            const isCompleted = item.status === "completed";
            return (
              <label
                key={item.id}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer transition-colors"
                style={{ border: "1px solid #ece8e2" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8f7f5")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                <Checkbox
                  checked={isCompleted || checkedIds.has(item.id)}
                  disabled={isCompleted}
                  onCheckedChange={() => !isCompleted && toggleItem(item.id)}
                />
                {item.item_code && (
                  <span className="font-mono text-[10px] shrink-0" style={{ color: "#223937" }}>
                    {item.item_code}
                  </span>
                )}
                <span className="text-[11px] flex-1 truncate" style={{ color: "#6b7a78" }}>
                  {item.item_name}
                </span>
                <span className="font-mono text-[10px] shrink-0" style={{ color: "#6b7a78" }}>
                  {item.scheduled_hours}h
                </span>
                {isCompleted ? (
                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(58,138,54,0.12)", color: "#3a8a36" }}>
                    ✓ Hotovo
                  </span>
                ) : (
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(217,151,6,0.12)", color: "#d97706" }}>
                    Ve výrobě
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid #ece8e2" }}>
          <button
            onClick={() => onOpenChange(false)}
            className="px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors"
            style={{ color: "#6b7a78", border: "1px solid #e2ddd6" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f0eee9")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            Zavřít
          </button>
          <button
            onClick={handleComplete}
            disabled={checkedIds.size === 0 || submitting}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-md text-white transition-colors"
            style={{
              backgroundColor: checkedIds.size === 0 ? "#99a5a3" : "#3a8a36",
              cursor: checkedIds.size === 0 ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Ukládám..." : `Dokončit vybrané → Expedice`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
