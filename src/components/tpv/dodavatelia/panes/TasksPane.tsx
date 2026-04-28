/**
 * Supplier CRM — Úlohy pane.
 * Todo list bound to supplier (e.g. "vyžiadať aktualizovaný cenník",
 * "overiť cenu za URGENTNÝ režim").
 */

import { useState, useMemo } from "react";
import { Plus, Edit2, Trash2, Loader2, Save, X, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  useSupplierTasks,
  useCreateSupplierTask,
  useUpdateSupplierTask,
  useDeleteSupplierTask,
} from "../hooks";
import { formatDateLong, daysUntil } from "../../shared/helpers";
import type {
  TpvSupplierTaskRow,
  TaskPriority,
  CreateSupplierTaskInput,
} from "../types";
import type { SubcontractPermissions } from "../../subdodavky/types";

interface TasksPaneProps {
  supplierId: string;
  permissions: SubcontractPermissions;
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Nízka",
  normal: "Normálna",
  high: "Vysoká",
  urgent: "Urgentná",
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: "bg-gray-100 text-gray-600",
  normal: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-800",
  urgent: "bg-red-100 text-red-800",
};

export function TasksPane({ supplierId, permissions }: TasksPaneProps) {
  const { data: tasks = [], isLoading } = useSupplierTasks(supplierId);
  const [editing, setEditing] = useState<TpvSupplierTaskRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { open, done } = useMemo(() => {
    return tasks.reduce<{
      open: TpvSupplierTaskRow[];
      done: TpvSupplierTaskRow[];
    }>(
      (acc, t) => {
        if (t.status === "done" || t.status === "cancelled") acc.done.push(t);
        else acc.open.push(t);
        return acc;
      },
      { open: [], done: [] }
    );
  }, [tasks]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Načítavam úlohy…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {open.length} otvorených · {done.length} ukončených
        </p>
        {permissions.canManageSupplier && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nová úloha
          </Button>
        )}
      </div>

      {/* Open tasks */}
      {open.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Otvorené
          </h4>
          <div className="space-y-1.5">
            {open.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                canEdit={permissions.canManageSupplier}
                onEdit={() => setEditing(t)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Done tasks */}
      {done.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Ukončené
          </h4>
          <div className="space-y-1.5">
            {done.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                canEdit={permissions.canManageSupplier}
                onEdit={() => setEditing(t)}
              />
            ))}
          </div>
        </div>
      )}

      {tasks.length === 0 && (
        <div className="border rounded-lg p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Žiadne úlohy pre tohto dodávateľa.
          </p>
          {permissions.canManageSupplier && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Vytvoriť prvú úlohu
            </Button>
          )}
        </div>
      )}

      {creating && (
        <TaskFormDialog
          mode="create"
          supplierId={supplierId}
          onClose={() => setCreating(false)}
        />
      )}

      {editing && (
        <TaskFormDialog
          mode="edit"
          supplierId={supplierId}
          task={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// TASK ROW
// ============================================================

function TaskRow({
  task,
  canEdit,
  onEdit,
}: {
  task: TpvSupplierTaskRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const update = useUpdateSupplierTask(task.supplier_id);
  const del = useDeleteSupplierTask(task.supplier_id);

  // Derive 'isDone' flag from DB status field
  const isDone = task.status === "done" || task.status === "cancelled";

  const days = daysUntil(task.due_date);
  const overdueOrSoon =
    !isDone && days != null
      ? days < 0
        ? "overdue"
        : days <= 3
        ? "soon"
        : null
      : null;

  return (
    <div
      className={cn(
        "border rounded-lg px-4 py-3 grid grid-cols-[24px_1fr_auto_auto] gap-3 items-center bg-card",
        isDone && "opacity-60"
      )}
    >
      <button
        type="button"
        onClick={() =>
          update.mutate({
            id: task.id,
            patch: { status: isDone ? "open" : "done" },
          })
        }
        className={cn(
          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
          isDone
            ? "bg-green-600 border-green-600 text-white"
            : "border-muted-foreground/40 hover:border-muted-foreground"
        )}
        aria-label={isDone ? "Označiť ako otvorené" : "Označiť ako hotové"}
      >
        {isDone && <Check className="h-3 w-3" />}
      </button>

      <div className="min-w-0">
        <div
          className={cn(
            "text-sm font-medium",
            isDone && "line-through text-muted-foreground"
          )}
        >
          {task.title}
        </div>
        {task.description && (
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {task.description}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-xs">
          {task.priority !== "normal" && (
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide",
                PRIORITY_COLOR[task.priority]
              )}
            >
              {PRIORITY_LABEL[task.priority]}
            </span>
          )}
          {isDone && task.done_at && (
            <span className="text-muted-foreground">
              Ukončené {formatDateLong(task.done_at)}
            </span>
          )}
        </div>
      </div>

      <div>
        {task.due_date && !isDone && (
          <span
            className={cn(
              "text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap",
              overdueOrSoon === "overdue"
                ? "bg-red-100 text-red-800"
                : overdueOrSoon === "soon"
                ? "bg-amber-100 text-amber-800"
                : "bg-muted text-muted-foreground"
            )}
          >
            {overdueOrSoon === "overdue"
              ? `Po termíne (${formatDateLong(task.due_date)})`
              : formatDateLong(task.due_date)}
          </span>
        )}
      </div>

      {canEdit && (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => {
              if (confirm("Odstrániť úlohu?")) del.mutate(task.id);
            }}
            disabled={del.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// TASK FORM DIALOG
// ============================================================

function TaskFormDialog({
  mode,
  supplierId,
  task,
  onClose,
}: {
  mode: "create" | "edit";
  supplierId: string;
  task?: TpvSupplierTaskRow;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [dueDate, setDueDate] = useState(task?.due_date ?? "");
  const [priority, setPriority] = useState<TaskPriority>(
    task?.priority ?? "normal"
  );

  const create = useCreateSupplierTask();
  const update = useUpdateSupplierTask(supplierId);

  const isPending = create.isPending || update.isPending;

  const submit = () => {
    if (!title.trim()) return;
    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      due_date: dueDate || undefined,
      priority,
    };
    if (mode === "create") {
      create.mutate(
        { supplier_id: supplierId, ...payload } as CreateSupplierTaskInput,
        { onSuccess: () => onClose() }
      );
    } else if (task) {
      update.mutate(
        { id: task.id, patch: payload },
        { onSuccess: () => onClose() }
      );
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Nová úloha" : "Upraviť úlohu"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>
              Názov <span className="text-red-500">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Vyžiadať aktualizovaný cenník na Q3"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Popis</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[60px]"
              placeholder="Voliteľný popis úlohy"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Termín</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Priorita</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as TaskPriority)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Nízka</SelectItem>
                  <SelectItem value="normal">Normálna</SelectItem>
                  <SelectItem value="high">Vysoká</SelectItem>
                  <SelectItem value="urgent">Urgentná</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            <X className="h-4 w-4 mr-1" />
            Zrušiť
          </Button>
          <Button onClick={submit} disabled={!title.trim() || isPending}>
            <Save className="h-4 w-4 mr-1" />
            {isPending ? "Ukladám…" : mode === "create" ? "Pridať" : "Uložiť"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
