import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Factory, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, isOwner } = useAuth();

  const isProjectsActive = location.pathname === "/" && (location.state as any)?.view === "projects";
  const isDashboardActive = location.pathname === "/" && (location.state as any)?.view !== "projects";
  const isVyrobaActive = location.pathname === "/vyroba";

  const canAccessProduction = isAdmin || isOwner;

  // Close DataLog panels on all modules when navigating via bottom nav
  const closeDataLog = () => {
    try {
      localStorage.setItem("datalog-panel-index", "false");
      localStorage.setItem("datalog-panel-vyroba", "false");
      localStorage.setItem("datalog-panel-plan-vyroby", "false");
    } catch {}
  };

  const handleNav = (e: React.MouseEvent, path: string, state?: Record<string, string>) => {
    e.stopPropagation();
    e.preventDefault();
    closeDataLog();
    // Dispatch event to close any open overlays (TPV list, DataLog panel etc.)
    window.dispatchEvent(new CustomEvent("mobile-nav-change"));
    navigate(path, { state, replace: true });
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-[200] flex items-center justify-around bg-primary"
      style={{
        height: "calc(56px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <button
        onClick={(e) => handleNav(e, "/", { view: "projects" })}
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
        onClick={(e) => handleNav(e, "/", { view: "dashboard" })}
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
      {canAccessProduction && (
        <button
          onClick={(e) => handleNav(e, "/vyroba")}
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
      )}
    </nav>
  );
}
