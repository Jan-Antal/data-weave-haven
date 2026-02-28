import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import type { PdfExportOptions } from "@/lib/exportPdf";
import { buildPageHtml, buildPrintableHtml } from "@/lib/exportPdf";

interface PdfPreviewModalProps {
  html: string;
  tabLabel: string;
  exportOptions: PdfExportOptions;
  onClose: () => void;
}

const TAB_LABEL_MAP: Record<string, string> = {
  "Project Info": "ProjectInfo",
  "PM Status": "PMStatus",
  "TPV Status": "TPVStatus",
};

// A4 landscape constants
const A4_W_MM = 297;
const A4_H_MM = 210;
const MARGIN_MM = 10;
const CONTENT_W_MM = A4_W_MM - MARGIN_MM * 2;
const CONTENT_H_MM = A4_H_MM - MARGIN_MM * 2;

export function PdfPreviewModal({ html, tabLabel, exportOptions, onClose }: PdfPreviewModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

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

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const tabKey = TAB_LABEL_MAP[tabLabel] || tabLabel.replace(/\s+/g, "");
      const dateStr = new Date().toISOString().split("T")[0];
      const filename = `AMI-${tabKey}-${dateStr}.pdf`;

      const { headers, rows, filterSummary, statusColors } = exportOptions;

      // Measure how many rows fit on a page by rendering a test page
      // A4 landscape: 297mm - 2×10mm margin = 277mm printable ≈ 1047px at 96dpi
      const RENDER_WIDTH_PX = 1047;
      const SCALE = 2;

      // Render a single-row test page to get header+row height
      const testHtml = buildPageHtml({ tabLabel, headers, rows: [rows[0] || []], filterSummary, statusColors, pageNum: 1, totalPages: 1, showTitle: true });
      const testHeight = await measureHtmlHeight(testHtml, RENDER_WIDTH_PX, SCALE);

      // Render header-only page (no rows) to get base height for page 1
      const baseP1Html = buildPageHtml({ tabLabel, headers, rows: [], filterSummary, statusColors, pageNum: 1, totalPages: 1, showTitle: true });
      const baseP1Height = await measureHtmlHeight(baseP1Html, RENDER_WIDTH_PX, SCALE);

      // Base height for subsequent pages (no title)
      const basePNHtml = buildPageHtml({ tabLabel, headers, rows: [], filterSummary, statusColors, pageNum: 2, totalPages: 2, showTitle: false });
      const basePNHeight = await measureHtmlHeight(basePNHtml, RENDER_WIDTH_PX, SCALE);

      // Single row height
      const rowHeightPx = testHeight - baseP1Height;
      const maxRowHeightPx = Math.max(rowHeightPx, 16 * SCALE); // fallback minimum

      // Target content height in pixels
      const targetHeightPx = (CONTENT_H_MM / CONTENT_W_MM) * RENDER_WIDTH_PX * SCALE;

      // Rows per page
      const rowsPage1 = Math.max(1, Math.floor((targetHeightPx - baseP1Height) / maxRowHeightPx));
      const rowsPageN = Math.max(1, Math.floor((targetHeightPx - basePNHeight) / maxRowHeightPx));

      // Split rows into page chunks
      const chunks: (string | number)[][][] = [];
      let idx = 0;
      // First page
      chunks.push(rows.slice(idx, idx + rowsPage1));
      idx += rowsPage1;
      // Subsequent pages
      while (idx < rows.length) {
        chunks.push(rows.slice(idx, idx + rowsPageN));
        idx += rowsPageN;
      }

      const totalPages = chunks.length;
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

      for (let p = 0; p < totalPages; p++) {
        if (p > 0) pdf.addPage();

        const pageHtml = buildPageHtml({
          tabLabel,
          headers,
          rows: chunks[p],
          filterSummary,
          statusColors,
          pageNum: p + 1,
          totalPages,
          showTitle: p === 0,
        });

        const canvas = await renderHtmlToCanvas(pageHtml, RENDER_WIDTH_PX, SCALE);
        const imgData = canvas.toDataURL("image/png");

        // Scale to fit content area width, let height be proportional
        const imgH = (canvas.height / canvas.width) * CONTENT_W_MM;
        pdf.addImage(imgData, "PNG", MARGIN_MM, MARGIN_MM, CONTENT_W_MM, Math.min(imgH, CONTENT_H_MM));
      }

      pdf.save(filename);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setDownloading(false);
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
        <Button onClick={handleDownload} disabled={downloading} size="sm" className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {downloading ? "Generuji…" : "Stáhnout PDF"}
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-4 bg-muted/30">
        <div className="mx-auto bg-white shadow-lg rounded-sm" style={{ maxWidth: "1200px", minHeight: "600px" }}>
          {blobUrl && (
            <iframe ref={iframeRef} src={blobUrl} className="w-full border-0 rounded-sm" style={{ minHeight: "80vh" }} title="PDF Preview" />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Helpers ──────────────────────────────────────────────

async function renderHtmlToCanvas(pageHtml: string, widthPx: number, scale: number): Promise<HTMLCanvasElement> {
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = `${widthPx}px`;
  container.style.background = "#fff";

  // Build an iframe to isolate styles
  const iframe = document.createElement("iframe");
  iframe.style.width = `${widthPx}px`;
  iframe.style.height = "1px"; // auto-expand
  iframe.style.border = "none";
  container.appendChild(iframe);
  document.body.appendChild(container);

  await new Promise<void>((res) => {
    iframe.onload = () => res();
    iframe.srcdoc = pageHtml;
  });

  // Wait for rendering
  await new Promise((r) => setTimeout(r, 100));

  const doc = iframe.contentDocument!;
  const body = doc.body;

  // Expand iframe to content height
  iframe.style.height = `${body.scrollHeight}px`;
  await new Promise((r) => setTimeout(r, 50));

  const canvas = await html2canvas(body, {
    scale,
    useCORS: true,
    backgroundColor: "#ffffff",
    width: widthPx,
    windowWidth: widthPx,
  });

  document.body.removeChild(container);
  return canvas;
}

async function measureHtmlHeight(pageHtml: string, widthPx: number, scale: number): Promise<number> {
  const canvas = await renderHtmlToCanvas(pageHtml, widthPx, scale);
  return canvas.height;
}
