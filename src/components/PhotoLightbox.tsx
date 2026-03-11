import { useEffect, useState, useCallback, useRef, memo, useMemo } from "react";
import { X, Download, ChevronLeft, ChevronRight, ChevronDown, Loader2, ExternalLink, Trash2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { SPFile } from "@/hooks/useSharePointDocs";

// ─── Helpers ────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic", "heif", "tiff", "tif"]);

export function isImageFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

export function isReklamace(name: string): boolean {
  return name.startsWith("REC_");
}

/** Generate a timestamped upload filename */
export function generatePhotoFilename(isReklamace = false): string {
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  return isReklamace ? `REC_${ts}_foto.jpg` : `${ts}_foto.jpg`;
}

/** Extract date from filename like 2026-03-10_143022_foto.jpg or REC_2026-03-10_... */
function parseDateFromFilename(name: string): Date | null {
  // Match YYYY-MM-DD pattern
  const match = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const d = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    if (!isNaN(d.getTime())) return d;
  }
  // Fallback: try old format foto_YYYYMMDD_...
  const oldMatch = name.match(/foto_(\d{4})(\d{2})(\d{2})/);
  if (oldMatch) {
    const d = new Date(parseInt(oldMatch[1]), parseInt(oldMatch[2]) - 1, parseInt(oldMatch[3]));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/** Extract time from filename like 2026-03-10_143022_foto.jpg */
function parseTimeFromFilename(name: string): string | null {
  const match = name.match(/(\d{4})-\d{2}-\d{2}_(\d{2})(\d{2})(\d{2})/);
  if (match) return `${match[2]}:${match[3]}`;
  const oldMatch = name.match(/foto_\d{8}_(\d{2})(\d{2})(\d{2})/);
  if (oldMatch) return `${oldMatch[1]}:${oldMatch[2]}`;
  return null;
}

function formatCzechDate(d: Date): string {
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface DateGroup {
  date: Date;
  key: string;
  files: SPFile[];
}

function groupByDate(files: SPFile[], sortNewest: boolean): DateGroup[] {
  const map = new Map<string, { date: Date; files: SPFile[] }>();
  const ungrouped: SPFile[] = [];

  for (const f of files) {
    const d = parseDateFromFilename(f.name);
    if (d) {
      const k = dateKey(d);
      if (!map.has(k)) map.set(k, { date: d, files: [] });
      map.get(k)!.files.push(f);
    } else {
      ungrouped.push(f);
    }
  }

  const groups = Array.from(map.entries()).map(([key, val]) => ({
    key,
    date: val.date,
    files: val.files.sort((a, b) => a.name.localeCompare(b.name)),
  }));

  groups.sort((a, b) => sortNewest ? b.date.getTime() - a.date.getTime() : a.date.getTime() - b.date.getTime());

  if (ungrouped.length > 0) {
    groups.push({ key: "__other", date: new Date(0), files: ungrouped });
  }

  return groups;
}

/** Session-level cache of loaded thumbnail elements */
const thumbCache = new Set<string>();

// ─── Timeline Grid ──────────────────────────────────────────────

type FilterMode = "all" | "reklamace";

interface PhotoTimelineGridProps {
  files: SPFile[];
  onOpenLightbox: (flatIndex: number) => void;
  onDelete?: (file: SPFile) => void;
  canDelete?: boolean;
  maxHeight?: string;
  // Drag & drop support
  isDraggable?: boolean;
  onDragStart?: (e: React.DragEvent, file: SPFile) => void;
  onDragEnd?: () => void;
  draggingFileId?: string | null;
  // Selection support
  selectedIds?: Set<string>;
  onToggleSelect?: (fileId: string, files: SPFile[], e?: React.MouseEvent) => void;
}

export function PhotoTimelineGrid({
  files,
  onOpenLightbox,
  onDelete,
  canDelete,
  maxHeight = "260px",
  isDraggable,
  onDragStart,
  onDragEnd,
  draggingFileId,
  selectedIds,
  onToggleSelect,
}: PhotoTimelineGridProps) {
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sortNewest, setSortNewest] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const imageFiles = useMemo(() => files.filter((f) => isImageFile(f.name)), [files]);
  const filteredFiles = useMemo(
    () => filter === "reklamace" ? imageFiles.filter((f) => isReklamace(f.name)) : imageFiles,
    [imageFiles, filter]
  );
  const groups = useMemo(() => groupByDate(filteredFiles, sortNewest), [filteredFiles, sortNewest]);

  // Build flat index map for lightbox navigation (across all filtered files)
  const flatFiles = useMemo(() => groups.flatMap((g) => g.files), [groups]);

  const reklamaceCount = useMemo(() => imageFiles.filter((f) => isReklamace(f.name)).length, [imageFiles]);

  const toggleCollapse = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (imageFiles.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">Žádné fotky</p>;
  }

  return (
    <div className="space-y-2">
      {/* Filter bar */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          className={cn(
            "px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
            filter === "all"
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-transparent border-border text-muted-foreground hover:bg-accent"
          )}
          onClick={() => setFilter("all")}
        >
          Vše ({imageFiles.length})
        </button>
        {reklamaceCount > 0 && (
          <button
            type="button"
            className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors",
              filter === "reklamace"
                ? "bg-red-500/10 border-red-400/40 text-red-600"
                : "bg-transparent border-border text-muted-foreground hover:bg-accent"
            )}
            onClick={() => setFilter("reklamace")}
          >
            🔴 Reklamace ({reklamaceCount})
          </button>
        )}
        <button
          type="button"
          className="ml-auto px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setSortNewest((p) => !p)}
        >
          {sortNewest ? "↓ Nejnovější" : "↑ Nejstarší"}
        </button>
      </div>

      {/* Timeline groups */}
      <div className="space-y-2 overflow-y-auto" style={{ maxHeight }}>
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.key);
          return (
            <div key={group.key}>
              {/* Group header */}
              <button
                type="button"
                className="flex items-center gap-1.5 w-full text-left py-1 text-xs group hover:bg-accent/30 rounded px-1 -mx-1 transition-colors"
                onClick={() => toggleCollapse(group.key)}
              >
                <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform shrink-0", isCollapsed && "-rotate-90")} />
                <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="font-medium text-foreground">
                  {group.key === "__other" ? "Ostatní" : formatCzechDate(group.date)}
                </span>
                <span className="text-muted-foreground">
                  ({group.files.length} {group.files.length === 1 ? "fotka" : group.files.length < 5 ? "fotky" : "fotek"})
                </span>
              </button>

              {/* Thumbnail grid */}
              {!isCollapsed && (
                <div className={cn("grid gap-1.5 mt-1", isMobile ? "grid-cols-2" : "grid-cols-3")}>
                  {group.files.map((f) => {
                    const flatIdx = flatFiles.indexOf(f);
                    return (
                      <LazyThumbnail
                        key={f.itemId}
                        file={f}
                        onClick={() => onOpenLightbox(flatIdx)}
                        isDraggable={isDraggable}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        isBeingDragged={draggingFileId === f.itemId}
                        isSelected={selectedIds?.has(f.itemId)}
                        onToggleSelect={onToggleSelect ? (e) => onToggleSelect(f.itemId, flatFiles, e) : undefined}
                        hasAnySelection={(selectedIds?.size ?? 0) > 0}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Lazy Thumbnail ─────────────────────────────────────────────

function LazyThumbnail({ file, onClick }: { file: SPFile; onClick: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(() => thumbCache.has(file.itemId));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: "100px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleLoad = useCallback(() => {
    thumbCache.add(file.itemId);
    setLoaded(true);
  }, [file.itemId]);

  const isRec = isReklamace(file.name);

  // Prefer SharePoint thumbnail API (medium ~176px) over full download URL
  const thumbSrc = file.thumbnailUrl || file.downloadUrl;

  return (
    <div
      ref={ref}
      className={cn(
        "relative aspect-square rounded-md overflow-hidden cursor-pointer group",
        isRec ? "ring-2 ring-red-400" : "bg-accent/30"
      )}
      onClick={onClick}
    >
      {visible && thumbSrc ? (
        <>
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-accent/40 animate-pulse">
              <div className="h-6 w-6 rounded bg-muted-foreground/10" />
            </div>
          )}
          <img
            src={thumbSrc}
            alt={file.name}
            loading="lazy"
            className={cn(
              "w-full h-full object-cover transition-opacity duration-200",
              loaded ? "opacity-100" : "opacity-0"
            )}
            onLoad={handleLoad}
            onError={handleLoad}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
          {isRec && (
            <span className="absolute top-1 left-1 bg-red-500 text-white text-[8px] px-1 py-0.5 rounded font-semibold leading-none">
              REC
            </span>
          )}
        </>
      ) : (
        <div className="w-full h-full bg-accent/20 animate-pulse" />
      )}
    </div>
  );
}

// ─── Lightbox ───────────────────────────────────────────────────

/** Session cache for large thumbnail images (800px) */
const largeThumbCache = new Map<string, string>();

interface PhotoLightboxProps {
  open: boolean;
  onClose: () => void;
  files: SPFile[];
  initialIndex: number;
  projectName?: string;
  onDelete?: (file: SPFile) => void;
  canDelete?: boolean;
}

export const PhotoLightbox = memo(function PhotoLightbox({
  open,
  onClose,
  files,
  initialIndex,
  projectName,
  onDelete,
  canDelete,
}: PhotoLightboxProps) {
  const isMobile = useIsMobile();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [mediumReady, setMediumReady] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  // Touch/swipe state
  const touchRef = useRef({ startX: 0, startY: 0, swiping: false });

  // Reset on open
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setShowControls(true);
      setConfirmDelete(false);
    }
  }, [open, initialIndex]);

  const file = files[currentIndex];
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < files.length - 1;

  // Load large thumbnail for current image (800px, ~100-300KB vs 2-8MB original)
  const largeUrl = file?.largeThumbUrl || file?.downloadUrl;
  useEffect(() => {
    if (!open || !largeUrl) return;

    if (largeThumbCache.has(largeUrl)) {
      setMediumReady(true);
      return;
    }

    setMediumReady(false);
    const img = new Image();
    img.onload = () => {
      largeThumbCache.set(largeUrl, largeUrl);
      setMediumReady(true);
    };
    img.onerror = () => setMediumReady(true);
    img.src = largeUrl;
    return () => { img.onload = null; img.onerror = null; };
  }, [open, largeUrl]);

  // Preload adjacent large thumbnails
  useEffect(() => {
    if (!open) return;
    [files[currentIndex - 1], files[currentIndex + 1]].filter(Boolean).forEach((f) => {
      const url = f.largeThumbUrl || f.downloadUrl;
      if (url && !largeThumbCache.has(url)) {
        const img = new Image();
        img.src = url;
        img.onload = () => largeThumbCache.set(url, url);
      }
    });
  }, [open, currentIndex, files]);

  const navigate = useCallback((dir: -1 | 1) => {
    setCurrentIndex((prev) => {
      const next = prev + dir;
      if (next < 0 || next >= files.length) return prev;
      return next;
    });
    setShowControls(true);
    setConfirmDelete(false);
  }, [files.length]);

  // Keyboard
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); onClose(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); navigate(-1); }
      if (e.key === "ArrowRight") { e.preventDefault(); navigate(1); }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [open, onClose, navigate]);

  // Auto-hide controls
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3500);
  }, []);

  useEffect(() => {
    if (open) resetHideTimer();
    return () => clearTimeout(hideTimer.current);
  }, [open, currentIndex, resetHideTimer]);

  // Touch handlers for swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { startX: t.clientX, startY: t.clientY, swiping: false };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.startX;
    const dy = t.clientY - touchRef.current.startY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx > 60 && absDx > absDy * 1.5) {
      // Horizontal swipe
      if (dx < 0 && canGoNext) navigate(1);
      else if (dx > 0 && canGoPrev) navigate(-1);
    } else if (dy > 80 && absDy > absDx * 1.5) {
      // Swipe down → close
      onClose();
    }
  }, [canGoNext, canGoPrev, navigate, onClose]);

  const handleDelete = useCallback(() => {
    if (!onDelete || !file) return;
    onDelete(file);
    // If last photo, close; else navigate
    if (files.length <= 1) {
      onClose();
    } else if (currentIndex >= files.length - 1) {
      setCurrentIndex((prev) => Math.max(0, prev - 1));
    }
    setConfirmDelete(false);
  }, [onDelete, file, files.length, currentIndex, onClose]);

  if (!open || !file) return null;

  const fileDate = parseDateFromFilename(file.name);
  const fileTime = parseTimeFromFilename(file.name);
  const isRec = isReklamace(file.name);

  const modal = (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center select-none"
      onClick={onClose}
      onMouseMove={resetHideTimer}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/90" />

      {/* Top bar */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {projectName && (
            <span className="text-white/70 text-xs truncate max-w-[30vw]">{projectName}</span>
          )}
          {fileDate && (
            <span className="text-white/80 text-xs">
              {formatCzechDate(fileDate)}
              {fileTime && <span className="text-white/50 ml-1">{fileTime}</span>}
            </span>
          )}
          {isRec && (
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold leading-none">
              Reklamace
            </span>
          )}
          {files.length > 1 && (
            <span className="text-white/50 text-xs">
              {currentIndex + 1} / {files.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="rounded-full p-2 hover:bg-white/10 transition-colors shrink-0"
        >
          <X className="h-5 w-5 text-white" />
        </button>
      </div>

      {/* Nav arrows */}
      {canGoPrev && (
        <button
          type="button"
          className={cn(
            "absolute left-2 z-20 rounded-full bg-black/40 hover:bg-black/60 transition-all",
            isMobile ? "p-2 opacity-80" : "p-3",
            showControls || isMobile ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          style={{ width: isMobile ? 40 : 48, height: isMobile ? 40 : 48, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { e.stopPropagation(); navigate(-1); }}
        >
          <ChevronLeft className={cn(isMobile ? "h-5 w-5" : "h-6 w-6", "text-white")} />
        </button>
      )}
      {canGoNext && (
        <button
          type="button"
          className={cn(
            "absolute right-2 z-20 rounded-full bg-black/40 hover:bg-black/60 transition-all",
            isMobile ? "p-2 opacity-80" : "p-3",
            showControls || isMobile ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          style={{ width: isMobile ? 40 : 48, height: isMobile ? 40 : 48, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { e.stopPropagation(); navigate(1); }}
        >
          <ChevronRight className={cn(isMobile ? "h-5 w-5" : "h-6 w-6", "text-white")} />
        </button>
      )}

      {/* Image */}
      <div
        className="relative z-10 flex items-center justify-center"
        style={{ width: "90vw", height: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {!mediumReady && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            {/* Show grid thumbnail as instant placeholder while large loads */}
            {file.thumbnailUrl ? (
              <img
                src={file.thumbnailUrl}
                alt={file.name}
                className="max-w-full max-h-full object-contain rounded opacity-60 blur-sm scale-[1.02]"
                draggable={false}
              />
            ) : (
              <Loader2 className="h-8 w-8 animate-spin text-white/50" />
            )}
          </div>
        )}
        {(file.largeThumbUrl || file.downloadUrl) && (
          <img
            key={file.itemId}
            src={file.largeThumbUrl || file.downloadUrl!}
            alt={file.name}
            className={cn(
              "max-w-full max-h-full object-contain rounded transition-all duration-300",
              mediumReady ? "opacity-100 blur-0 scale-100" : "opacity-0"
            )}
            draggable={false}
          />
        )}
      </div>

      {/* Bottom bar */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {file.downloadUrl && (
          <Button
            size="sm"
            className="h-8 text-xs bg-white/15 hover:bg-white/25 text-white border-0"
            onClick={() => window.open(file.downloadUrl!, "_blank")}
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            Stáhnout originál
          </Button>
        )}
        {canDelete && onDelete && (
          confirmDelete ? (
            <div className="flex items-center gap-2 bg-black/60 rounded-lg px-3 py-1.5">
              <span className="text-white/80 text-xs">Smazat tuto fotku?</span>
              <button type="button" className="text-red-400 text-xs font-medium hover:underline" onClick={handleDelete}>Smazat</button>
              <button type="button" className="text-white/50 text-xs hover:underline" onClick={() => setConfirmDelete(false)}>Zrušit</button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-white/60 hover:text-red-400 hover:bg-white/10"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Smazat
            </Button>
          )
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
});
