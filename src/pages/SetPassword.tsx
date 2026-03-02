import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { PasswordChecklist } from "@/components/PasswordChecklist";
import { usePasswordValidation } from "@/hooks/usePasswordValidation";
import { toast } from "@/hooks/use-toast";

export default function SetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const validation = usePasswordValidation(password);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      if (!session) {
        // No session = user shouldn't be here, redirect to login
        setTimeout(() => navigate("/", { replace: true }), 2000);
      }
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validation.isValid) {
      setError("Heslo nesplňuje požadavky.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Hesla se neshodují.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError("Nepodařilo se nastavit heslo. Zkuste to znovu.");
      setLoading(false);
      return;
    }

    const { error: profileFlagError } = await supabase.rpc("mark_password_set");
    if (profileFlagError) {
      setError("Heslo bylo nastaveno, ale aktivace účtu selhala. Kontaktujte administrátora.");
      setLoading(false);
      return;
    }

    setSuccess(true);
    toast({ title: "Účet byl úspěšně nastaven" });
    setTimeout(() => navigate("/", { replace: true }), 1500);
  };

  if (hasSession === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Načítání...</p>
      </div>
    );
  }

  if (hasSession === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="bg-card border rounded-lg p-6 text-center">
          <p className="text-sm text-muted-foreground">Žádná aktivní relace. Přesměrování na přihlášení...</p>
        </div>
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
          <p className="text-sm text-muted-foreground mt-1">Project Info 2026</p>
        </div>

        {!success ? (
          <form onSubmit={handleSubmit} className="bg-card border rounded-lg p-6 space-y-4 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold">Nastavení hesla</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Vítejte! Nastavte si heslo pro svůj účet.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Nové heslo</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Alespoň 8 znaků"
                required
                autoFocus
              />
              <PasswordChecklist password={password} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Potvrdit heslo</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Zopakujte heslo"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !validation.isValid || password !== confirmPassword}
            >
              {loading ? "Ukládám..." : "Nastavit heslo"}
            </Button>
          </form>
        ) : (
          <div className="bg-card border rounded-lg p-6 text-center space-y-3">
            <p className="text-sm text-green-600">Heslo bylo nastaveno. Přesměrování...</p>
          </div>
        )}
      </div>
    </div>
  );
}
