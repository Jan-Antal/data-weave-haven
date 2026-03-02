import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * /auth/callback
 * Handles the redirect from Supabase auth (invite, recovery, signup).
 * Supabase appends tokens as URL hash fragments after /verify redirect.
 * This page extracts them, sets the session, and redirects.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Parse hash fragment: #access_token=...&refresh_token=...&type=invite
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const type = params.get("type");
        const errorCode = params.get("error_code") || params.get("error");
        const errorDescription = params.get("error_description");

        // Handle error in hash (e.g. expired link)
        if (errorCode) {
          setError(errorDescription || "Odkaz je neplatný nebo vypršel.");
          setProcessing(false);
          return;
        }

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            setError("Nepodařilo se ověřit odkaz. Zkuste to znovu.");
            setProcessing(false);
            return;
          }

          // Redirect based on type
          if (type === "invite" || type === "recovery") {
            navigate("/set-password", { replace: true });
          } else {
            navigate("/", { replace: true });
          }
          return;
        }

        // If no tokens in hash, check if Supabase already processed them via onAuthStateChange
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          navigate("/set-password", { replace: true });
          return;
        }

        // Wait a moment for Supabase client to process the hash
        await new Promise((r) => setTimeout(r, 2000));
        const { data: { session: retrySession } } = await supabase.auth.getSession();
        if (retrySession) {
          navigate("/set-password", { replace: true });
          return;
        }

        setError("Odkaz je neplatný nebo vypršel.");
        setProcessing(false);
      } catch (e) {
        setError("Došlo k neočekávané chybě.");
        setProcessing(false);
      }
    };

    handleCallback();
  }, [navigate]);

  if (processing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-serif text-foreground tracking-wide">
              A→M <span className="font-sans font-normal text-lg opacity-70">Interior</span>
            </h1>
          </div>
          <div className="bg-card border rounded-lg p-6">
            <p className="text-muted-foreground">Ověřování odkazu...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <ExpiredLinkHandler errorMessage={error} />
      </div>
    );
  }

  return null;
}

function ExpiredLinkHandler({ errorMessage }: { errorMessage: string }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    // Use signUp resend or just inform user to contact admin
    // Since we can't call admin.inviteUserByEmail from client, we show contact info
    await supabase.auth.resend({ type: "signup", email: email.trim() });
    setSending(false);
    setSent(true);
  };

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-serif text-foreground tracking-wide">
          A→M <span className="font-sans font-normal text-lg opacity-70">Interior</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Project Info 2026</p>
      </div>

      <div className="bg-card border rounded-lg p-6 space-y-4 shadow-sm">
        <div className="text-center">
          <p className="text-sm font-medium text-destructive">{errorMessage}</p>
        </div>

        {!sent ? (
          <form onSubmit={handleResend} className="space-y-3">
            <p className="text-xs text-muted-foreground text-center">
              Zadejte svůj email a pokusíme se odeslat nový odkaz. Případně kontaktujte administrátora.
            </p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vas@email.cz"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <Button type="submit" className="w-full" size="sm" disabled={sending}>
              {sending ? "Odesílám..." : "Požádat o nový odkaz"}
            </Button>
          </form>
        ) : (
          <div className="text-center space-y-2">
            <p className="text-sm text-green-600">
              Pokud je váš email v systému, nový odkaz byl odeslán.
            </p>
            <p className="text-xs text-muted-foreground">
              Pokud odkaz neobdržíte, kontaktujte administrátora.
            </p>
          </div>
        )}

        <div className="text-center pt-2 border-t">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="text-[12px] text-muted-foreground hover:underline hover:text-foreground transition-colors"
          >
            Zpět na přihlášení
          </button>
        </div>
      </div>
    </div>
  );
}
