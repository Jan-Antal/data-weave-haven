import { useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface AddItemPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  projectName?: string;
  /** All available projects for the dropdown when no project is pre-selected */
  allProjects?: { project_id: string; project_name: string }[];
}

const REASON_OPTIONS = [
  { value: "oprava", label: "Oprava / Reklamace", badge: "🔧 Oprava" },
  { value: "dodatecna", label: "Dodatečná výroba", badge: "➕ Dodatečná" },
  { value: "jine", label: "Jiné", badge: "📝 Ad-hoc" },
] as const;

export function AddItemPopover({ open, onOpenChange, projectId, projectName, allProjects }: AddItemPopoverProps) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const [reason, setReason] = useState<string>("oprava");
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || "");
  const [submitting, setSubmitting] = useState(false);

  const effectiveProjectId = projectId || selectedProjectId;

  const handleSubmit = useCallback(async () => {
    if (!effectiveProjectId || !description || !hours) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const h = parseFloat(hours);
      if (isNaN(h) || h <= 0) throw new Error("Neplatné hodiny");

      // Get hourly rate
      const { data: settings } = await supabase.from("production_settings").select("hourly_rate").limit(1).single();
      const rate = settings?.hourly_rate ?? 550;

      const { error } = await supabase.from("production_inbox").insert({
        project_id: effectiveProjectId,
        item_name: description,
        item_code: code || null,
        estimated_hours: h,
        estimated_czk: h * rate,
        sent_by: user.id,
        status: "pending",
        adhoc_reason: reason,
      });
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["production-inbox"] });
      qc.invalidateQueries({ queryKey: ["production-progress"] });
      toast({ title: "Položka přidána do Inboxu" });
      onOpenChange(false);
      setCode("");
      setDescription("");
      setHours("");
      setReason("oprava");
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
    setSubmitting(false);
  }, [effectiveProjectId, description, hours, reason, code, qc, onOpenChange]);

  const displayName = projectName || allProjects?.find(p => p.project_id === selectedProjectId)?.project_name || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[360px] p-0 gap-0" style={{ borderRadius: 12 }}>
        <div className="px-5 pt-5 pb-2">
          <div className="text-[13px] font-semibold" style={{ color: "#223937" }}>
            ➕ Nová položka {displayName && `· ${displayName}`}
          </div>
        </div>

        <div className="px-5 pb-3 space-y-2.5">
          {/* Project dropdown when no project pre-selected */}
          {!projectId && allProjects && (
            <div>
              <label className="text-[10px] font-semibold block mb-1" style={{ color: "#6b7a78" }}>Projekt</label>
              <select
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                className="w-full text-[11px] px-2.5 py-1.5 rounded-md bg-transparent outline-none"
                style={{ border: "1px solid #e2ddd6", color: "#223937" }}
              >
                <option value="">Vyberte projekt...</option>
                {allProjects.map(p => (
                  <option key={p.project_id} value={p.project_id}>{p.project_name} ({p.project_id})</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: "#6b7a78" }}>Kód</label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="např. TK.99"
              className="w-full text-[11px] px-2.5 py-1.5 rounded-md bg-transparent outline-none font-sans"
              style={{ border: "1px solid #e2ddd6", color: "#223937" }}
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: "#6b7a78" }}>Popis *</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Název položky"
              className="w-full text-[11px] px-2.5 py-1.5 rounded-md bg-transparent outline-none"
              style={{ border: "1px solid #e2ddd6", color: "#223937" }}
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: "#6b7a78" }}>Hodiny *</label>
            <input
              type="number"
              value={hours}
              onChange={e => setHours(e.target.value)}
              placeholder="0"
              min={1}
              className="w-full text-[11px] px-2.5 py-1.5 rounded-md bg-transparent outline-none font-sans"
              style={{ border: "1px solid #e2ddd6", color: "#223937" }}
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold block mb-1" style={{ color: "#6b7a78" }}>Důvod</label>
            <div className="space-y-1">
              {REASON_OPTIONS.map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={reason === opt.value}
                    onChange={() => setReason(opt.value)}
                    className="accent-green-700"
                  />
                  <span className="text-[10px]" style={{ color: "#223937" }}>{opt.label}</span>
                </label>
              ))}
            </div>
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
            onClick={handleSubmit}
            disabled={!effectiveProjectId || !description || !hours || submitting}
            className="px-3 py-1.5 text-[11px] font-semibold rounded-md text-white transition-colors"
            style={{
              backgroundColor: (!effectiveProjectId || !description || !hours) ? "#99a5a3" : "#3a8a36",
              cursor: (!effectiveProjectId || !description || !hours) ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Přidávám..." : "Přidat"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function getAdhocBadge(reason: string | null): { emoji: string; label: string } | null {
  if (!reason) return null;
  if (reason === "oprava") return { emoji: "🔧", label: "Oprava" };
  if (reason === "dodatecna") return { emoji: "➕", label: "Dodatečná" };
  if (reason === "jine") return { emoji: "📝", label: "Ad-hoc" };
  return { emoji: "📝", label: "Ad-hoc" };
}
