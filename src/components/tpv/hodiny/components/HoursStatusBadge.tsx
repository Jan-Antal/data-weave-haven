/**
 * HoursStatusBadge — workflow status visualization.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, FileEdit, Send, RotateCcw } from "lucide-react";

import type { HoursStav } from "../types";
import { HOURS_STAV_LABEL } from "../types";

interface HoursStatusBadgeProps {
  stav: HoursStav;
  size?: "sm" | "md";
  className?: string;
}

export function HoursStatusBadge({
  stav,
  size = "md",
  className,
}: HoursStatusBadgeProps) {
  const Icon =
    stav === "approved"
      ? CheckCircle2
      : stav === "submitted"
        ? Send
        : stav === "returned"
          ? RotateCcw
          : FileEdit;

  const tone =
    stav === "approved"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
      : stav === "submitted"
        ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
        : stav === "returned"
          ? "border-red-500/40 bg-red-500/15 text-red-300"
          : "border-muted-foreground/30 bg-muted/40 text-muted-foreground";

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-medium",
        tone,
        size === "sm" ? "h-5 px-1.5 text-[10px]" : "h-6 px-2 text-xs",
        className
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {HOURS_STAV_LABEL[stav]}
    </Badge>
  );
}
