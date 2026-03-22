import { createPortal } from "react-dom";
import { LayoutDashboard, Factory, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

type MobileModule = "prehled" | "projekty" | "vyroba";

interface MobileBottomNavProps {
  onModuleChange?: (module: MobileModule) => void;
  activeModule?: MobileModule;
}

export function MobileBottomNav({ onModuleChange, activeModule }: MobileBottomNavProps) {
  const { isAdmin, isOwner } = useAuth();

  const isProjectsActive = activeModule === "projekty";
  const isDashboardActive = activeModule === "prehled";
  const isVyrobaActive = activeModule === "vyroba";

  const canAccessProduction = isAdmin || isOwner;

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
    }
  };

  return createPortal(
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[100000] flex items-center justify-around bg-primary pointer-events-auto h-14">
      <div className="flex items-center justify-around h-14">
        <button
          onClick={(e) => handleNav(e, "projekty")}
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-md min-h-[44px] transition-colors",
            isProjectsActive ? "text-primary-foreground bg-primary-foreground/10" : "text-primary-foreground/70",
          )}
        >
          <LayoutDashboard className="h-5 w-5" />
          <span className="text-[10px] font-medium">Projekty</span>
        </button>
        <button
          onClick={(e) => handleNav(e, "prehled")}
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 px-4 py-1.5 rounded-md min-h-[44px] transition-colors",
            isDashboardActive ? "text-primary-foreground bg-primary-foreground/10" : "text-primary-foreground/70",
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
              isVyrobaActive ? "text-primary-foreground bg-primary-foreground/10" : "text-primary-foreground/70",
            )}
          >
            <Factory className="h-5 w-5" />
            <span className="text-[10px] font-medium">Výroba</span>
          </button>
        )}
      </div>
    </nav>,
    document.body,
  );
}
