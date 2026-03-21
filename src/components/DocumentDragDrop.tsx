import { useState, useCallback, useRef, useEffect } from "react";
import { X, MoveRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SPFile } from "@/hooks/useSharePointDocs";

interface DOC_CAT {
  key: string;
  icon: string;
  label: string;
}

// ─── Custom drag ghost creator ──────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createDragGhost(fileName: string, count: number): HTMLElement {
  const ghost = document.createElement("div");
  ghost.style.cssText = `
    position: fixed; top: -1000px; left: -1000px;
    background: hsl(0 0% 100%); border: 1px solid hsl(var(--border));
    border-radius: 8px; padding: 6px 12px;
    display: flex; align-items: center; gap: 8px;
    font-size: 12px; font-family: inherit;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    white-space: nowrap; max-width: 240px; z-index: 999999;
    pointer-events: none;
  `;

  if (count > 1) {
    ghost.style.background = "hsl(var(--primary) / 0.08)";
    ghost.style.borderColor = "hsl(var(--primary))";
    ghost.innerHTML = `
      <span style="font-size:14px">📄</span>
      <span style="font-weight:500;color:hsl(var(--primary))">Přesunout ${count} ${count < 5 ? "soubory" : "souborů"}</span>
    `;
  } else {
    ghost.innerHTML = `
      <span style="font-size:14px">📄</span>
      <span style="overflow:hidden;text-overflow:ellipsis;max-width:180px;color:hsl(var(--foreground))">${escapeHtml(fileName)}</span>
    `;
  }

  return ghost;
}

// ─── Selection bar ──────────────────────────────────────────────

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

// ─── Drop target overlay for folder headers ─────────────────────

interface FolderDropTargetProps {
  categoryKey: string;
  categoryLabel?: string;
  isValidTarget: boolean;
  isInvalidTarget: boolean;
  isDragActive: boolean;
  children: React.ReactNode;
  onDrop: (destCategoryKey: string) => void;
}

export function FolderDropTarget({
  categoryKey,
  categoryLabel,
  isValidTarget,
  isInvalidTarget,
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
    // Only set isOver false if leaving the container, not entering a child
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as Node).contains(related)) return;
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
        "transition-all duration-100 rounded-md relative",
        // Valid target during drag: dashed border
        isDragActive && isValidTarget && !isOver && "ring-2 ring-dashed ring-primary/30 bg-primary/[0.03]",
        // Hovered valid target: solid border + bg
        isOver && isValidTarget && "ring-2 ring-primary bg-primary/10 scale-[1.01]",
        // Invalid target (current folder): red dashed
        isDragActive && isInvalidTarget && "ring-2 ring-dashed ring-destructive/30 bg-destructive/[0.03] opacity-60",
      )}
    >
      {children}
      {/* "→ Přesunout sem" indicator on hover */}
      {isOver && isValidTarget && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] font-medium text-primary animate-in fade-in-0 duration-100 pointer-events-none z-10">
          <MoveRight className="h-3 w-3" />
          <span>Přesunout sem</span>
        </div>
      )}
    </div>
  );
}

// ─── Hook for managing drag ghost + body cursor ─────────────────

export function useFileDragVisuals() {
  const ghostRef = useRef<HTMLElement | null>(null);

  const attachGhost = useCallback((e: React.DragEvent, fileName: string, count: number) => {
    // Clean up previous ghost if any
    if (ghostRef.current) {
      document.body.removeChild(ghostRef.current);
    }
    const ghost = createDragGhost(fileName, count);
    document.body.appendChild(ghost);
    ghostRef.current = ghost;
    e.dataTransfer.setDragImage(ghost, 20, 20);

    // Set body cursor
    document.body.style.cursor = "grabbing";
    document.body.classList.add("file-dragging-active");
  }, []);

  const cleanup = useCallback(() => {
    if (ghostRef.current) {
      try { document.body.removeChild(ghostRef.current); } catch {}
      ghostRef.current = null;
    }
    document.body.style.cursor = "";
    document.body.classList.remove("file-dragging-active");
  }, []);

  // Ensure cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return { attachGhost, cleanup };
}

// ─── Flash animation hook for successful drop ───────────────────

export function useDropFlash() {
  const [flashingCategory, setFlashingCategory] = useState<string | null>(null);

  const flash = useCallback((categoryKey: string) => {
    setFlashingCategory(categoryKey);
    setTimeout(() => setFlashingCategory(null), 600);
  }, []);

  return { flashingCategory, flash };
}
