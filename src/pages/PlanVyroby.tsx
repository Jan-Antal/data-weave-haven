import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ProductionHeader } from "@/components/production/ProductionHeader";
import { InboxPanel } from "@/components/production/InboxPanel";
import { WeeklySilos } from "@/components/production/WeeklySilos";
import { ExpedicePanel } from "@/components/production/ExpedicePanel";
import { ArrowLeft } from "lucide-react";

export default function PlanVyroby() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [showCzk, setShowCzk] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate("/", { replace: true });
    }
  }, [isAdmin, loading, navigate]);

  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Načítání...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: "#f4f2f0" }}>
      {/* Standard app header */}
      <header className="border-b bg-primary px-6 py-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-serif text-primary-foreground tracking-wide">
              A→M <span className="font-sans font-normal text-base opacity-80">Interior</span>
            </h1>
            <span className="text-primary-foreground/40 text-sm">|</span>
            <span className="text-primary-foreground/70 text-sm font-sans font-medium">Plán Výroby</span>
          </div>
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Zpět na přehled
          </button>
        </div>
      </header>

      {/* Stats bar */}
      <ProductionHeader />

      {/* Three-zone layout */}
      <div className="flex-1 flex min-h-0">
        <InboxPanel />
        <WeeklySilos showCzk={showCzk} onToggleCzk={setShowCzk} />
        <ExpedicePanel />
      </div>
    </div>
  );
}
