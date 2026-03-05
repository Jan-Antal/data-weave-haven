import { Home, Factory, Plus, Settings } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface MobileBottomNavProps {
  onNewProject: () => void;
  onSettings: () => void;
  canCreateProject: boolean;
  canAccessSettings: boolean;
}

export function MobileBottomNav({ onNewProject, onSettings, canCreateProject, canAccessSettings }: MobileBottomNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isPlan = location.pathname === "/plan-vyroby";

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-background border-t border-border flex items-center justify-around z-50 safe-area-bottom">
      <button
        onClick={() => navigate("/")}
        className={cn("flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center", isHome ? "text-primary" : "text-muted-foreground")}
      >
        <Home className="h-5 w-5" />
        <span className="text-[10px]">Přehled</span>
      </button>
      <button
        onClick={() => navigate("/plan-vyroby")}
        className={cn("flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center", isPlan ? "text-primary" : "text-muted-foreground")}
      >
        <Factory className="h-5 w-5" />
        <span className="text-[10px]">Plán</span>
      </button>
      {canCreateProject && (
        <button
          onClick={onNewProject}
          className="flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center text-primary"
        >
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
            <Plus className="h-5 w-5 text-primary-foreground" />
          </div>
        </button>
      )}
      {canAccessSettings && (
        <button
          onClick={onSettings}
          className="flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center text-muted-foreground"
        >
          <Settings className="h-5 w-5" />
          <span className="text-[10px]">Nastavení</span>
        </button>
      )}
    </nav>
  );
}
