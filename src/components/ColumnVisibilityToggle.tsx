import { Columns3, GripVertical, Plus, Trash2 } from "lucide-react";
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
import { useAllCustomColumns, type CustomColumnDef } from "@/hooks/useCustomColumns";
import { AddCustomColumnDialog } from "./AddCustomColumnDialog";
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
import { ConfirmDialog } from "./ConfirmDialog";

// ── Props ───────────────────────────────────────────────────────────
type Props = {
  editMode?: boolean;
  onToggleEditMode?: () => void;
} & (
  | { tabKey: "projectInfo" | "pmStatus" | "tpvStatus"; standalone?: never }
  | {
      tabKey?: never;
      standalone: true;
      columns: { key: string; label: string; locked?: boolean }[];
      groupLabel: string;
      labelTab: string;
      tableName?: string;
      isVisible: (key: string) => boolean;
      toggleColumn: (key: string) => void;
    }
);

const TAB_TO_LABEL_KEY: Record<string, string> = {
  projectInfo: "project-info",
  pmStatus: "pm-status",
  tpvStatus: "tpv-status",
};

const ALL_KEYS = ALL_COLUMNS.map((c) => c.key);
const LABEL_MAP = Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, c.label]));

const TAB_TO_GROUP_LABEL: Record<string, string> = {
  projectInfo: "Project Info",
  pmStatus: "PM Status",
  tpvStatus: "TPV Status",
};

const GROUP_LABEL_TO_KEY: Record<string, string> = {
  "Project Info": "project-info",
  "PM Status": "pm-status",
  "TPV Status": "tpv-status",
};

