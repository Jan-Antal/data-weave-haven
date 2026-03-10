import { useEffect, useState, useCallback, useRef, memo } from "react";
import { X, Download, ChevronLeft, ChevronRight, Loader2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { SPFile } from "@/hooks/useSharePointDocs";

interface PhotoLightboxProps {
  open: boolean;
  onClose: () => void;
  files: SPFile[];
  initialIndex: number;
  onDownload?: (file: SPFile) => void;
}

/** Track which URLs have been fully loaded this session */
const loadedFullRes = new Set<string>();

export const PhotoLightbox = memo(function PhotoLightbox({
  open,
  onClose,
  files,
  initialIndex,
  onDownload,
}: PhotoLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [fullResReady, setFullResReady] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  // Reset index when lightbox opens
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setShowControls(true);
    }
  }, [open, initialIndex]);

  const file = files[currentIndex];
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < files.length - 1;

  // Preload full-res for current image
  useEffect(() => {
    if (!open || !file?.downloadUrl) return;
    const url = file.downloadUrl;

    if (loadedFullRes.has(url)) {
      setFullResReady(true);
      return;
    }

    setFullResReady(false);
    const img = new Image();
    img.onload = () => {
      loadedFullRes.add(url);
      setFullResReady(true);
    };
    img.onerror = () => setFullResReady(true); // show whatever we have
    img.src = url;

    return () => { img.onload = null; img.onerror = null; };
  }, [open, file?.downloadUrl]);

  // Preload adjacent images
  useEffect(() => {
    if (!open) return;
    const toPreload = [files[currentIndex - 1], files[currentIndex + 1]].filter(Boolean);
    toPreload.forEach((f) => {
      if (f.downloadUrl && !loadedFullRes.has(f.downloadUrl)) {
        const img = new Image();
        img.src = f.downloadUrl;
        img.onload = () => loadedFullRes.add(f.downloadUrl!);
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
  }, [files.length]);

  // Keyboard navigation
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
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    if (open) resetHideTimer();
    return () => clearTimeout(hideTimer.current);
  }, [open, currentIndex, resetHideTimer]);

  if (!open || !file) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center select-none"
      onClick={onClose}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/90" />

      {/* Top bar */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-white/90 text-sm font-medium truncate max-w-[50vw]" title={file.name}>
            {file.name}
          </span>
          {files.length > 1 && (
            <span className="text-white/60 text-xs shrink-0">
              {currentIndex + 1} / {files.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="rounded-full p-2 hover:bg-white/10 transition-colors"
        >
          <X className="h-5 w-5 text-white" />
        </button>
      </div>

      {/* Navigation arrows */}
      {canGoPrev && (
        <button
          type="button"
          className={cn(
            "absolute left-3 z-20 rounded-full bg-black/40 hover:bg-black/60 p-3 transition-all",
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={(e) => { e.stopPropagation(); navigate(-1); }}
        >
          <ChevronLeft className="h-6 w-6 text-white" />
        </button>
      )}
      {canGoNext && (
        <button
          type="button"
          className={cn(
            "absolute right-3 z-20 rounded-full bg-black/40 hover:bg-black/60 p-3 transition-all",
            showControls ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={(e) => { e.stopPropagation(); navigate(1); }}
        >
          <ChevronRight className="h-6 w-6 text-white" />
        </button>
      )}

      {/* Image container */}
      <div
        className="relative z-10 flex items-center justify-center"
        style={{ width: "90vw", height: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Loading spinner */}
        {!fullResReady && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="h-8 w-8 animate-spin text-white/60" />
          </div>
        )}

        {/* Image — crossfade via opacity transition */}
        {file.downloadUrl && (
          <img
            key={file.itemId}
            src={file.downloadUrl}
            alt={file.name}
            className={cn(
              "max-w-full max-h-full object-contain rounded transition-opacity duration-300",
              fullResReady ? "opacity-100" : "opacity-30"
            )}
            draggable={false}
          />
        )}
      </div>

      {/* Bottom bar */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-t from-black/60 to-transparent transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {file.webUrl && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white"
            onClick={() => window.open(file.webUrl!, "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            SharePoint
          </Button>
        )}
        {file.downloadUrl && (
          <Button
            size="sm"
            className="h-8 text-xs bg-white/20 hover:bg-white/30 text-white"
            onClick={() => {
              if (onDownload) onDownload(file);
              else window.open(file.downloadUrl!, "_blank");
            }}
          >
            <Download className="h-3.5 w-3.5 mr-1" />
            Stáhnout originál
          </Button>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
});

// ─── Thumbnail Grid ──────────────────────────────────────────────

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic", "heif", "tiff", "tif"]);

export function isImageFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

interface PhotoThumbnailGridProps {
  files: SPFile[];
  onOpenLightbox: (index: number) => void;
  maxHeight?: string;
}

export function PhotoThumbnailGrid({ files, onOpenLightbox, maxHeight = "200px" }: PhotoThumbnailGridProps) {
  const imageFiles = files.filter((f) => isImageFile(f.name));
  const otherFiles = files.filter((f) => !isImageFile(f.name));

  return (
    <div className="space-y-1" style={{ maxHeight, overflowY: "auto" }}>
      {imageFiles.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {imageFiles.map((f, i) => (
            <LazyThumbnail
              key={f.itemId}
              file={f}
              onClick={() => onOpenLightbox(files.indexOf(f))}
            />
          ))}
        </div>
      )}
      {otherFiles.length > 0 && (
        <div className="space-y-0.5 mt-1">
          {otherFiles.map((f, i) => (
            <div
              key={f.itemId}
              className="flex items-center gap-1 py-1 px-1 rounded hover:bg-accent/50 text-xs cursor-pointer"
              onClick={() => onOpenLightbox(files.indexOf(f))}
            >
              <span className="truncate flex-1">{f.name}</span>
              <span className="text-muted-foreground text-[10px] shrink-0">
                {f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(0)} KB` : `${(f.size / (1024 * 1024)).toFixed(1)} MB`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Lazy-loaded thumbnail with IntersectionObserver
function LazyThumbnail({ file, onClick }: { file: SPFile; onClick: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

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

  return (
    <div
      ref={ref}
      className="relative aspect-square rounded-md overflow-hidden bg-accent/30 cursor-pointer group"
      onClick={onClick}
    >
      {visible && file.downloadUrl && (
        <>
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          <img
            src={file.downloadUrl}
            alt={file.name}
            loading="lazy"
            className={cn(
              "w-full h-full object-cover transition-opacity duration-200",
              loaded ? "opacity-100" : "opacity-0"
            )}
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
        </>
      )}
      {!visible && (
        <div className="w-full h-full bg-accent/20" />
      )}
    </div>
  );
}
