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
];

const DEFAULT_PREFS = {
  project_changed: true,
  qc_defect: true,
  project_created: true,
  daylog_missing: true,
};

export function NotificationSettings({ open, onOpenChange }: NotificationSettingsProps) {
  const { user } = useAuth();
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
