import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";

interface NotificationSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PREFS = [
  { key: "project_changed", label: "Změna projektu", desc: "Status, cena nebo termín byl upraven" },
  { key: "qc_defect", label: "QC vada", desc: "Byla zaznamenaná vada kvality na projektu" },
  { key: "project_created", label: "Nový projekt", desc: "Byl vytvořen nebo přiřazen nový projekt" },
  { key: "daylog_missing", label: "Chybějící Day Log", desc: "Do 15:00 nebyl zaznamenán denní log výroby" },
  { key: "konstrukter_assigned", label: "Priradenie prvku (Konštruktér)", desc: "Bol si priradený na prvky projektu" },
  { key: "konstrukter_item_changed", label: "Zmena prvku (Konštruktér)", desc: "Status, počet alebo poznámka prvku bola zmenená" },
  { key: "pm_assigned", label: "Priradenie projektu (PM)", desc: "Bol si priradený alebo odobraný z projektu" },
  { key: "tpv_items_added", label: "Nové TPV položky (PM)", desc: "Boli pridané alebo odobrané položky z projektu" },
  { key: "low_margin", label: "Nízká marže (pod 15%)", desc: "Marže projektu byla nastavena pod 15%", adminOnly: true },
];

const DEFAULT_PREFS: Record<string, boolean> = {
  project_changed: true,
  qc_defect: true,
  project_created: true,
  daylog_missing: true,
  konstrukter_assigned: true,
  konstrukter_item_changed: true,
  pm_assigned: true,
  tpv_items_added: true,
  low_margin: true,
};

export function NotificationSettings({ open, onOpenChange }: NotificationSettingsProps) {
  const { user, isAdmin, isOwner } = useAuth();
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<Record<string, boolean>>(DEFAULT_PREFS);

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("user_preferences")
        .select("notification_prefs")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.notification_prefs) {
        setPrefs({ ...DEFAULT_PREFS, ...data.notification_prefs });
      }
    })();
  }, [open, user?.id]);

  const toggle = async (key: string) => {
    if (!user) return;
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    await (supabase as any)
      .from("user_preferences")
      .upsert(
        { user_id: user.id, notification_prefs: updated, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );
    qc.invalidateQueries({ queryKey: ["user_preferences"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nastavení notifikací</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {PREFS.map((p) => (
            <div key={p.key} className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{p.label}</p>
                <p className="text-xs text-muted-foreground">{p.desc}</p>
              </div>
              <Switch
                checked={prefs[p.key] ?? true}
                onCheckedChange={() => toggle(p.key)}
              />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
