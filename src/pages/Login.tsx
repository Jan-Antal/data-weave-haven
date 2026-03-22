import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Eye, EyeOff } from "lucide-react";

type View = "login" | "magic" | "magic-sent";

export default function Login() {
  const { signIn } = useAuth();
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="bg-background flex items-center justify-center px-4" style={{ minHeight: '100svh' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/images/AM-Interior-orange.svg" alt="AM Interior" style={{ height: '32px', width: 'auto', margin: '0 auto' }} />
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
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => { setError(null); setView("magic"); }}
              className="text-[12px] text-muted-foreground hover:underline hover:text-foreground transition-colors"
            >
              Přihlásit se odkazem
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
