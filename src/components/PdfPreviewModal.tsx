import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface PdfPreviewModalProps {
  html: string;
  tabLabel: string;
  onClose: () => void;
}

const TAB_LABEL_MAP: Record<string, string> = {
  "Project Info": "ProjectInfo",
  "PM Status": "PMStatus",
  "TPV Status": "TPVStatus",
};

export function PdfPreviewModal({ html, tabLabel, onClose }: PdfPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [html]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleDownload = () => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.print();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99998] flex flex-col bg-background">
      {/* Sticky action bar */}
      <div className="sticky top-0 z-[99999] flex items-center justify-between px-4 py-2.5 bg-background border-b border-border shadow-sm print:hidden">
        {/* Left: Back button */}
        <Button
          onClick={onClose}
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Zpět
        </Button>

        {/* Center: Label */}
        <span className="text-sm text-muted-foreground font-medium select-none">
          Náhled exportu
        </span>

        {/* Right: Download button */}
        <Button onClick={handleDownload} size="sm" className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
          <Download className="h-3.5 w-3.5" />
          Stáhnout PDF
        </Button>
      </div>

      {/* Preview iframe */}
      <div className="flex-1 overflow-auto p-4 bg-muted/30">
        <div className="mx-auto bg-white shadow-lg rounded-sm" style={{ maxWidth: "1200px", minHeight: "600px" }}>
          {blobUrl && (
            <iframe
              ref={iframeRef}
              src={blobUrl}
              className="w-full border-0 rounded-sm"
              style={{ minHeight: "80vh" }}
              title="PDF Preview"
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
