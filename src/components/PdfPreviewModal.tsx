import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PdfPreviewModalProps {
  html: string;
  tabLabel: string;
  onClose: () => void;
  portrait?: boolean;
}

export function PdfPreviewModal({ html, tabLabel, onClose, portrait = false }: PdfPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [html]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handlePrint = () => {
    const win = iframeRef.current?.contentWindow;
    const doc = iframeRef.current?.contentDocument;
    if (win && doc) {
      const today = new Date().toISOString().split("T")[0];
      const tabKey = tabLabel.replace(/\s+/g, "");
      doc.title = `AMI-${tabKey}-${today}`;
      win.print();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99998] flex flex-col bg-background">
      <div className="sticky top-0 z-[99999] flex items-center justify-between px-4 py-2.5 bg-background border-b border-border shadow-sm">
        <Button onClick={onClose} variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Zpět
        </Button>
        <span className="text-sm text-muted-foreground font-medium select-none">Náhled exportu</span>
        <Button onClick={handlePrint} size="sm" className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
          <Printer className="h-3.5 w-3.5" />
          Tisk / Uložit PDF
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-4 bg-muted/30 flex justify-center">
        <div className="bg-white shadow-lg rounded-sm" style={{ width: "794px", minHeight: "1123px" }}>
          {blobUrl && (
            <iframe ref={iframeRef} src={blobUrl} className="w-full border-0 rounded-sm" style={{ height: "1123px" }} title="PDF Preview" />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
