import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";

export default function AcceptInvite() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase automatically picks up the token from the URL hash
    // and establishes a session when the page loads.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session) {
          setTokenValid(true);
        }
      }
    );

    // Check if there's already a session (token was processed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setTokenValid(true);
      } else {
        // Wait a moment for token processing
        setTimeout(async () => {
          const { data: { session: s } } = await supabase.auth.getSession();
          setTokenValid(!!s);
        }, 1500);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Heslo musí mít alespoň 8 znaků.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Hesla se neshodují.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError("Nepodařilo se nastavit heslo. Odkaz mohl vypršet. Kontaktujte administrátora.");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setTimeout(() => navigate("/"), 1500);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-serif text-foreground tracking-wide">
            A→M <span className="font-sans font-normal text-lg opacity-70">Interior</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Project Info 2026</p>
        </div>

        {tokenValid === null && (
          <div className="bg-card border rounded-lg p-6 text-center">
            <p className="text-muted-foreground">Ověřování odkazu...</p>
          </div>
        )}

        {tokenValid === false && (
          <div className="bg-card border rounded-lg p-6 text-center space-y-3">
            <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
              Odkaz je neplatný nebo vypršel. Kontaktujte administrátora pro novou pozvánku.
            </p>
          </div>
        )}

        {tokenValid && !success && (
          <form onSubmit={handleSubmit} className="bg-card border rounded-lg p-6 space-y-4 shadow-sm">
            <p className="text-sm text-muted-foreground">
              Nastavte si heslo pro přístup do aplikace.
            </p>

            <div className="space-y-2">
              <Label htmlFor="password">Heslo</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Alespoň 8 znaků"
                required
                autoFocus
              />
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

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Ukládám..." : "Nastavit heslo"}
            </Button>
          </form>
        )}

        {success && (
          <div className="bg-card border rounded-lg p-6 text-center space-y-3">
            <p className="text-sm text-green-600">Heslo bylo nastaveno. Přesměrování...</p>
          </div>
        )}
      </div>
    </div>
  );
}
