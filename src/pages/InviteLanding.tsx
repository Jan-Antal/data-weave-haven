import { useSearchParams } from "react-router-dom";

/**
 * Intermediate landing page for invite/recovery links.
 * Prevents Slack (and other chat apps) from consuming one-time tokens
 * during link unfurling — the actual auth URL is only followed on user click.
 */
export default function InviteLanding() {
  const [params] = useSearchParams();
  const link = params.get("link");

  if (!link) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <img src="/images/AM-Interior-orange.svg" alt="AM Interior" style={{ height: '32px', width: 'auto', margin: '0 auto' }} className="mb-2" />
          <p className="text-sm text-destructive mt-4">Neplatný nebo chybějící odkaz.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/images/AM-Interior-orange.svg" alt="AM Interior" style={{ height: '32px', width: 'auto', margin: '0 auto' }} />
          <p className="text-sm text-muted-foreground mt-1">Project Info 2026</p>
        </div>

        <div className="bg-card border rounded-lg p-6 space-y-4 shadow-sm text-center">
          <p className="text-sm text-foreground">
            Kliknutím na tlačítko se přihlásíte do aplikace.
          </p>
          <a
            href={link}
            className="inline-flex items-center justify-center w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Přihlásit se
          </a>
          <p className="text-[11px] text-muted-foreground">
            Odkaz je jednorázový — funguje pouze při prvním kliknutí.
          </p>
        </div>
      </div>
    </div>
  );
}
