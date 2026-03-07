import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDialog } from "./ConfirmDialog";
import { Plus, Trash2, GripVertical, Palette } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  useProjectStatusOptions,
  useAddProjectStatusOption,
  useUpdateProjectStatusOption,
  useDeleteProjectStatusOption,
  useReorderProjectStatusOptions,
} from "@/hooks/useProjectStatusOptions";
import {
  useTPVStatusOptions,
  useAddTPVStatusOption,
  useUpdateTPVStatusOption,
  useDeleteTPVStatusOption,
} from "@/hooks/useTPVStatusOptions";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { TestModeBanner } from "./TestModeBanner";

interface StatusManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PRESET_COLORS = [
  "#6b7280", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6",
  "#8b5cf6", "#06b6d4", "#ec4899", "#1d1d1f", "#16a34a",
  "#d97706", "#dc2626", "#2563eb", "#7c3aed", "#0891b2",
];

interface StatusItem {
  id: string;
  label: string;
  color: string;
  sort_order: number;
}

function SortableStatusRow({
  item,
  onUpdateLabel,
  onUpdateColor,
  onDelete,
}: {
  item: StatusItem;
  onUpdateLabel: (id: string, label: string) => void;
  onUpdateColor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.label);
  const [colorOpen, setColorOpen] = useState(false);

  const style = { transform: CSS.Transform.toString(transform), transition };

  const handleSave = () => {
    if (editValue.trim() && editValue.trim() !== item.label) {
      onUpdateLabel(item.id, editValue.trim());
    }
    setEditing(false);
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 py-1.5 px-2 border-b last:border-b-0 group">
      <div {...attributes} {...listeners} className="cursor-grab shrink-0">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      <Badge
        variant="outline"
        className="text-xs font-medium shrink-0"
        style={{ backgroundColor: `${item.color}20`, color: item.color, borderColor: `${item.color}50` }}
      >
        {item.label}
      </Badge>

      <Popover open={colorOpen} onOpenChange={setColorOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
            <Palette className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2 z-[99999]" align="start">
          <div className="grid grid-cols-5 gap-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                className="h-6 w-6 rounded border-2 transition-transform hover:scale-110"
                style={{ backgroundColor: c, borderColor: c === item.color ? "#000" : "transparent" }}
                onClick={() => { onUpdateColor(item.id, c); setColorOpen(false); }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {editing ? (
        <Input
          className="h-7 text-xs flex-1"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
        />
      ) : (
        <span
          className="text-xs flex-1 cursor-pointer hover:underline truncate"
          onClick={() => { setEditValue(item.label); setEditing(true); }}
        >
          {item.label}
        </span>
      )}

      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100" onClick={() => onDelete(item.id)}>
        <Trash2 className="h-3 w-3 text-destructive" />
      </Button>
    </div>
  );
}

function StatusColumn({
  title,
  items,
  onUpdateLabel,
  onUpdateColor,
  onDelete,
  onReorder,
  onAdd,
}: {
  title: string;
  items: StatusItem[];
  onUpdateLabel: (id: string, label: string) => void;
  onUpdateColor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
  onReorder: (items: StatusItem[]) => void;
  onAdd: () => void;
}) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(items, oldIndex, newIndex).map((item, idx) => ({ ...item, sort_order: idx }));
    onReorder(reordered);
  };

  return (
    <div className="flex-1 min-w-0">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      <div className="border rounded-lg max-h-[400px] overflow-y-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <SortableStatusRow
                key={item.id}
                item={item}
                onUpdateLabel={onUpdateLabel}
                onUpdateColor={onUpdateColor}
                onDelete={(id) => setDeleteId(id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      <Button variant="outline" size="sm" className="mt-2 text-xs w-full" onClick={onAdd}>
        <Plus className="h-3 w-3 mr-1" /> Přidat status
      </Button>
      <ConfirmDialog
        open={!!deleteId}
        onConfirm={() => { if (deleteId) onDelete(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
        description="Smazat tento status?"
      />
    </div>
  );
}

export function StatusManagement({ open, onOpenChange }: StatusManagementProps) {
  const { data: projectStatuses = [] } = useProjectStatusOptions();
  const addProject = useAddProjectStatusOption();
  const updateProject = useUpdateProjectStatusOption();
  const deleteProject = useDeleteProjectStatusOption();
  const reorderProject = useReorderProjectStatusOptions();

  const { data: tpvStatuses = [] } = useTPVStatusOptions();
  const addTPV = useAddTPVStatusOption();
  const updateTPV = useUpdateTPVStatusOption();
  const deleteTPV = useDeleteTPVStatusOption();
  const qc = useQueryClient();

  const { isTestUser } = useAuth();

  const handleReorderTPV = async (items: StatusItem[]) => {
    for (const item of items) {
      await supabase.from("tpv_status_options" as any).update({ sort_order: item.sort_order } as any).eq("id", item.id);
    }
    qc.invalidateQueries({ queryKey: ["tpv_status_options"] });
  };

  const handleUpdateTPVColor = async (id: string, color: string) => {
    await supabase.from("tpv_status_options" as any).update({ color } as any).eq("id", id);
    qc.invalidateQueries({ queryKey: ["tpv_status_options"] });
  };

  const tpvItems: StatusItem[] = tpvStatuses.map((s) => ({
    id: s.id,
    label: s.label,
    color: (s as any).color || "#6b7280",
    sort_order: s.sort_order,
  }));

  const noop = () => {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px]">
        <DialogHeader>
          <DialogTitle>Správa statusů</DialogTitle>
        </DialogHeader>
        {isTestUser && <TestModeBanner />}
        <div className={`flex gap-6 ${isTestUser ? "pointer-events-none opacity-80" : ""}`}>
          <StatusColumn
            title="Projektové statusy"
            items={projectStatuses}
            onUpdateLabel={isTestUser ? noop : (id, label) => updateProject.mutate({ id, label })}
            onUpdateColor={isTestUser ? noop : (id, color) => updateProject.mutate({ id, color })}
            onDelete={isTestUser ? noop : (id) => deleteProject.mutate(id)}
            onReorder={isTestUser ? noop : (items) => reorderProject.mutate(items.map((i) => ({ id: i.id, sort_order: i.sort_order })))}
            onAdd={isTestUser ? noop : () => addProject.mutate({ label: "Nový status", color: "#6b7280", sort_order: projectStatuses.length })}
          />
          <StatusColumn
            title="TPV statusy"
            items={tpvItems}
            onUpdateLabel={isTestUser ? noop : (id, label) => updateTPV.mutate({ id, label })}
            onUpdateColor={isTestUser ? noop : handleUpdateTPVColor}
            onDelete={isTestUser ? noop : (id) => deleteTPV.mutate(id)}
            onReorder={isTestUser ? noop : handleReorderTPV}
            onAdd={isTestUser ? noop : () => addTPV.mutate({ label: "Nový status", sort_order: tpvStatuses.length })}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
