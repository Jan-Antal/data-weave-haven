import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";

type View = "login" | "forgot" | "sent";

export default function Login() {
  const { signIn } = useAuth();
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError(error);
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    setView("sent");
    setTimeout(() => setView("login"), 5000);
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

        {view === "login" && (
          <form onSubmit={handleLogin} className="bg-card border rounded-lg p-6 space-y-4 shadow-sm">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vas@email.cz"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Heslo</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="button"
              onClick={() => { setError(null); setView("forgot"); }}
              className="text-[12px] text-muted-foreground hover:underline hover:text-foreground transition-colors"
            >
              Zapomenuté heslo?
            </button>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
                Nesprávný email nebo heslo
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Přihlašování..." : "Přihlásit se"}
            </Button>
          </form>
        )}

        {view === "forgot" && (
          <form onSubmit={handleForgot} className="bg-card border rounded-lg p-6 space-y-4 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold">Obnovení hesla</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Zadejte svůj email a pošleme vám odkaz pro obnovení hesla.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vas@email.cz"
                required
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Odesílám..." : "Odeslat odkaz"}
            </Button>

            <button
              type="button"
              onClick={() => { setError(null); setView("login"); }}
              className="text-[12px] text-muted-foreground hover:underline hover:text-foreground transition-colors w-full text-center"
            >
              Zpět na přihlášení
            </button>
          </form>
        )}

        {view === "sent" && (
          <div className="bg-card border rounded-lg p-6 space-y-3 shadow-sm text-center">
            <div className="flex justify-center">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-5 w-5 text-green-600" />
              </div>
            </div>
            <p className="text-sm text-foreground font-medium">
              Odkaz pro obnovení hesla byl odeslán na váš email.
            </p>
            <button
              type="button"
              onClick={() => setView("login")}
              className="text-[12px] text-muted-foreground hover:underline hover:text-foreground transition-colors"
            >
              Zpět na přihlášení
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
