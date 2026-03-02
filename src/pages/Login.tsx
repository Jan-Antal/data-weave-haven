import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";

type View = "login" | "magic" | "magic-sent";

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

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
    } else {
      setView("magic-sent");
    }
    setLoading(false);
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
          <div className="space-y-4">
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

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">
                  Nesprávný email nebo heslo
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Přihlašování..." : "Přihlásit se"}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative flex items-center">
              <div className="flex-grow border-t border-border" />
              <span className="mx-3 text-xs text-muted-foreground">nebo</span>
              <div className="flex-grow border-t border-border" />
            </div>

            {/* Magic link button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { setError(null); setView("magic"); }}
            >
              Přihlásit se odkazem
            </Button>
          </div>
        )}

        {view === "magic" && (
          <form onSubmit={handleMagicLink} className="bg-card border rounded-lg p-6 space-y-4 shadow-sm">
            <div>
              <h2 className="text-lg font-semibold">Přihlášení odkazem</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Zadejte svůj email a pošleme vám přihlašovací odkaz.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="magic-email">Email</Label>
              <Input
                id="magic-email"
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
              {loading ? "Odesílám..." : "Odeslat přihlašovací odkaz"}
            </Button>

            <button
              type="button"
              onClick={() => { setError(null); setView("login"); }}
              className="text-[12px] text-muted-foreground hover:underline hover:text-foreground transition-colors w-full text-center"
            >
              Zpět na přihlášení heslem
            </button>
          </form>
        )}

        {view === "magic-sent" && (
          <div className="bg-card border rounded-lg p-6 space-y-3 shadow-sm text-center">
            <div className="flex justify-center">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Check className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="text-sm text-foreground font-medium">
              Přihlašovací odkaz byl odeslán na váš email.
            </p>
            <button
              type="button"
              onClick={() => setView("login")}
              className="text-[12px] text-muted-foreground hover:underline hover:text-foreground transition-colors"
            >
              Zpět na přihlášení heslem
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
