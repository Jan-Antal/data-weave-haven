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

// We'll load and cache the font lazily
let robotoBase64: string | null = null;

async function loadRobotoFont(): Promise<string> {
  if (robotoBase64) return robotoBase64;
  const response = await fetch(new URL("@/assets/Roboto-Regular.ttf", import.meta.url).href);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  robotoBase64 = btoa(binary);
  return robotoBase64;
}

export async function exportToPdf({ tabLabel, headers, rows, filterSummary }: PdfExportOptions) {
  const toastRef = toast({
    title: "Generování PDF…",
    className: "bg-gray-100 text-gray-700 border border-gray-200 shadow-md",
  });

  try {
    // Load font first
    const fontData = await loadRobotoFont();

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const usableWidth = pageWidth - margin * 2;

    // Register Roboto font for Czech diacritics
    doc.addFileToVFS("Roboto-Regular.ttf", fontData);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    doc.setFont("Roboto", "normal");

    const dateStr = format(new Date(), "d. MMMM yyyy", { locale: cs });

    // Header — first page only (drawn before table, autoTable's didDrawPage handles subsequent pages)
    doc.setFontSize(11);
    doc.setFont("Roboto", "normal");
    doc.setTextColor(45, 58, 46);
    doc.text(`A→M Interior | Project Info 2026`, margin, margin + 4);

    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(`${tabLabel} — ${dateStr}`, margin, margin + 9);

    let startY = margin + 13;

    if (filterSummary) {
      doc.setFontSize(7);
      doc.setTextColor(107, 114, 128);
      doc.text(`Filtry: ${filterSummary}`, margin, startY);
      startY += 4;
    }

    // Font sizing based on column count
    let fontSize = 7.5;
    if (headers.length > 12) fontSize = 7;
    if (headers.length > 16) fontSize = 6;

    // Smart column widths based on header content
    const colWidths = headers.map((h) => {
      const lower = h.toLowerCase();
      // Known column width hints
      if (lower.includes("project id") || lower === "id") return 22;
      if (lower.includes("project name") || lower.includes("název")) return 0; // flexible/wrap
      if (lower.includes("klient")) return 20;
      if (lower.includes("kalkulant") || lower.includes("pm") || lower.includes("architekt") || lower.includes("konstrukt")) return 22;
      if (lower.includes("status")) return 18;
      if (lower.includes("datum") || lower.includes("date") || lower.includes("expedice") || lower.includes("montáž") || lower.includes("předání") || lower.includes("zaměření") || lower.includes("smluvní")) return 18;
      if (lower.includes("cena") || lower.includes("materiál") || lower.includes("výroba") || lower.includes("subdodávky")) return 22;
      if (lower.includes("marže") || lower.includes("%")) return 12;
      if (lower.includes("poznámka") || lower.includes("notes")) return 0; // flexible
      // Default based on length
      const len = h.length;
      if (len <= 4) return 12;
      if (len <= 8) return 18;
      if (len <= 14) return 22;
      return 0; // flexible
    });

    // Calculate: fixed columns get their width, flexible (0) share remaining space
    const fixedTotal = colWidths.reduce((sum, w) => sum + w, 0);
    const flexCount = colWidths.filter((w) => w === 0).length;
    const remainingWidth = Math.max(usableWidth - fixedTotal, flexCount * 15);
    const flexWidth = flexCount > 0 ? remainingWidth / flexCount : 0;

    const finalWidths = colWidths.map((w) => (w === 0 ? Math.max(flexWidth, 15) : w));

    // Scale if total exceeds usable width
    const totalWidth = finalWidths.reduce((a, b) => a + b, 0);
    const scale = totalWidth > usableWidth ? usableWidth / totalWidth : 1;
    const scaledWidths = finalWidths.map((w) => w * scale);

    // Format cell values
    const formattedRows = rows.map((row) =>
      row.map((cell) => {
        if (cell == null) return "";
        if (typeof cell === "number") {
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
        font: "Roboto",
        fontSize,
        cellPadding: 2,
        lineColor: [229, 231, 235],
        lineWidth: 0.2,
        textColor: [31, 41, 55],
        overflow: "linebreak",
        cellWidth: "wrap",
      },
      headStyles: {
        fillColor: [45, 58, 46],
        textColor: [255, 255, 255],
        fontSize: fontSize + 0.5,
        fontStyle: "bold",
        halign: "left",
        cellPadding: 2.5,
        font: "Roboto",
      },
      alternateRowStyles: {
        fillColor: [249, 250, 251],
      },
      columnStyles: Object.fromEntries(
        headers.map((_, i) => {
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
      didDrawPage: () => {
        // Footer with page numbers on every page
        const pageCount = (doc as any).internal.getNumberOfPages();
        const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
        doc.setFont("Roboto", "normal");
        doc.setFontSize(7);
        doc.setTextColor(156, 163, 175);
        doc.text(
          `Strana ${currentPage} z ${pageCount}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: "center" }
        );
      },
    });

    // Fix total page count: re-draw footer on all pages with correct total
    const totalPages = (doc as any).internal.getNumberOfPages();
    if (totalPages > 1) {
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        // White-out the old footer area
        doc.setFillColor(255, 255, 255);
        doc.rect(0, pageHeight - 12, pageWidth, 12, "F");
        // Re-draw correct footer
        doc.setFont("Roboto", "normal");
        doc.setFontSize(7);
        doc.setTextColor(156, 163, 175);
        doc.text(
          `Strana ${p} z ${totalPages}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: "center" }
        );
      }
    }

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
}
