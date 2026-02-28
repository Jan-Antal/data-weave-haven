import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { cs } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";

interface PdfExportOptions {
  tabLabel: string;
  headers: string[];
  rows: (string | number)[][];
  filterSummary?: string;
}

const TAB_LABEL_MAP: Record<string, string> = {
  "Project Info": "ProjectInfo",
  "PM Status": "PMStatus",
  "TPV Status": "TPVStatus",
};

export function exportToPdf({ tabLabel, headers, rows, filterSummary }: PdfExportOptions) {
  const toastId = toast({
    title: "Generování PDF…",
    className: "bg-gray-100 text-gray-700 border border-gray-200 shadow-md",
  });

  // Use setTimeout to let toast render before blocking PDF generation
  setTimeout(() => {
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const usableWidth = pageWidth - margin * 2;

      const dateStr = format(new Date(), "d. MMMM yyyy", { locale: cs });

      // Header
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(45, 58, 46); // #2d3a2e
      doc.text(`A→M Interior | Project Info 2026`, margin, margin + 4);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(107, 114, 128); // gray
      doc.text(`${tabLabel} — ${dateStr}`, margin, margin + 9);

      let startY = margin + 13;

      // Filter summary line
      if (filterSummary) {
        doc.setFontSize(7);
        doc.setTextColor(107, 114, 128);
        doc.text(`Filtry: ${filterSummary}`, margin, startY);
        startY += 4;
      }

      // Determine font size: try 7.5, reduce to 6 if too many columns
      let fontSize = 7.5;
      const headerFontSize = 8.5;
      if (headers.length > 12) fontSize = 7;
      if (headers.length > 16) fontSize = 6;

      // Column widths - proportional based on header text length with some heuristics
      const colWidths = headers.map((h) => {
        const len = h.length;
        if (len <= 4) return 12;
        if (len <= 8) return 18;
        if (len <= 14) return 24;
        return 30;
      });
      const totalRequestedWidth = colWidths.reduce((a, b) => a + b, 0);
      const scale = usableWidth / totalRequestedWidth;
      const scaledWidths = colWidths.map((w) => Math.max(w * scale, 8));

      // Format cell values for display
      const formattedRows = rows.map((row) =>
        row.map((cell) => {
          if (cell == null) return "";
          if (typeof cell === "number") {
            // Format numbers with spaces as thousand separators
            return cell.toLocaleString("cs-CZ");
          }
          return String(cell);
        })
      );

      autoTable(doc, {
        startY,
        head: [headers],
        body: formattedRows,
        margin: { left: margin, right: margin },
        styles: {
          font: "helvetica",
          fontSize,
          cellPadding: 1.5,
          lineColor: [229, 231, 235], // #e5e7eb
          lineWidth: 0.2,
          textColor: [31, 41, 55], // #1f2937
          overflow: "ellipsize",
          cellWidth: "wrap",
        },
        headStyles: {
          fillColor: [45, 58, 46], // #2d3a2e
          textColor: [255, 255, 255],
          fontSize: headerFontSize,
          fontStyle: "bold",
          halign: "left",
          cellPadding: 2,
        },
        alternateRowStyles: {
          fillColor: [249, 250, 251], // #f9fafb
        },
        columnStyles: Object.fromEntries(
          headers.map((h, i) => {
            const isNumber = rows.some((r) => typeof r[i] === "number" && r[i] !== 0);
            return [
              i,
              {
                cellWidth: scaledWidths[i],
                halign: isNumber ? ("right" as const) : ("left" as const),
              },
            ];
          })
        ),
        didDrawPage: (data: any) => {
          // Footer with page numbers
          const pageCount = (doc as any).internal.getNumberOfPages();
          const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
          doc.setFontSize(7);
          doc.setTextColor(156, 163, 175); // #9ca3af
          doc.text(
            `Strana ${currentPage} z ${pageCount}`,
            pageWidth / 2,
            pageHeight - 8,
            { align: "center" }
          );
        },
      });

      // Build filename
      const sanitized = TAB_LABEL_MAP[tabLabel] || tabLabel.replace(/\s+/g, "-");
      const dateFile = format(new Date(), "yyyy-MM-dd");
      const fileName = `AMI-${sanitized}-${dateFile}.pdf`;

      doc.save(fileName);

      toast({
        title: "Exportováno",
        className: "bg-gray-100 text-gray-700 border border-gray-200 shadow-md",
      });
    } catch (err) {
      console.error("PDF export error:", err);
      toast({
        title: "Chyba při generování PDF",
        variant: "destructive",
      });
    }
  }, 50);
}
