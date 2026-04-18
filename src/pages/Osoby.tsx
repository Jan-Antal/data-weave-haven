import { useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { OsobyZamestnanci } from "@/components/osoby/OsobyZamestnanci";
import { OsobyExternisti } from "@/components/osoby/OsobyExternisti";
import { OsobyUzivatele } from "@/components/osoby/OsobyUzivatele";
import { OsobyKatalog } from "@/components/osoby/OsobyKatalog";
import { OsobyKapacita } from "@/components/osoby/OsobyKapacita";
import { useAuth } from "@/hooks/useAuth";
import { TestModeBanner } from "@/components/TestModeBanner";
import { cn } from "@/lib/utils";

type TabKey = "zamestnanci" | "externisti" | "uzivatele" | "katalog" | "kapacita";

interface TabDef {
  key: TabKey;
  label: string;
  visible: boolean;
}

export default function Osoby() {
  const { isAdmin, isOwner, canManageUsers, isTestUser } = useAuth();
  const canSeeAdminTabs = isAdmin || isOwner;
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const tabs: TabDef[] = useMemo(
    () => [
      { key: "zamestnanci", label: "Zaměstnanci", visible: true },
      { key: "externisti", label: "Externisti", visible: true },
      { key: "uzivatele", label: "Uživatelé", visible: canManageUsers },
      { key: "katalog", label: "Pozice & číselníky", visible: canSeeAdminTabs },
      { key: "kapacita", label: "Kapacita", visible: canSeeAdminTabs },
    ],
    [canManageUsers, canSeeAdminTabs],
  );

  const visibleTabs = tabs.filter((t) => t.visible);
  const requested = (params.get("tab") as TabKey | null) ?? "zamestnanci";
  const active: TabKey = visibleTabs.some((t) => t.key === requested) ? requested : "zamestnanci";

  useEffect(() => {
    if (requested !== active) {
      const next = new URLSearchParams(params);
      next.set("tab", active);
      setParams(next, { replace: true });
    }
  }, [requested, active, params, setParams]);

  const setActive = (key: TabKey) => {
    const next = new URLSearchParams(params);
    next.set("tab", key);
    setParams(next, { replace: true });
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Page hero — title + tabs (full-width, no card) */}
      <div className="border-b bg-white">
        <div className="px-6 pt-5 pb-0 w-full">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Early Sans', system-ui, sans-serif" }}>
              Správa osob
            </h1>
            <span className="text-xs text-muted-foreground">
              Centrální evidence zaměstnanců, externistů, uživatelů a kapacity výroby
            </span>
          </div>
          {isTestUser && <div className="mt-3 mb-1"><TestModeBanner /></div>}

          <nav className="flex items-end gap-0 mt-4 -mb-px overflow-x-auto" role="tablist">
            {visibleTabs.map((t) => {
              const isActive = t.key === active;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActive(t.key)}
                  className={cn(
                    "px-4 py-2.5 text-sm whitespace-nowrap transition-colors border-b-2",
                    isActive
                      ? "border-[#223937] text-[#223937] font-semibold"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30 font-medium",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content — full width, no inner card, like Project Info / Analytics */}
      <div className="flex-1 overflow-hidden bg-white">
        {active === "zamestnanci" && <OsobyZamestnanci />}
        {active === "externisti" && <OsobyExternisti />}
        {active === "uzivatele" && canManageUsers && <OsobyUzivatele />}
        {active === "katalog" && canSeeAdminTabs && <OsobyKatalog />}
        {active === "kapacita" && canSeeAdminTabs && <OsobyKapacita />}
      </div>
    </div>
  );
}
