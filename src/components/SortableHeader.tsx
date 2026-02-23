import { useState, useRef, useEffect } from "react";
import { TableHead } from "@/components/ui/table";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface SortableHeaderProps {
  label: string;
  column: string;
  sortCol: string | null;
  sortDir: "asc" | "desc" | null;
  onSort: (col: string) => void;
  className?: string;
  /** Custom display label (from DB) */
  customLabel?: string;
  /** Whether this column has a custom label */
  isCustom?: boolean;
  /** Called to rename */
  onRename?: (columnKey: string, newLabel: string) => void;
  /** Called to reset to default */
  onResetLabel?: (columnKey: string) => void;
}

export function SortableHeader({
  label,
  column,
  sortCol,
  sortDir,
  onSort,
  className = "",
  customLabel,
  isCustom,
  onRename,
  onResetLabel,
}: SortableHeaderProps) {
  const active = sortCol === column;
  const displayLabel = customLabel || label;

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(displayLabel);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!onRename) return;
    e.preventDefault();
    e.stopPropagation();
    setEditValue(displayLabel);
    setEditing(true);
  };

  const finishEdit = () => {
    setEditing(false);
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === displayLabel) return;
    setPendingName(trimmed);
    setConfirmOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      finishEdit();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  };

  const confirmRename = () => {
    onRename?.(column, pendingName);
    setConfirmOpen(false);
    setPendingName("");
  };

  const cancelRename = () => {
    setConfirmOpen(false);
    setPendingName("");
  };

  const resetDefault = () => {
    onResetLabel?.(column);
    setConfirmOpen(false);
    setPendingName("");
  };

  return (
    <TableHead
      className={`font-semibold cursor-pointer select-none hover:bg-muted/50 ${className}`}
      onClick={() => {
        if (!editing) onSort(column);
      }}
      onDoubleClick={handleDoubleClick}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="bg-background border rounded px-1 py-0.5 text-xs w-full min-w-[60px] font-semibold"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={finishEdit}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
          <PopoverTrigger asChild>
            <div className="flex items-center gap-1">
              {isCustom && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
              <span>{displayLabel}</span>
              {active && sortDir === "asc" && <ArrowUp className="h-3 w-3" />}
              {active && sortDir === "desc" && <ArrowDown className="h-3 w-3" />}
              {!active && <ArrowUpDown className="h-3 w-3 opacity-30" />}
            </div>
          </PopoverTrigger>
          {confirmOpen && (
            <PopoverContent
              className="w-72 p-3 z-[99999]"
              align="start"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm mb-3">
                Přejmenovat sloupec &lsquo;{displayLabel}&rsquo; na &lsquo;{pendingName}&rsquo;?
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={cancelRename}>
                  Zrušit
                </Button>
                <Button size="sm" onClick={confirmRename}>
                  Potvrdit
                </Button>
              </div>
              {(isCustom || pendingName !== label) && onResetLabel && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground underline mt-2 block"
                  onClick={resetDefault}
                >
                  Obnovit výchozí
                </button>
              )}
            </PopoverContent>
          )}
        </Popover>
      )}
    </TableHead>
  );
}
