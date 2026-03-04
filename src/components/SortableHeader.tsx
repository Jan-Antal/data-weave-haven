import { useState, useRef } from "react";
import { TableHead } from "@/components/ui/table";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface SortableHeaderProps {
  label: string;
  column: string;
  sortCol: string | null;
  sortDir: "asc" | "desc" | null;
  onSort: (col: string) => void;
  className?: string;
  style?: React.CSSProperties;
  editMode?: boolean;
  customLabel?: string;
  onLabelChange?: (newLabel: string) => void;
  onWidthChange?: (newWidth: number) => void;
  /** All current column labels (for duplicate detection on rename) */
  existingLabels?: string[];
  // Drag reorder props
  dragProps?: {
    draggable?: boolean;
    onDragStart?: (e: React.DragEvent) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent) => void;
    onDragEnd?: () => void;
  };
  dropIndicator?: "left" | "right" | null;
  isDragging?: boolean;
}

export function SortableHeader({
  label,
  column,
  sortCol,
  sortDir,
  onSort,
  className = "",
  style,
  editMode,
  customLabel,
  onLabelChange,
  onWidthChange,
  existingLabels,
  dragProps,
  dropIndicator,
  isDragging,
}: SortableHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const thRef = useRef<HTMLTableCellElement>(null);
  const active = sortCol === column;
  const displayLabel = customLabel || label;

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!editMode) return;
    e.stopPropagation();
    setEditValue(displayLabel);
    setEditing(true);
  };

  const handleRenameSubmit = () => {
    const trimmed = editValue.trim();
    if (trimmed && onLabelChange) {
      // Check for duplicate names (case-insensitive), excluding current column's own label
      if (existingLabels) {
        const currentLabel = (customLabel || label).toLowerCase();
        const isDuplicate = existingLabels.some(
          l => l.toLowerCase() === trimmed.toLowerCase() && l.toLowerCase() !== currentLabel
        );
        if (isDuplicate) {
          toast({ title: "Duplicitní název", description: `Sloupec s názvem „${trimmed}" již existuje.`, variant: "destructive" });
          setEditing(false);
          return;
        }
      }
      onLabelChange(trimmed);
    }
    setEditing(false);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const th = thRef.current;
    if (!th) return;
    const startWidth = th.getBoundingClientRect().width;

    const table = th.closest("table");
    if (table) {
      table.style.tableLayout = "fixed";
    }

    const row = th.parentElement;
    const colIndex = row ? Array.from(row.children).indexOf(th) : -1;

    const handleMouseMove = (moveE: MouseEvent) => {
      const newWidth = Math.max(40, startWidth + moveE.clientX - startX);
      th.style.width = `${newWidth}px`;
      th.style.minWidth = `${newWidth}px`;
      th.style.maxWidth = `${newWidth}px`;

      if (table && colIndex >= 0) {
        const rows = table.querySelectorAll("tr");
        rows.forEach((tr) => {
          const cell = tr.children[colIndex] as HTMLElement | undefined;
          if (cell && cell !== th) {
            cell.style.width = `${newWidth}px`;
            cell.style.minWidth = `${newWidth}px`;
            cell.style.maxWidth = `${newWidth}px`;
            cell.style.overflow = "hidden";
          }
        });
      }
    };

    const handleMouseUp = (upE: MouseEvent) => {
      const finalWidth = Math.max(40, startWidth + upE.clientX - startX);
      onWidthChange?.(Math.round(finalWidth));
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (editMode || editing) {
      e.stopPropagation();
      return;
    }
    onSort(column);
  };

  return (
    <TableHead
      ref={thRef}
      className={cn(
        "font-semibold select-none hover:bg-muted/50 relative",
        editMode && dragProps?.draggable ? "cursor-grab" : editMode ? "cursor-default" : "cursor-pointer",
        editMode && "border-b-2 border-accent",
        isDragging && "opacity-40",
        className
      )}
      style={{ ...style, overflow: "hidden" }}
      onClick={handleClick}
      draggable={dragProps?.draggable}
      onDragStart={dragProps?.onDragStart}
      onDragOver={dragProps?.onDragOver}
      onDrop={dragProps?.onDrop}
      onDragEnd={dragProps?.onDragEnd}
    >
      {/* Drop indicator lines */}
      {dropIndicator === "left" && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-info z-20 rounded-full" />
      )}
      {dropIndicator === "right" && (
        <div className="absolute right-0 top-0 bottom-0 w-[3px] bg-info z-20 rounded-full" />
      )}
      <div className="flex items-center gap-1 pr-2">
        {editing ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={handleRenameSubmit}
            className="bg-transparent border-b border-accent outline-none text-xs font-semibold w-full text-foreground"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="truncate"
            onDoubleClick={handleDoubleClick}
            title={displayLabel}
          >
            {displayLabel}
          </span>
        )}
        {!editing && !editMode && active && sortDir === "asc" && <ArrowUp className="h-3 w-3 shrink-0" />}
        {!editing && !editMode && active && sortDir === "desc" && <ArrowDown className="h-3 w-3 shrink-0" />}
        {!editing && !editMode && !active && <ArrowUpDown className="h-3 w-3 opacity-30 shrink-0" />}
      </div>
      {editMode && (
        <div
          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize bg-accent/40 hover:bg-accent transition-colors z-10"
          onMouseDown={handleResizeStart}
        />
      )}
    </TableHead>
  );
}
