/**
 * ProjectRefDisplay — read-only display of a project reference.
 *
 * Shows project_id as primary, project_name as secondary.
 * Click opens Project Info detail in new tab.
 */

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectRef } from "../types";

interface ProjectRefDisplayProps {
  project:
    | Pick<ProjectRef, "project_id" | "project_name">
    | null
    | undefined;
  variant?: "compact" | "full";
  className?: string;
}

function buildProjectInfoLink(projectId: string): string {
  return `/project-info/${encodeURIComponent(projectId)}`;
}

export function ProjectRefDisplay({
  project,
  variant = "full",
  className,
}: ProjectRefDisplayProps) {
  if (!project) {
    return <span className={cn("text-muted-foreground italic", className)}>—</span>;
  }

  const href = buildProjectInfoLink(project.project_id);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-0.5 hover:underline group",
        className
      )}
      title="Otvoriť detail projektu"
    >
      <span className="font-mono text-xs font-semibold">{project.project_id}</span>
      {variant === "full" && project.project_name && (
        <span className="text-xs text-muted-foreground ml-1">
          — {project.project_name}
        </span>
      )}
      <ExternalLink className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-60 transition-opacity" />
    </a>
  );
}
