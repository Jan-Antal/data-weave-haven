import { useState, useRef, useEffect } from "react";
import { Download, ChevronDown, FileSpreadsheet, FileText } from "lucide-react";
import { useExportContext } from "./ExportContext";
import { ExportPopup } from "./ExportPopup";
import { buildPrintableHtml } from "@/lib/exportPdf";
import { PdfPreviewModal } from "./PdfPreviewModal";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";

const TAB_MAP: Record<string, { key: string; sheet: string; label: string }> = {
  "project-info": { key: "project-info", sheet: "Project Info", label: "Project Info" },
  "pm-status": { key: "pm-status", sheet: "PM Status", label: "PM Status" },
  "tpv-status": { key: "tpv-status", sheet: "TPV Status", label: "TPV Status" },
};

interface ExportButtonProps {
  activeTab: string;
  personFilter?: string | null;
  statusFilter?: string[];
}

export function ExportButton({ activeTab, personFilter, statusFilter }: ExportButtonProps) {
  const { getExportMeta } = useExportContext();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [excelPopupOpen, setExcelPopupOpen] = useState(false);
  const [pdfHtml, setPdfHtml] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!dropdownOpen && !excelPopupOpen) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setExcelPopupOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen, excelPopupOpen]);

  const tabInfo = TAB_MAP[activeTab];
  if (!tabInfo) return null;

  const meta = getExportMeta(tabInfo.key);

  const handleExcelClick = () => {
    setDropdownOpen(false);
    setExcelPopupOpen(true);
  };

  const handlePdfClick = () => {
    setDropdownOpen(false);
    if (!meta) return;

    const data = meta.getter(meta.defaultVisibleKeys);
    if (!data) return;

    const parts: string[] = [];
    if (personFilter) parts.push(personFilter);
    if (statusFilter && statusFilter.length > 0) {
      parts.push(`Status (${statusFilter.length})`);
    }
    const filterSummary = parts.length > 0 ? parts.join(", ") : undefined;

    // Build status color map
    const statusColors: Record<string, string> = {};
    for (const opt of statusOptions) {
      statusColors[opt.label] = opt.color;
    }

    const html = buildPrintableHtml({
      tabLabel: tabInfo.label,
      headers: data.headers,
      rows: data.rows,
      filterSummary,
      statusColors,
    });
    setPdfHtml(html);
  };

  return (
    <>
      <div ref={wrapperRef} className="relative">
        <button
          onClick={() => {
            if (excelPopupOpen) return;
            setDropdownOpen(!dropdownOpen);
          }}
          className="border border-border bg-background text-foreground hover:bg-muted text-sm px-3 py-1.5 rounded-md gap-1.5 flex items-center"
        >
          <Download className="h-3.5 w-3.5" />
          Export
          <ChevronDown className="h-3 w-3 ml-0.5 opacity-50" />
        </button>

        {dropdownOpen && (
          <div className="absolute top-full right-0 mt-1 z-50 w-48 bg-popover rounded-lg shadow-lg border border-border py-1">
            <button
              onClick={handleExcelClick}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-popover-foreground hover:bg-muted transition-colors text-left"
            >
              <FileSpreadsheet className="h-4 w-4 text-green-600" />
              Export do Excel
            </button>
            <button
              onClick={handlePdfClick}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-popover-foreground hover:bg-muted transition-colors text-left"
            >
              <FileText className="h-4 w-4 text-red-500" />
              Export do PDF
            </button>
          </div>
        )}

        {excelPopupOpen && meta && (
          <ExportPopup
            tabKey={tabInfo.key}
            tabLabel={tabInfo.label}
            sheetName={tabInfo.sheet}
            meta={meta}
            onClose={() => setExcelPopupOpen(false)}
          />
        )}
      </div>

      {pdfHtml && (
        <PdfPreviewModal
          html={pdfHtml}
          tabLabel={tabInfo.label}
          onClose={() => setPdfHtml(null)}
        />
      )}
    </>
  );
}
