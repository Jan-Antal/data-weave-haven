import { Clock } from "lucide-react";

interface MobileHeaderProps {
  onDataLog?: () => void;
  showDataLog?: boolean;
}

export function MobileHeader({ onDataLog, showDataLog = false }: MobileHeaderProps) {
  return (
    <header
      className="md:hidden border-b bg-primary px-4 pb-3 shrink-0 z-50"
      style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 12px)" }}
    >
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-serif text-primary-foreground tracking-wide">
          A→M <span className="font-sans font-normal text-sm opacity-80">Interior</span>
        </h1>
        {showDataLog && onDataLog && (
          <button
            onClick={onDataLog}
            className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <Clock className="h-5 w-5" />
          </button>
        )}
      </div>
    </header>
  );
}
