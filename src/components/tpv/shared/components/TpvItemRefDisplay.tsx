/**
 * TpvItemRefDisplay — read-only display of a tpv_items reference.
 *
 * Shows item_code as primary label, optional nazev as secondary.
 * Click opens Project Info / TPV List in new tab (edit happens there).
 *
 * Tabs in TPV module use this everywhere they reference tpv_items —
 * never inline edit inputs, the entity is owned by Project Info.
 */

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TpvItemRef } from "../types";

interface TpvItemRefDisplayProps {
  item: Pick<TpvItemRef, "item_code" | "nazev"> | null | undefined;
  /** Project ID — needed to build the deep link to Project Info / TPV List */
  projectId?: string;
  /** Optional override of the link target. Default: opens Project Info TPV List for projectId. */
  linkHref?: string;
  /** "compact" = code only; "full" = code + nazev */
  variant?: "compact" | "full";
  className?: string;
}

/**
 * Build link to Project Info → TPV List for a given project.
 * Adjust this if Project Info routing differs (e.g. uses query params).
 */
function buildProjectInfoLink(projectId: string): string {
  return `/project-info/${encodeURIComponent(projectId)}/tpv-list`;
}

export function TpvItemRefDisplay({
  item,
  projectId,
  linkHref,
  variant = "full",
  className,
}: TpvItemRefDisplayProps) {
  if (!item) {
    return <span className={cn("text-muted-foreground italic", className)}>—</span>;
  }

  const href = linkHref ?? (projectId ? buildProjectInfoLink(projectId) : undefined);

  const content = (
    <>
      <span className="font-mono text-xs font-semibold">{item.item_code}</span>
      {variant === "full" && item.nazev && (
        <span className="text-xs text-muted-foreground ml-1">— {item.nazev}</span>
      )}
    </>
  );

  if (!href) {
    return <span className={cn("inline-flex items-center", className)}>{content}</span>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-0.5 hover:underline group",
        className
      )}
      title="Otvoriť v Project Info → TPV List"
    >
      {content}
      <ExternalLink className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-60 transition-opacity" />
    </a>
  );
}
