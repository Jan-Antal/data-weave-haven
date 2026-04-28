/**
 * PerProjectView — materials grouped by project (accordion).
 *
 * Header per group shows summary chips: nezadany / objednane / caka /
 * dodane / overdue. Click group to expand a table of items.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import type { MaterialView } from "../types";
import { computeProjectSummaries, groupByProject } from "../api";
import { MaterialStatusBadge } from "./MaterialStatusBadge";
import { useDeleteMaterial } from "../hooks";
import { formatDateShort } from "../../shared/helpers";

interface PerProjectViewProps {
  rows: MaterialView[];
  canWrite: boolean;
  onEdit: (id: string) => void;
}

export function PerProjectView({
  rows,
  canWrite,
  onEdit,
}: PerProjectViewProps) {
  const summaries = useMemo(() => computeProjectSummaries(rows), [rows]);
  const grouped = useMemo(() => groupByProject(rows), [rows]);

  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  function toggle(pid: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }

  if (summaries.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        Žiadne materiály — pridaj prvú položku alebo importuj Excel.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {summaries.map((s) => {
        const isOpen = openIds.has(s.project_id);
        const items = grouped.get(s.project_id) ?? [];
        return (
          <ProjectGroup
            key={s.project_id}
            isOpen={isOpen}
            onToggle={() => toggle(s.project_id)}
            summary={s}
            items={items}
            canWrite={canWrite}
            onEdit={onEdit}
          />
        );
      })}
    </div>
  );
}

// ============================================================
// Group Block
// ============================================================

interface ProjectGroupProps {
  isOpen: boolean;
  onToggle: () => void;
  summary: ReturnType<typeof computeProjectSummaries>[number];
  items: MaterialView[];
  canWrite: boolean;
  onEdit: (id: string) => void;
}

function ProjectGroup({
  isOpen,
  onToggle,
  summary,
  items,
  canWrite,
  onEdit,
}: ProjectGroupProps) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const deleteM = useDeleteMaterial();

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 overflow-hidden">
      {/* HEADER */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 text-left",
          "hover:bg-accent/30 transition-colors"
        )}
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">
            {summary.project_name ?? summary.project_id}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {summary.total} položiek
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {summary.nezadany > 0 && (
            <Chip tone="muted" label="nezadané" count={summary.nezadany} />
          )}
          {summary.objednane > 0 && (
            <Chip tone="info" label="objednané" count={summary.objednane} />
          )}
          {summary.caka > 0 && (
            <Chip tone="warn" label="čaká" count={summary.caka} />
          )}
          {summary.dodane > 0 && (
            <Chip tone="ok" label="dodané" count={summary.dodane} />
          )}
          {summary.overdue > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="gap-1 border-red-500/40 bg-red-500/15 text-red-300"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {summary.overdue}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="left">
                  Po termíne (objednané &gt; 14 dní bez dodania)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </button>

      {/* BODY */}
      {isOpen && (
        <div className="border-t border-border/60 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-[11px] uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Prvok</th>
                <th className="px-3 py-2 text-left">Materiál</th>
                <th className="px-3 py-2 text-right">Množ.</th>
                <th className="px-3 py-2 text-left">Dodávateľ</th>
                <th className="px-3 py-2 text-left">Stav</th>
                <th className="px-3 py-2 text-left">Termíny</th>
                <th className="px-3 py-2 w-px" />
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr
                  key={m.id}
                  className="border-t border-border/40 hover:bg-accent/20"
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    {m.tpv_item?.item_code ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{m.nazov}</div>
                    {m.poznamka && (
                      <div className="text-[11px] text-muted-foreground line-clamp-1">
                        {m.poznamka}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {m.mnozstvo == null ? "—" : m.mnozstvo}
                    {m.jednotka ? (
                      <span className="text-muted-foreground"> {m.jednotka}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {m.dodavatel ?? (
                      <span className="text-muted-foreground italic">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <MaterialStatusBadge stav={m.stav} size="sm" />
                  </td>
                  <td className="px-3 py-2 text-[11px] whitespace-nowrap">
                    {m.objednane_dat && (
                      <div>
                        <span className="text-muted-foreground">obj. </span>
                        {formatDateShort(m.objednane_dat)}
                      </div>
                    )}
                    {m.dodane_dat && (
                      <div>
                        <span className="text-muted-foreground">dod. </span>
                        {formatDateShort(m.dodane_dat)}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {canWrite && (
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => onEdit(m.id)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => setPendingDelete(m.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* DELETE CONFIRM */}
      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zmazať materiál?</AlertDialogTitle>
            <AlertDialogDescription>
              Položka bude trvalo zmazaná. Audit log si zachová záznam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušiť</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!pendingDelete) return;
                await deleteM.mutateAsync(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Zmazať
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// Chip
// ============================================================

interface ChipProps {
  tone: "muted" | "info" | "warn" | "ok";
  label: string;
  count: number;
}
function Chip({ tone, label, count }: ChipProps) {
  const cls =
    tone === "ok"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
        : tone === "info"
          ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
          : "border-muted-foreground/30 bg-muted/40 text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", cls)}>
      <span className="font-mono">{count}</span>
      <span className="text-[10px] uppercase tracking-wide opacity-80">
        {label}
      </span>
    </Badge>
  );
}
