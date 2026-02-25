import { useState } from "react";
import { X, Download, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DocumentPreviewModalProps {
  open: boolean;
  onClose: () => void;
  fileName: string;
  previewUrl: string | null;
  webUrl: string | null;
  downloadUrl: string | null;
  loading?: boolean;
}

export function DocumentPreviewModal({
  open,
  onClose,
  fileName,
  previewUrl,
  webUrl,
  downloadUrl,
  loading,
}: DocumentPreviewModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100000] flex flex-col bg-black/90" onClick={onClose}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-background/95 border-b border-border shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-medium text-foreground truncate max-w-[40%]" title={fileName}>
          {fileName}
        </span>
        <div className="flex items-center gap-2">
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
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => window.open(downloadUrl, "_blank")}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Stáhnout
            </Button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1.5 hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4 text-foreground" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Načítání náhledu…</p>
          </div>
        ) : previewUrl ? (
          <iframe
            src={previewUrl}
            className="w-full h-full border-0"
            title={`Preview: ${fileName}`}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <p className="text-sm">Náhled není dostupný pro tento typ souboru.</p>
            {downloadUrl && (
              <Button variant="outline" size="sm" onClick={() => window.open(downloadUrl, "_blank")}>
                <Download className="h-3.5 w-3.5 mr-1" />
                Stáhnout soubor
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
