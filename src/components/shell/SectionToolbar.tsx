import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionToolbarProps {
  /** Left-aligned slot — filters, group pills, week navigation. */
  left?: ReactNode;
  /** Right-aligned slot — search, action buttons. */
  right?: ReactNode;
  className?: string;
}

/**
 * Unified per-tab toolbar — first row of every tab content.
 * Height 48px, px-5, border-b. Right-aligned by default.
 */
export function SectionToolbar({ left, right, className }: SectionToolbarProps) {
  return (
    <div
      className={cn(
        "shrink-0 flex items-center justify-between gap-3 px-5 h-12 border-b border-border/60 bg-card",
        className,
      )}
    >
      <div className="flex items-center gap-2 flex-wrap min-w-0">{left}</div>
      <div className="flex items-center gap-2 shrink-0">{right}</div>
    </div>
  );
}
