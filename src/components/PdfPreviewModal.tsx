import { useRef, useEffect, useState } from "react";
import { X, Download } from "lucide-react";
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

  const sanitized = TAB_LABEL_MAP[tabLabel] || tabLabel.replace(/\s+/g, "-");
  const dateFile = format(new Date(), "yyyy-MM-dd");
  const _fileName = `AMI-${sanitized}-${dateFile}.pdf`;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Náhled exportu</h2>
        <div className="flex items-center gap-2">
          <Button onClick={handleDownload} size="sm" className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Stáhnout PDF
          </Button>
          <Button onClick={onClose} variant="outline" size="sm">
            <X className="h-3.5 w-3.5" />
            Zavřít
          </Button>
        </div>
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
    </div>
  );
}
