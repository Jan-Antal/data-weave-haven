import { useEffect, useState, useCallback } from "react";
import { X, Download, ExternalLink, Loader2, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

function getFileIconColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "text-red-500";
  if (["xlsx", "xls", "csv"].includes(ext)) return "text-green-600";
  if (["docx", "doc"].includes(ext)) return "text-blue-500";
  if (["dwg", "dxf"].includes(ext)) return "text-orange-500";
  return "text-muted-foreground";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DocumentPreviewModalProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  fileSize?: number;
  previewUrl: string | null;
  webUrl: string | null;
  downloadUrl: string | null;
  loading?: boolean;
  /** Navigation: total files in current category */
  totalFiles?: number;
  /** Navigation: current index (0-based) */
  currentIndex?: number;
  /** Called with direction -1 (prev) or +1 (next) */
  onNavigate?: (direction: -1 | 1) => void;
}

export function DocumentPreviewModal({
  open,
  onClose,
  fileName,
  fileSize,
  previewUrl,
  webUrl,
  downloadUrl,
  loading,
  totalFiles = 1,
  currentIndex = 0,
  onNavigate,
}: DocumentPreviewModalProps) {
  const [iframeLoading, setIframeLoading] = useState(true);

  // Reset iframe loading when previewUrl changes
  useEffect(() => {
    if (previewUrl) setIframeLoading(true);
  }, [previewUrl]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && canGoPrev) onNavigate?.(-1);
      if (e.key === "ArrowRight" && canGoNext) onNavigate?.(1);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, onNavigate, totalFiles, currentIndex]);

  if (!open) return null;

  const canGoPrev = totalFiles > 1 && currentIndex > 0;
  const canGoNext = totalFiles > 1 && currentIndex < totalFiles - 1;

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80" />

      {/* Left arrow */}
      {canGoPrev && (
        <button
          type="button"
          className="absolute left-4 z-10 rounded-full bg-background/20 hover:bg-background/40 p-2 transition-colors"
          onClick={(e) => { e.stopPropagation(); onNavigate?.(-1); }}
        >
          <ChevronLeft className="h-6 w-6 text-white" />
        </button>
      )}

      {/* Right arrow */}
      {canGoNext && (
        <button
          type="button"
          className="absolute right-4 z-10 rounded-full bg-background/20 hover:bg-background/40 p-2 transition-colors"
          onClick={(e) => { e.stopPropagation(); onNavigate?.(1); }}
        >
          <ChevronRight className="h-6 w-6 text-white" />
        </button>
      )}

      {/* Modal container */}
      <div
        className="relative z-10 flex flex-col w-full max-w-[900px] mx-4 bg-background rounded-lg shadow-2xl overflow-hidden"
        style={{ maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className={`h-4 w-4 shrink-0 ${getFileIconColor(fileName)}`} />
            <span className="text-sm font-medium truncate" title={fileName}>
              {fileName}
            </span>
            {fileSize != null && fileSize > 0 && (
              <span className="text-xs text-muted-foreground shrink-0">
                {formatFileSize(fileSize)}
              </span>
            )}
            {totalFiles > 1 && (
              <span className="text-xs text-muted-foreground shrink-0">
                {currentIndex + 1} / {totalFiles}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1.5 hover:bg-accent transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Preview body */}
        <div className="flex-1 relative min-h-[300px]" style={{ height: "calc(85vh - 110px)" }}>
          {(loading || iframeLoading) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-background/80">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-2">Načítání náhledu…</p>
            </div>
          )}
          {!loading && previewUrl ? (
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              title={`Preview: ${fileName}`}
              sandbox="allow-scripts allow-same-origin allow-forms"
              onLoad={() => setIframeLoading(false)}
            />
          ) : !loading && !previewUrl ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <FileText className="h-12 w-12 opacity-30" />
              <p className="text-sm">Náhled není dostupný pro tento typ souboru.</p>
              {downloadUrl && (
                <Button variant="outline" size="sm" onClick={() => window.open(downloadUrl, "_blank")}>
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Stáhnout soubor
                </Button>
              )}
            </div>
          ) : null}
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          {webUrl && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => window.open(webUrl, "_blank")}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              Otevřít v SharePointu
            </Button>
          )}
          {downloadUrl && (
            <Button
              size="sm"
              className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
              onClick={() => window.open(downloadUrl, "_blank")}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Stáhnout
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
