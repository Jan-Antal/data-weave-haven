import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import html2pdf from "html2pdf.js";

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
  const [downloading, setDownloading] = useState(false);

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

  const handleDownload = async () => {
    const iframeDoc = iframeRef.current?.contentDocument || iframeRef.current?.contentWindow?.document;
    if (!iframeDoc?.body) return;

    setDownloading(true);
    try {
      const tabKey = TAB_LABEL_MAP[tabLabel] || tabLabel.replace(/\s+/g, "");
      const dateStr = new Date().toISOString().split("T")[0];
      const filename = `AMI-${tabKey}-${dateStr}.pdf`;

      // Clone the iframe body content so html2pdf works on the main document
      const clone = iframeDoc.body.cloneNode(true) as HTMLElement;
      // Copy over the iframe styles
      const styles = iframeDoc.querySelectorAll("style, link[rel='stylesheet']");
      const wrapper = document.createElement("div");
      styles.forEach((s) => wrapper.appendChild(s.cloneNode(true)));
      wrapper.appendChild(clone);

      await html2pdf()
        .set({
          margin: 10,
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
        })
        .from(wrapper)
        .save();
    } finally {
      setDownloading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99998] flex flex-col bg-background">
      {/* Sticky action bar */}
      <div className="sticky top-0 z-[99999] flex items-center justify-between px-4 py-2.5 bg-background border-b border-border shadow-sm">
        <Button
          onClick={onClose}
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Zpět
        </Button>

        <span className="text-sm text-muted-foreground font-medium select-none">
          Náhled exportu
        </span>

        <Button
          onClick={handleDownload}
          disabled={downloading}
          size="sm"
          className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {downloading ? "Generuji…" : "Stáhnout PDF"}
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
