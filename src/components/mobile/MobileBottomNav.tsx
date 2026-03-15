import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Factory, Home } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isProjectsActive = location.pathname === "/" && (location.state as any)?.view === "projects";
  const isDashboardActive = location.pathname === "/" && (location.state as any)?.view !== "projects";
  const isVyrobaActive = location.pathname === "/vyroba";

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around bg-primary"
      style={{
        height: "calc(56px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <button
        onClick={() => navigate("/", { state: { view: "projects" }, replace: true })}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-md min-h-[44px] transition-colors",
          isProjectsActive
            ? "text-primary-foreground bg-primary-foreground/10"
            : "text-primary-foreground/70"
        )}
      >
        <LayoutDashboard className="h-5 w-5" />
        <span className="text-[10px] font-medium">Projekty</span>
      </button>
      <button
        onClick={() => navigate("/", { state: { view: "dashboard" }, replace: false })}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-md min-h-[44px] transition-colors",
          isDashboardActive
            ? "text-primary-foreground bg-primary-foreground/10"
            : "text-primary-foreground/70"
        )}
      >
        <Home className="h-5 w-5" />
        <span className="text-[10px] font-medium">Přehled</span>
      </button>
      <button
        onClick={() => navigate("/vyroba")}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-md min-h-[44px] transition-colors",
          isVyrobaActive
            ? "text-primary-foreground bg-primary-foreground/10"
            : "text-primary-foreground/70"
        )}
      >
        <Factory className="h-5 w-5" />
        <span className="text-[10px] font-medium">Výroba</span>
      </button>
    </nav>
  );
}