function useCollapsedGroups(storageKey: string, defaultExpandedGroup?: string) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(`col-panel-collapsed-${storageKey}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    if (!defaultExpandedGroup) return {};
    const init: Record<string, boolean> = {};
    COLUMN_GROUPS.forEach((g) => {
      init[g.label] = g.label !== defaultExpandedGroup;
    });
    return init;
  });

  const toggle = useCallback((label: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      localStorage.setItem(`col-panel-collapsed-${storageKey}`, JSON.stringify(next));
      return next;
    });
  }, [storageKey]);

  return { collapsed, toggle };
}

function SortableColumnRow({
  colKey, label, checked, onToggle, canDrag, onDelete, isCustom,
}: {
  colKey: string; label: string; checked: boolean; onToggle: () => void; canDrag: boolean; onDelete?: () => void; isCustom?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: colKey, disabled: !canDrag,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm">
      {canDrag && (
        <div {...attributes} {...listeners} className="cursor-grab shrink-0 p-0.5">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      )}
      <label className="flex items-center gap-2 flex-1 cursor-pointer px-1">
        <Checkbox checked={checked} onCheckedChange={onToggle} />
        <span>{label}</span>
        {isCustom && <span className="text-xs italic text-muted-foreground ml-1">custom</span>}
      </label>
      {onDelete && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(); }} className="shrink-0 p-0.5 hover:text-destructive">
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export function ColumnVisibilityToggle(props: Props) {
  const { editMode, onToggleEditMode } = props;
  const isStandalone = !!props.standalone;

  const allVis = useAllColumnVisibility();
  const { canEditColumns } = useAuth();

  const labelKey = isStandalone ? props.labelTab : TAB_TO_LABEL_KEY[props.tabKey!];
  const { getLabel: dbGetLabel, getOrderedKeys, updateOrder } = useColumnLabels(labelKey);

  const collapseKey = isStandalone ? props.labelTab : props.tabKey!;
  const defaultExpanded = isStandalone ? undefined : TAB_TO_GROUP_LABEL[props.tabKey!];
  const { collapsed, toggle: toggleGroup } = useCollapsedGroups(collapseKey, defaultExpanded);

  // Custom columns
  const customTableName = isStandalone ? (props.tableName || "tpv_items") : "projects";
  const { columns: customColumns, deleteColumn } = useAllCustomColumns(customTableName);

  const [addDialogState, setAddDialogState] = useState<{ open: boolean; groupKey: string; groupLabel: string; tableName: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Resolve visibility state
  const visState: Pick<ColumnVisibilityState, "isVisible" | "toggleColumn" | "columns"> = isStandalone
    ? { isVisible: props.isVisible, toggleColumn: props.toggleColumn, columns: props.columns.map(c => ({ key: c.key, label: c.label, locked: c.locked })) }
    : allVis[props.tabKey!];

  // Resolve groups
  const groups = isStandalone
    ? [{ label: props.groupLabel, keys: props.columns.filter(c => !c.locked).map(c => c.key) }]
    : COLUMN_GROUPS;

  // Resolve label map
  const labelMap = isStandalone
    ? Object.fromEntries(props.columns.map(c => [c.key, c.label]))
    : LABEL_MAP;

  // Build custom column map per group
  const customByGroup = useMemo(() => {
    const map: Record<string, CustomColumnDef[]> = {};
    for (const cc of customColumns) {
      if (!map[cc.group_key]) map[cc.group_key] = [];
      map[cc.group_key].push(cc);
    }
    return map;
  }, [customColumns]);

  // Build custom label map
  const customLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const cc of customColumns) map[cc.column_key] = cc.label;
    return map;
  }, [customColumns]);

  // Merge all keys: static + custom
  const allKeys = useMemo(() => {
    const staticKeys = isStandalone
      ? props.columns!.filter(c => !c.locked).map(c => c.key)
      : ALL_KEYS;
    const customKeys = customColumns.map(c => c.column_key);
    return [...staticKeys, ...customKeys.filter(k => !staticKeys.includes(k))];
  }, [isStandalone, customColumns]);

  const allKeysKey = allKeys.join(",");
  const orderedKeys = useMemo(() => getOrderedKeys(allKeys), [getOrderedKeys, allKeysKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeKey = active.id as string;
    const overKey = over.id as string;
    const oldIndex = orderedKeys.indexOf(activeKey);
    const newIndex = orderedKeys.indexOf(overKey);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(orderedKeys, oldIndex, newIndex);
    updateOrder(newOrder);
  };

  const resolveLabel = useCallback(
    (key: string) => {
      // For custom columns, always use label from custom_column_definitions (single source of truth)
      const customLabel = customLabelMap[key];
      if (customLabel) return customLabel;
      return dbGetLabel(key, labelMap[key] || key);
    },
    [dbGetLabel, labelMap, customLabelMap]
  );

  const getGroupKey = (groupLabel: string) => {
    if (isStandalone) return props.labelTab;
    return GROUP_LABEL_TO_KEY[groupLabel] || groupLabel;
  };

  const renderGroupContent = (group: { label: string; keys: string[] }, isAdmin: boolean) => {
    const groupKey = getGroupKey(group.label);
    const staticKeys = group.keys.filter((k) => orderedKeys.includes(k));
    const customCols = customByGroup[groupKey] || [];
    const customKeys = customCols.map(c => c.column_key);
    const allGroupKeys = [...staticKeys, ...customKeys];
    const sortedGroupKeys = allGroupKeys.sort((a, b) => orderedKeys.indexOf(a) - orderedKeys.indexOf(b));

    if (sortedGroupKeys.length === 0 && !canEditColumns) return null;
    const isCollapsed = !!collapsed[group.label];

    return (
      <div key={group.label} className="mb-2">
        {groups.length > 1 ? (
          <button
            type="button"
            onClick={() => toggleGroup(group.label)}
            className="flex items-center gap-1 w-full text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1 hover:bg-muted/30 rounded transition-colors"
          >
            {isCollapsed ? <ChevronRight className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
            {group.label}
          </button>
        ) : (
          <div className="flex items-center gap-1 w-full text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1">
            {group.label}
          </div>
        )}
        {!isCollapsed && (
          <>
            {sortedGroupKeys.map((key) => {
              const isCustom = customKeys.includes(key);
              if (isAdmin) {
                  return (
                    <SortableColumnRow
                      key={key}
                      colKey={key}
                      label={resolveLabel(key)}
                      checked={visState.isVisible(key)}
                      onToggle={() => visState.toggleColumn(key)}
                      canDrag={true}
                      isCustom={isCustom}
                      onDelete={isCustom ? () => setDeleteConfirm(customCols.find(c => c.column_key === key)?.id || null) : undefined}
                    />
                  );
              }
              return (
                <label key={key} className="flex items-center gap-2 px-2 py-1 rounded text-sm text-muted-foreground">
                  <Checkbox checked={visState.isVisible(key)} disabled />
                  <span>{resolveLabel(key)}</span>
                  {isCustom && <span className="text-xs italic text-muted-foreground ml-1">custom</span>}
                </label>
              );
            })}
            {canEditColumns && (
              <button
                type="button"
                onClick={() => setAddDialogState({
                  open: true,
                  groupKey,
                  groupLabel: group.label,
                  tableName: customTableName,
                })}
                className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors w-full"
              >
                <Plus className="h-3 w-3" />
                <span>Přidat sloupec</span>
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <TableHead
        className="w-[32px] min-w-[32px] p-0 sticky right-0 z-20"
        style={{ background: "linear-gradient(hsl(var(--primary) / 0.05), hsl(var(--primary) / 0.05)), hsl(var(--card))" }}
      >
        <Popover>
          <PopoverTrigger asChild>
            <button className="relative p-2 rounded hover:bg-muted/50 transition-colors" title="Zobrazení sloupců" type="button">
              <Columns3 className="h-4 w-4 text-muted-foreground" />
              {editMode && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" />}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end" side="bottom" avoidCollisions collisionPadding={16} sideOffset={4}
            className="w-60 p-0 z-[9999] bg-popover border shadow-md flex flex-col"
            style={{ maxHeight: "calc(100vh - 120px)" }}
          >
            {onToggleEditMode && (
              <div className="p-2 pb-0 shrink-0">
                <Button variant={editMode ? "default" : "outline"} size="sm" className="w-full mb-2 text-xs" onClick={onToggleEditMode}>
                  {editMode ? "Dokončit úpravy" : "Upravit sloupce"}
                </Button>
                <Separator />
              </div>
            )}
            <div className="overflow-y-auto p-2 pt-1">
              {canEditColumns ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={orderedKeys} strategy={verticalListSortingStrategy}>
                    {groups.map((group) => renderGroupContent(group, true))}
                  </SortableContext>
                </DndContext>
              ) : (
                groups.map((group) => renderGroupContent(group, false))
              )}
            </div>
          </PopoverContent>
        </Popover>
      </TableHead>

      {addDialogState && (
        <AddCustomColumnDialog
          open={addDialogState.open}
          onOpenChange={(open) => { if (!open) setAddDialogState(null); }}
          tableName={addDialogState.tableName}
          groupKey={addDialogState.groupKey}
          groupLabel={addDialogState.groupLabel}
        />
      )}
      <ConfirmDialog
        open={!!deleteConfirm}
        onConfirm={() => { if (deleteConfirm) { deleteColumn.mutate(deleteConfirm); setDeleteConfirm(null); } }}
        onCancel={() => setDeleteConfirm(null)}
        title="Smazat sloupec"
        description={`Opravdu chcete smazat sloupec „${deleteConfirm ? (customColumns.find(c => c.id === deleteConfirm)?.label ?? "") : ""}"? Tato akce smaže sloupec a všechna jeho data ze všech projektů. Tuto akci nelze vrátit.`}
      />
    </>
  );
}
