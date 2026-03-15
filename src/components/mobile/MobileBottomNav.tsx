import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Factory } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isProjectsActive = location.pathname === "/" && (location.state as any)?.view === "projects";
  const isVyrobaActive = location.pathname === "/vyroba";

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around"
      style={{
        height: "calc(56px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        background: "#223937",
      }}
    >
      <button
        onClick={() => navigate("/", { state: { view: "projects" }, replace: false })}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[44px] transition-colors relative",
          isProjectsActive ? "text-white" : "text-[#7aa8a4]"
        )}
      >
        <LayoutDashboard className="h-5 w-5" strokeWidth={isProjectsActive ? 2 : 1.75} />
        <span className="text-[10px] font-medium">Projekty</span>
      </button>
      <button
        onClick={() => navigate("/vyroba")}
        className={cn(
          "flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[44px] transition-colors relative",
          isVyrobaActive ? "text-white" : "text-[#7aa8a4]"
        )}
      >
        <Factory className="h-5 w-5" strokeWidth={isVyrobaActive ? 2 : 1.75} />
        <span className="text-[10px] font-medium">Výroba</span>
      </button>
    </nav>
  );
}
