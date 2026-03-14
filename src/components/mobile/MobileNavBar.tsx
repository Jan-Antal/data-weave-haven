import { useLocation, useNavigate } from "react-router-dom";
import { Factory, CalendarRange, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { path: "/", label: "Projekty", icon: LayoutDashboard },
  { path: "/vyroba", label: "Výroba", icon: Factory },
  { path: "/plan-vyroby", label: "Plán", icon: CalendarRange },
] as const;

export function MobileNavBar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around"
      style={{
        height: "calc(56px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: "#223937",
      }}
    >
      {TABS.map((tab) => {
        const isActive = location.pathname === tab.path;
        const Icon = tab.icon;
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[44px] transition-colors relative",
              isActive ? "text-white" : "text-[#7aa8a4]"
            )}
          >
            <Icon className="h-5 w-5" strokeWidth={isActive ? 2 : 1.75} />
            <span className="text-[10px] font-medium">{tab.label}</span>
            {isActive && (
              <span
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-white"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
