import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface MobileTapFieldProps {
  /** The display value shown in read-only mode */
  displayValue: string;
  /** Whether the field is disabled (role-based) — always show as read-only text */
  disabled?: boolean;
  /** Render the actual input/select when editing */
  children: (props: { onDone: () => void; autoFocus: boolean }) => ReactNode;
  className?: string;
}

/**
 * On mobile: shows a static text span. Tap → replaces with actual input (children).
 * On desktop: always renders the children (input).
 */
export function MobileTapField({ displayValue, disabled, children, className }: MobileTapFieldProps) {
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDone = useCallback(() => {
    setEditing(false);
  }, []);

  // Close editing when clicking outside
  useEffect(() => {
    if (!editing || !isMobile) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditing(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [editing, isMobile]);

  // Desktop: always render children directly
  if (!isMobile) {
    return <>{children({ onDone: () => {}, autoFocus: false })}</>;
  }

  // Mobile disabled: show static text
  if (disabled) {
    return (
      <div className={cn(
        "flex items-center h-10 px-3 rounded-md border border-input bg-muted text-muted-foreground text-sm cursor-not-allowed opacity-70 truncate",
        className
      )}>
        {displayValue || "—"}
      </div>
    );
  }

  // Mobile editing: show the real input
  if (editing) {
    return (
      <div ref={containerRef}>
        {children({ onDone: handleDone, autoFocus: true })}
      </div>
    );
  }

  // Mobile read-only display: tap to edit
  return (
    <div
      onClick={() => setEditing(true)}
      className={cn(
        "flex items-center h-10 px-3 rounded-md border border-input bg-background text-sm cursor-pointer truncate active:bg-accent/50 transition-colors",
        !displayValue && "text-muted-foreground",
        className
      )}
    >
      {displayValue || "—"}
    </div>
  );
}
