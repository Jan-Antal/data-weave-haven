/**
 * ProjectChecklist — per-project item editor.
 *
 * Tabuľka prvkov projektu kde sa zaznamenáva readiness:
 *   - doc_ok       (checkbox — konstruktér eviduje)
 *   - readiness_status (select — rozpracovane/ready/riziko/blokovane)
 *   - notes        (textarea inline)
 *
 * hodiny_schvalene sa NEZAPISUJE manuálne — derivuje sa z
 * tpv_hours_allocation (read-only display, info-only).
 */

import { useState } from "react";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import {
  useItemsForProject,
  useUpsertItemPreparation,
} from "../hooks";
import {
  READINESS_STATUS,
  READINESS_LABEL,
  type ReadinessStatus,
  type PreparationItemView,
} from "../types";
import { ReadinessBadge } from "./ReadinessBadge";

interface ProjectChecklistProps {
  projectId: string;
  onBack: () => void;
  canEdit: boolean;
}

export function ProjectChecklist({
  projectId,
  onBack,
  canEdit,
}: ProjectChecklistProps) {
  const itemsQ = useItemsForProject(projectId);
  const items = itemsQ.data ?? [];

  if (itemsQ.isLoading) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        Načítavam prvky...
      </div>
    );
  }
  if (itemsQ.isError) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
        <div className="font-semibold text-destructive">
          Chyba pri načítaní
        </div>
        <div className="text-sm text-destructive/90 mt-1">
          {itemsQ.error instanceof Error
            ? itemsQ.error.message
            : "Neznáma chyba"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={onBack}
          aria-label="Späť"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">Pripravenosť projektu</h2>
          <div className="text-xs text-muted-foreground">
            {items.length} prvkov · klikni na status alebo doc OK pre úpravu
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          Tento projekt nemá žiadne TPV prvky.
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-[11px] uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Prvok</th>
                <th className="px-3 py-2 text-center">Doc OK</th>
                <th className="px-3 py-2 text-center">Hodiny ✓</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Poznámka</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ItemRow
                  key={item.tpv_item.id}
                  item={item}
                  projectId={projectId}
                  canEdit={canEdit}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Row
// ============================================================

interface ItemRowProps {
  item: PreparationItemView;
  projectId: string;
  canEdit: boolean;
}

function ItemRow({ item, projectId, canEdit }: ItemRowProps) {
  const upsert = useUpsertItemPreparation();
  const [notesDraft, setNotesDraft] = useState(item.notes ?? "");
  const [notesDirty, setNotesDirty] = useState(false);

  function patch(fields: {
    doc_ok?: boolean;
    readiness_status?: ReadinessStatus;
    notes?: string | null;
  }) {
    upsert.mutate({
      project_id: projectId,
      tpv_item_id: item.tpv_item_id,
      ...fields,
    });
  }

  function commitNotes() {
    if (!notesDirty) return;
    setNotesDirty(false);
    patch({ notes: notesDraft.trim() || null });
  }

  return (
    <tr className="border-t border-border/40 hover:bg-accent/20 align-top">
      <td className="px-3 py-2">
        <div className="font-mono text-xs">{item.tpv_item.item_code}</div>
        <div className="text-sm">{item.tpv_item.nazev ?? "—"}</div>
        {item.tpv_item.popis && (
          <div className="text-[11px] text-muted-foreground line-clamp-1 max-w-md">
            {item.tpv_item.popis}
          </div>
        )}
      </td>

      {/* doc_ok */}
      <td className="px-3 py-2 text-center">
        <Checkbox
          checked={item.doc_ok}
          disabled={!canEdit || upsert.isPending}
          onCheckedChange={(v) => patch({ doc_ok: !!v })}
        />
      </td>

      {/* hodiny_schvalene — read-only, derived */}
      <td className="px-3 py-2 text-center">
        {item.hodiny_schvalene ? (
          <Badge
            variant="outline"
            className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          >
            ✓
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>

      {/* readiness_status */}
      <td className="px-3 py-2">
        {canEdit ? (
          <Select
            value={item.readiness_status}
            onValueChange={(v) =>
              patch({ readiness_status: v as ReadinessStatus })
            }
          >
            <SelectTrigger className="h-7 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {READINESS_STATUS.map((s) => (
                <SelectItem key={s} value={s}>
                  {READINESS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <ReadinessBadge status={item.readiness_status} size="sm" />
        )}
      </td>

      {/* notes */}
      <td className="px-3 py-2">
        {canEdit ? (
          <Textarea
            value={notesDraft}
            onChange={(e) => {
              setNotesDraft(e.target.value);
              setNotesDirty(true);
            }}
            onBlur={commitNotes}
            rows={1}
            className="text-xs min-h-7 resize-none"
            placeholder="poznámka..."
          />
        ) : (
          <div className="text-xs text-muted-foreground">
            {item.notes ?? "—"}
          </div>
        )}
      </td>
    </tr>
  );
}
