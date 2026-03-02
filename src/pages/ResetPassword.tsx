import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordChecklist } from "@/components/PasswordChecklist";
import { usePasswordValidation } from "@/hooks/usePasswordValidation";
import { toast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const validation = usePasswordValidation(newPassword);

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event from Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    // Also check if we already have a session (user clicked the link)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validation.isValid) {
      setError("Heslo nesplňuje požadavky");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Hesla se neshodují");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError(updateError.message);
    } else {
      const { error: profileFlagError } = await supabase.rpc("mark_password_set");
      if (profileFlagError) {
        setError("Heslo bylo změněno, ale aktivace účtu selhala. Kontaktujte administrátora.");
        setLoading(false);
        return;
      }

      toast({ title: "Heslo bylo úspěšně změněno" });
      setTimeout(() => navigate("/"), 2000);
    }
    setLoading(false);
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <p className="text-muted-foreground">Ověřování odkazu…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-serif text-foreground tracking-wide">
            A→M <span className="font-sans font-normal text-lg opacity-70">Interior</span>
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border rounded-lg p-6 space-y-4 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold">Nastavení nového hesla</h2>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">Nové heslo</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoFocus
            />
            <PasswordChecklist password={newPassword} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Potvrzení hesla</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !validation.isValid || newPassword !== confirmPassword}
          >
            {loading ? "Ukládám..." : "Uložit nové heslo"}
          </Button>
        </form>
      </div>
    </div>
  );
}
