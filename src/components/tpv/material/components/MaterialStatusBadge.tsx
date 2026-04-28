/**
 * MaterialStatusBadge — visual representation of stav field.
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, Inbox, Truck } from "lucide-react";

import type { MaterialStav } from "../types";
import { STAV_LABEL } from "../types";

interface MaterialStatusBadgeProps {
  stav: MaterialStav;
  size?: "sm" | "md";
  className?: string;
}

export function MaterialStatusBadge({
  stav,
  size = "md",
  className,
}: MaterialStatusBadgeProps) {
  const Icon =
    stav === "dodane"
      ? CheckCircle2
      : stav === "objednane"
        ? Truck
        : stav === "caka"
          ? Clock
          : Inbox;

  const tone =
    stav === "dodane"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
      : stav === "objednane"
        ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
        : stav === "caka"
          ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
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
      {STAV_LABEL[stav]}
    </Badge>
  );
}
