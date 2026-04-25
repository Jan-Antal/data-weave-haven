import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Factory, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

type MobileModule = "prehled" | "projekty" | "vyroba";

interface MobileBottomNavProps {
  onModuleChange?: (module: MobileModule) => void;
  activeModule?: MobileModule;
}

export function MobileBottomNav({ onModuleChange, activeModule }: MobileBottomNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { canManageProduction, canQCOnly, canAccessPlanVyroby } = useAuth();

  // When embedded inside Index, use module state. When standalone (e.g. /vyroba), derive from route.
  const isStandalone = !onModuleChange;
  const isVyrobaRoute = location.pathname.startsWith("/vyroba");

  const isProjectsActive = isStandalone ? false : activeModule === "projekty";
  const isDashboardActive = isStandalone ? !isVyrobaRoute : activeModule === "prehled";
  const isVyrobaActive = isStandalone ? isVyrobaRoute : activeModule === "vyroba";

  const canAccessProduction =
    canManageProduction || canQCOnly || canAccessPlanVyroby;

  // Close DataLog panels on all modules when navigating via bottom nav
  const closeDataLog = () => {
    try {
      localStorage.setItem("datalog-panel-index", "false");
      localStorage.setItem("datalog-panel-vyroba", "false");
      localStorage.setItem("datalog-panel-plan-vyroby", "false");
    } catch {}
  };

  const handleNav = (e: React.MouseEvent, module: MobileModule) => {
    e.stopPropagation();
    e.preventDefault();
    closeDataLog();
    // Dispatch event to close any open overlays (TPV list, DataLog panel etc.)
    window.dispatchEvent(new CustomEvent("mobile-nav-change"));
    if (onModuleChange) {
      onModuleChange(module);
      return;
    }
    // Standalone fallback: navigate via router so menu remains usable from /vyroba etc.
    if (module === "vyroba") {
      navigate("/vyroba");
    } else if (module === "projekty") {
      navigate("/", { state: { view: "projects" } });
    } else {
      navigate("/", { state: { view: "dashboard" } });
    }
  };

  return createPortal(
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-[100000] bg-primary pointer-events-auto flex items-center justify-around"
      style={{ height: "calc(56px + 36px)", paddingBottom: "36px" }}
    >
      <button
        onClick={(e) => handleNav(e, "projekty")}
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
        onClick={(e) => handleNav(e, "prehled")}
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
          onClick={(e) => handleNav(e, "vyroba")}
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
    </nav>,
    document.body
  );
}
