import { Columns3, GripVertical } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  useAllColumnVisibility,
  COLUMN_GROUPS,
  ALL_COLUMNS,
  ColumnVisibilityState,
} from "./ColumnVisibilityContext";
import { useAuth } from "@/hooks/useAuth";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState, useCallback } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  tabKey: "projectInfo" | "pmStatus" | "tpvStatus";
  editMode?: boolean;
  onToggleEditMode?: () => void;
}

const TAB_TO_LABEL_KEY: Record<string, string> = {
  projectInfo: "project-info",
  pmStatus: "pm-status",
  tpvStatus: "tpv-status",
};

// All toggleable keys in their default order
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key);
const LABEL_MAP = Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, c.label]));

// Map tab key to its native group label for default-expand logic
const TAB_TO_GROUP_LABEL: Record<string, string> = {
  projectInfo: "Project Info",
  pmStatus: "PM Status",
  tpvStatus: "TPV Status",
};

function useCollapsedGroups(tabKey: string) {
  const storageKey = `col-panel-collapsed-${tabKey}`;
  const defaultGroup = TAB_TO_GROUP_LABEL[tabKey];

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    // Default: own group expanded, others collapsed
    const init: Record<string, boolean> = {};
    COLUMN_GROUPS.forEach((g) => {
      init[g.label] = g.label !== defaultGroup;
    });
    return init;
  });

  const toggle = useCallback((label: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  return { collapsed, toggle };
}

function SortableColumnRow({
  colKey,
  label,
  checked,
  onToggle,
  canDrag,
}: {
  colKey: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
  canDrag: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: colKey,
    disabled: !canDrag,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm"
    >
      {canDrag && (
        <div {...attributes} {...listeners} className="cursor-grab shrink-0 p-0.5">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      <label className="flex items-center gap-2 flex-1 cursor-pointer px-1">
        <Checkbox checked={checked} onCheckedChange={onToggle} />
        <span>{label}</span>
      </label>
    </div>
  );
}

export function ColumnVisibilityToggle({ tabKey, editMode, onToggleEditMode }: Props) {
  const allVis = useAllColumnVisibility();
  const state: ColumnVisibilityState = allVis[tabKey];
  const { canEditColumns } = useAuth();
  const labelKey = TAB_TO_LABEL_KEY[tabKey];
  const { getLabel, getOrderedKeys, updateOrder } = useColumnLabels(labelKey);
  const { collapsed, toggle: toggleGroup } = useCollapsedGroups(tabKey);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Get the ordered list of all toggleable keys
  const orderedKeys = useMemo(() => getOrderedKeys(ALL_KEYS), [getOrderedKeys]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeKey = active.id as string;
    const overKey = over.id as string;

    // Find which group both belong to — only allow within-group reorder
    const activeGroup = COLUMN_GROUPS.find((g) => g.keys.includes(activeKey));
    const overGroup = COLUMN_GROUPS.find((g) => g.keys.includes(overKey));
    if (!activeGroup || !overGroup || activeGroup !== overGroup) return;

    const oldIndex = orderedKeys.indexOf(activeKey);
    const newIndex = orderedKeys.indexOf(overKey);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(orderedKeys, oldIndex, newIndex);
    updateOrder(newOrder);
  };

  /** Resolve the display label for a column key — uses DB custom label if set */
  const resolveLabel = useCallback(
    (key: string) => getLabel(key, LABEL_MAP[key] || key),
    [getLabel]
  );

  return (
    <TableHead
      className="w-[32px] min-w-[32px] p-0 sticky right-0 z-20"
      style={{
        background:
          "linear-gradient(hsl(var(--primary) / 0.05), hsl(var(--primary) / 0.05)), hsl(var(--card))",
      }}
    >
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="relative p-2 rounded hover:bg-muted/50 transition-colors"
            title="Zobrazení sloupců"
            type="button"
          >
            <Columns3 className="h-4 w-4 text-muted-foreground" />
            {editMode && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" />
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          side="bottom"
          avoidCollisions
          collisionPadding={16}
          sideOffset={4}
          className="w-60 p-0 z-[9999] bg-popover border shadow-md flex flex-col"
          style={{ maxHeight: "calc(100vh - 120px)" }}
        >
          {/* Edit-mode button */}
          {onToggleEditMode && (
            <div className="p-2 pb-0 shrink-0">
              <Button
                variant={editMode ? "default" : "outline"}
                size="sm"
                className="w-full mb-2 text-xs"
                onClick={onToggleEditMode}
              >
                {editMode ? "Dokončit úpravy" : "Upravit sloupce"}
              </Button>
              <Separator />
            </div>
          )}

          {/* Scrollable column list with drag-and-drop for admin */}
          <div className="overflow-y-auto p-2 pt-1">
            {canEditColumns ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={orderedKeys} strategy={verticalListSortingStrategy}>
                  {COLUMN_GROUPS.map((group) => {
                    const groupKeys = group.keys.filter((k) => orderedKeys.includes(k));
                    const sortedGroupKeys = groupKeys.sort(
                      (a, b) => orderedKeys.indexOf(a) - orderedKeys.indexOf(b)
                    );
                    if (sortedGroupKeys.length === 0) return null;
                    const isCollapsed = !!collapsed[group.label];

                    return (
                      <div key={group.label} className="mb-2">
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.label)}
                          className="flex items-center gap-1 w-full text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1 hover:bg-muted/30 rounded transition-colors"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-3 w-3 shrink-0" />
                          ) : (
                            <ChevronDown className="h-3 w-3 shrink-0" />
                          )}
                          {group.label}
                        </button>
                        {!isCollapsed && sortedGroupKeys.map((key) => (
                          <SortableColumnRow
                            key={key}
                            colKey={key}
                            label={resolveLabel(key)}
                            checked={state.isVisible(key)}
                            onToggle={() => state.toggleColumn(key)}
                            canDrag={true}
                          />
                        ))}
                      </div>
                    );
                  })}
                </SortableContext>
              </DndContext>
            ) : (
              // Non-admin: read-only view, no drag, no toggle
              COLUMN_GROUPS.map((group) => {
                const groupCols = state.columns.filter(
                  (c) => !c.locked && group.keys.includes(c.key)
                );
                if (groupCols.length === 0) return null;
                const isCollapsed = !!collapsed[group.label];

                return (
                  <div key={group.label} className="mb-2">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.label)}
                      className="flex items-center gap-1 w-full text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1 hover:bg-muted/30 rounded transition-colors"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3 w-3 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      )}
                      {group.label}
                    </button>
                    {!isCollapsed && groupCols.map((col) => (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 px-2 py-1 rounded text-sm text-muted-foreground"
                      >
                        <Checkbox
                          checked={state.isVisible(col.key)}
                          disabled
                        />
                        <span>{resolveLabel(col.key)}</span>
                      </label>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </TableHead>
  );
}
