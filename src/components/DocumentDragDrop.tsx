import { useState, useCallback, useRef } from "react";
import { X, MoveRight, GripVertical, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SPFile } from "@/hooks/useSharePointDocs";

interface DOC_CAT {
  key: string;
  icon: string;
  label: string;
}

interface FileSelectionBarProps {
  selectedCount: number;
  categories: DOC_CAT[];
  currentCategory: string;
  onMoveTo: (destKey: string) => void;
  onClear: () => void;
}

export function FileSelectionBar({ selectedCount, categories, currentCategory, onMoveTo, onClear }: FileSelectionBarProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-primary/10 border border-primary/20 text-xs">
      <span className="text-primary font-medium whitespace-nowrap">
        Vybráno: {selectedCount} {selectedCount === 1 ? "soubor" : selectedCount < 5 ? "soubory" : "souborů"}
      </span>
      <div className="relative ml-auto" ref={dropdownRef}>
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-[10px] gap-1 px-2"
          onClick={() => setShowDropdown((p) => !p)}
        >
          <MoveRight className="h-3 w-3" />
          Přesunout do…
        </Button>
        {showDropdown && (
          <div className="absolute bottom-full right-0 mb-1 w-48 bg-popover border border-border rounded-md shadow-lg z-50 py-1">
            {categories
              .filter((c) => c.key !== currentCategory)
              .map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors"
                  onClick={() => {
                    onMoveTo(c.key);
                    setShowDropdown(false);
                  }}
                >
                  <span>{c.icon}</span>
                  <span>{c.label}</span>
                </button>
              ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground transition-colors"
        onClick={onClear}
        title="Zrušit výběr"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Drag handle wrapper for file rows ──────────────────────────

interface DraggableFileRowProps {
  file: SPFile;
  categoryKey: string;
  isSelected: boolean;
  isDragging: boolean;
  children: React.ReactNode;
  onSelect: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  canDrag: boolean;
}

export function DraggableFileRow({
  file,
  categoryKey,
  isSelected,
  isDragging,
  children,
  onSelect,
  onDragStart,
  onDragEnd,
  canDrag,
}: DraggableFileRowProps) {
  return (
    <div
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "relative transition-opacity",
        isDragging && "opacity-50",
        isSelected && "bg-primary/5 rounded"
      )}
    >
      {/* Checkbox overlay on hover */}
      {canDrag && (
        <button
          type="button"
          className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 z-10 w-4 h-4 rounded border flex items-center justify-center transition-all",
            isSelected
              ? "border-primary bg-primary text-primary-foreground opacity-100"
              : "border-border bg-background text-transparent opacity-0 group-hover:opacity-100 hover:opacity-100"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(e);
          }}
        >
          {isSelected && <Check className="h-2.5 w-2.5" />}
        </button>
      )}
      {children}
    </div>
  );
}

// ─── Drop target overlay for folder headers ─────────────────────

interface FolderDropTargetProps {
  categoryKey: string;
  isValidTarget: boolean;
  isDragActive: boolean;
  children: React.ReactNode;
  onDrop: (destCategoryKey: string) => void;
}

export function FolderDropTarget({
  categoryKey,
  isValidTarget,
  isDragActive,
  children,
  onDrop,
}: FolderDropTargetProps) {
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isValidTarget) {
      e.dataTransfer.dropEffect = "move";
    } else {
      e.dataTransfer.dropEffect = "none";
    }
  }, [isValidTarget]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isValidTarget) setIsOver(true);
  }, [isValidTarget]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    if (isValidTarget) {
      onDrop(categoryKey);
    }
  }, [isValidTarget, onDrop, categoryKey]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "transition-all rounded-md",
        isDragActive && isValidTarget && "ring-2 ring-primary/30",
        isOver && isValidTarget && "ring-2 ring-primary bg-primary/10"
      )}
    >
      {children}
    </div>
  );
}
