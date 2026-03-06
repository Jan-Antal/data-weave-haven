import { cn } from "@/lib/utils";

interface MobileTabBarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS = [
  { value: "prehled", label: "🏠 Přehled" },
  { value: "projekty", label: "📁 Projekty" },
];

export function MobileTabBar({ activeTab, onTabChange }: MobileTabBarProps) {
  return (
    <div className="md:hidden flex overflow-x-auto border-b bg-background shrink-0 scrollbar-hide">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onTabChange(tab.value)}
          className={cn(
            "shrink-0 flex-1 px-4 py-2.5 text-sm font-medium whitespace-nowrap min-h-[44px] border-b-2 transition-colors",
            activeTab === tab.value
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
