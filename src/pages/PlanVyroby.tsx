import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function PlanVyroby() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate("/", { replace: true });
    }
  }, [isAdmin, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Načítání...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-primary px-6 py-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Zpět
          </Button>
          <h1 className="text-xl font-serif text-primary-foreground tracking-wide">
            🏭 Plán Výroby
          </h1>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8">
            <span className="text-6xl">🏭</span>
            <h2 className="text-xl font-semibold">Plán Výroby — V přípravě</h2>
            <p className="text-muted-foreground text-sm text-center">
              Tato funkce je ve vývoji. Brzy zde bude plánovací kalendář výroby s přehledem kapacit.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
