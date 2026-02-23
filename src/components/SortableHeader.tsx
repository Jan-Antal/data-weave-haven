import { useState, useRef } from "react";
import { TableHead } from "@/components/ui/table";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

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
    if (editValue.trim() && onLabelChange) {
      onLabelChange(editValue.trim());
    }
    setEditing(false);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = thRef.current?.getBoundingClientRect().width || 100;

    const handleMouseMove = (moveE: MouseEvent) => {
      const newWidth = Math.max(50, startWidth + moveE.clientX - startX);
      if (thRef.current) {
        thRef.current.style.width = `${newWidth}px`;
        thRef.current.style.minWidth = `${newWidth}px`;
      }
    };

    const handleMouseUp = (upE: MouseEvent) => {
      const finalWidth = Math.max(50, startWidth + upE.clientX - startX);
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

  return (
    <TableHead
      ref={thRef}
      className={cn(
        "font-semibold cursor-pointer select-none hover:bg-muted/50 relative",
        editMode && "border-b-2 border-accent",
        className
      )}
      style={style}
      onClick={() => !editing && onSort(column)}
    >
      <div className="flex items-center gap-1 pr-1">
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
        {!editing && active && sortDir === "asc" && <ArrowUp className="h-3 w-3 shrink-0" />}
        {!editing && active && sortDir === "desc" && <ArrowDown className="h-3 w-3 shrink-0" />}
        {!editing && !active && <ArrowUpDown className="h-3 w-3 opacity-30 shrink-0" />}
      </div>
      {editMode && (
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-accent/50 hover:bg-accent hover:w-1.5 transition-all z-10"
          onMouseDown={handleResizeStart}
        />
      )}
    </TableHead>
  );
}
