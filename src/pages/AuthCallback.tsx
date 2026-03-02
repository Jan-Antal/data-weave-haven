import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CallbackType = "invite" | "recovery" | "signup" | null;

const INVALID_LINK_MESSAGE = "Odkaz je neplatný nebo vypršel.";

const getCallbackType = (): CallbackType => {
  const queryParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const type = hashParams.get("type") || queryParams.get("type");

  if (type === "invite" || type === "recovery" || type === "signup") return type;
  return null;
};

const shouldForceSetPassword = async (userId: string): Promise<boolean> => {
  const { data: profileData } = await supabase
    .from("profiles")
    .select("password_set")
    .eq("id", userId)
    .single();

  return profileData?.password_set === false;
};

const getRedirectPathForType = (type: CallbackType) => {
  if (type === "recovery") return "/reset-password";
  if (type === "invite" || type === "signup") return "/set-password";
  return "/";
};

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const queryParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const callbackType = getCallbackType();

        const code = queryParams.get("code");
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        const errorCode =
          hashParams.get("error_code") ||
          queryParams.get("error_code") ||
          hashParams.get("error") ||
          queryParams.get("error");

        if (errorCode) {
          setError(INVALID_LINK_MESSAGE);
          setProcessing(false);
          return;
        }

        const redirectFromSession = async () => {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session) return false;

          const mustSetPassword =
            callbackType === "invite" ||
            callbackType === "signup" ||
            (await shouldForceSetPassword(session.user.id));

          navigate(mustSetPassword ? "/set-password" : getRedirectPathForType(callbackType), {
            replace: true,
          });
          return true;
        };

        // 1) Supabase verify endpoint may have already established cookies/session
        if (await redirectFromSession()) return;

        // 2) PKCE flow (?code=...)
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError && !(await redirectFromSession())) {
            setError(INVALID_LINK_MESSAGE);
            setProcessing(false);
            return;
          }
        }

        // 3) Hash token flow (#access_token=...)
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError && !(await redirectFromSession())) {
            setError(INVALID_LINK_MESSAGE);
            setProcessing(false);
            return;
          }
        }

        // 4) Retry to catch delayed cookie/session propagation
        const retryDelays = [300, 1000, 1500];
        for (const delay of retryDelays) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (await redirectFromSession()) return;
        }

        setError(INVALID_LINK_MESSAGE);
        setProcessing(false);
      } catch {
        setError(INVALID_LINK_MESSAGE);
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
  const [resendError, setResendError] = useState<string | null>(null);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setSending(true);
    setResendError(null);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setSending(false);

    if (error) {
      const lowerMessage = error.message.toLowerCase();
      if (lowerMessage.includes("security purposes") || lowerMessage.includes("rate")) {
        setResendError("Počkejte prosím chvíli a zkuste to znovu.");
      } else {
        setResendError("Nepodařilo se odeslat nový odkaz. Zkuste to znovu.");
      }
      return;
    }

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
          <p className="text-xs text-muted-foreground mt-1">Odkaz pro pozvánku vypršel.</p>
        </div>

        {!sent ? (
          <form onSubmit={handleResend} className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground block">
                Zadejte svůj email pro zaslání nového odkazu
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vas@email.cz"
                required
              />
            </div>

            {resendError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{resendError}</p>
            )}

            <Button type="submit" className="w-full" size="sm" disabled={sending}>
              {sending ? "Odesílám..." : "Odeslat nový odkaz"}
            </Button>
          </form>
        ) : (
          <div className="text-center space-y-2">
            <p className="text-sm text-primary">Nový odkaz byl odeslán na váš email.</p>
            <p className="text-xs text-muted-foreground">Pokud odkaz neobdržíte, kontaktujte administrátora.</p>
          </div>
        )}

        <div className="flex flex-col items-center gap-1 pt-2 border-t">
          <Button type="button" variant="ghost" size="sm" onClick={() => window.location.reload()}>
            Zkusit znovu
          </Button>
          <button
            type="button"
            onClick={() => navigate("/login")}
            className="text-[12px] text-muted-foreground hover:underline hover:text-foreground transition-colors"
          >
            Zpět na přihlášení
          </button>
        </div>
      </div>
    </div>
  );
}
