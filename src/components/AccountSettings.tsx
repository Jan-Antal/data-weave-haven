import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAllPeople } from "@/hooks/usePeople";
import { useUserPreferences, useUpsertPreferences } from "@/hooks/useUserPreferences";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  pm: "PM",
  konstrukter: "Konstruktér",
  viewer: "Viewer",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-100 text-purple-800 border-purple-200",
  admin: "bg-blue-100 text-blue-800 border-blue-200",
  pm: "bg-green-100 text-green-800 border-green-200",
  konstrukter: "bg-amber-100 text-amber-800 border-amber-200",
  viewer: "bg-gray-100 text-gray-700 border-gray-200",
};

function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="relative flex items-center mt-5 mb-3">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-border" />
      </div>
      <span className="relative bg-background pr-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground flex items-center gap-1.5">
        <span className="text-[18px] leading-none">{icon}</span> {label}
      </span>
    </div>
  );
}

interface AccountSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountSettings({ open, onOpenChange }: AccountSettingsProps) {
  const { user, profile, role } = useAuth();
  const { data: allPeople = [] } = useAllPeople();
  const { data: prefs } = useUserPreferences();
  const upsertPrefs = useUpsertPreferences();
  const qc = useQueryClient();

  // Profile
  const [fullName, setFullName] = useState("");

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Preferences
  const [defaultPerson, setDefaultPerson] = useState<string>("__all__");
  const [defaultView, setDefaultView] = useState("project-info");

  const [saving, setSaving] = useState(false);

  // Deduplicated person names for dropdown
  const personNames = [...new Set(allPeople.map((p) => p.name))].sort((a, b) =>
    a.localeCompare(b, "cs")
  );

  useEffect(() => {
    if (open) {
      setFullName(profile?.full_name || "");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError("");
      setDefaultPerson(prefs?.default_person_filter || "__all__");
      setDefaultView(prefs?.default_view || "project-info");
    }
  }, [open, profile, prefs]);

  const handleChangePassword = async () => {
    setPasswordError("");
    if (!currentPassword) {
      setPasswordError("Zadejte současné heslo");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Nové heslo musí mít alespoň 8 znaků");
      return;
    }
    if (newPassword.length > 72) {
      setPasswordError("Nové heslo může mít maximálně 72 znaků");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Hesla se neshodují");
      return;
    }

    setPasswordLoading(true);
    try {
      // Verify current password by re-signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: currentPassword,
      });
      if (signInError) {
        setPasswordError("Současné heslo není správné");
        setPasswordLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordError(error.message);
      } else {
        toast({ title: "Heslo bylo změněno" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err: any) {
      setPasswordError(err.message || "Chyba při změně hesla");
    }
    setPasswordLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update profile name
      if (fullName.trim() && fullName.trim() !== profile?.full_name) {
        const { error } = await supabase
          .from("profiles")
          .update({ full_name: fullName.trim() })
          .eq("id", user!.id);
        if (error) throw error;
      }

      // Save preferences
      await upsertPrefs.mutateAsync({
        default_person_filter: defaultPerson === "__all__" ? null : defaultPerson,
        default_view: defaultView,
      });

      // Refresh profile in auth context
      qc.invalidateQueries({ queryKey: ["people"] });
      // Force re-fetch of auth state
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        // Trigger auth state refresh
        window.dispatchEvent(new Event("profile-updated"));
      }

      toast({ title: "Nastavení uloženo" });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[500px] max-h-[78vh] flex flex-col gap-0 p-0 overflow-hidden"
        style={{ zIndex: 99999 }}
      >
        <div className="px-5 pt-5 pb-3 border-b">
          <h2 className="text-lg font-semibold">Nastavení účtu</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {/* PROFIL */}
          <SectionHeader icon="👤" label="Profil" />
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Jméno</Label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                value={user?.email || ""}
                disabled
                className="h-9 bg-muted text-muted-foreground cursor-not-allowed opacity-70"
              />
            </div>
            <div>
              <Label className="text-xs">Role</Label>
              <div className="mt-1">
                <Badge
                  variant="outline"
                  className={`text-xs font-medium ${ROLE_COLORS[role || "viewer"]}`}
                >
                  {ROLE_LABELS[role || "viewer"] || role}
                </Badge>
              </div>
            </div>
          </div>

          {/* ZMĚNA HESLA */}
          <SectionHeader icon="🔑" label="Změna hesla" />
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Současné heslo</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Nové heslo</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Potvrzení hesla</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-9"
              />
            </div>
            {passwordError && (
              <p className="text-xs text-destructive">{passwordError}</p>
            )}
            <Button
              size="sm"
              onClick={handleChangePassword}
              disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
            >
              {passwordLoading ? "Měním heslo..." : "Změnit heslo"}
            </Button>
          </div>

          {/* PŘEDVOLBY */}
          <SectionHeader icon="⚙" label="Předvolby" />
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Výchozí osoba</Label>
              <Select value={defaultPerson} onValueChange={setDefaultPerson}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Všechny osoby</SelectItem>
                  {personNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Výchozí zobrazení</Label>
              <Select value={defaultView} onValueChange={setDefaultView}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project-info">Project Info</SelectItem>
                  <SelectItem value="pm-status">PM Status</SelectItem>
                  <SelectItem value="tpv-status">TPV Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Jazyk</Label>
              <Select value="cs" disabled>
                <SelectTrigger className="h-9 opacity-60">
                  <SelectValue placeholder="Čeština" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cs">Čeština</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">
                Další jazyky — v přípravě
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Ukládám..." : "Uložit"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
