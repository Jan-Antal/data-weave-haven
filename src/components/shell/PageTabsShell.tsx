import { ReactNode, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";

export type ShellTabDef = {
  key: string;
  label: string;
  visible?: boolean;
};

interface PageTabsShellProps {
  tabs: ShellTabDef[];
  defaultTab?: string;
  paramName?: string;
  /** Optional row rendered between the tab bar and the content (e.g. TestModeBanner). */
  belowTabsSlot?: ReactNode;
  /** Optional right-aligned slot inside the tab bar. */
  rightSlot?: ReactNode;
  children: (active: string) => ReactNode;
}

/**
 * Unified page shell for modules with sub-navigation tabs.
 * Tabs sit directly under the main app topbar with no gap.
 * Active tab uses the brand primary underline (#0a2e28).
 */
export function PageTabsShell({
  tabs,
  defaultTab,
  paramName = "tab",
  belowTabsSlot,
  rightSlot,
  children,
}: PageTabsShellProps) {
  const [params, setParams] = useSearchParams();

  const visibleTabs = useMemo(
    () => tabs.filter((t) => t.visible !== false),
    [tabs],
  );

  const fallback = defaultTab ?? visibleTabs[0]?.key ?? "";
  const requested = params.get(paramName) ?? fallback;
  const active = visibleTabs.some((t) => t.key === requested) ? requested : fallback;

  useEffect(() => {
    if (requested !== active && active) {
      const next = new URLSearchParams(params);
      next.set(paramName, active);
      setParams(next, { replace: true });
    }
  }, [requested, active, params, paramName, setParams]);

  const setActive = (key: string) => {
    const next = new URLSearchParams(params);
    next.set(paramName, key);
    setParams(next, { replace: true });
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Tab bar — flush under topbar, no gap */}
      <div className="bg-background border-b border-border/60">
        <div className="flex items-center justify-between gap-3 px-5">
          <nav
            className="flex items-end gap-0 -mb-px overflow-x-auto"
            role="tablist"
          >
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
                      ? "border-[#0a2e28] text-[#0a2e28] font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>
          {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
        </div>
      </div>

      {belowTabsSlot && <div className="shrink-0">{belowTabsSlot}</div>}

      {/* Content — white card surface so rows pop like in Project Info */}
      <div className="flex-1 min-h-0 overflow-hidden bg-card">
        {children(active)}
      </div>
    </div>
  );
}
