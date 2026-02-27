import { Download } from "lucide-react";
import { useExportContext } from "./ExportContext";
import { exportToExcel, buildFileName } from "@/lib/exportExcel";

const TAB_MAP: Record<string, { key: string; sheet: string; label: string }> = {
  "project-info": { key: "project-info", sheet: "Project Info", label: "Project Info" },
  "pm-status": { key: "pm-status", sheet: "PM Status", label: "PM Status" },
  "tpv-status": { key: "tpv-status", sheet: "TPV Status", label: "TPV Status" },
};

export function ExportButton({ activeTab }: { activeTab: string }) {
  const { getExportData } = useExportContext();

  const tabInfo = TAB_MAP[activeTab];
  if (!tabInfo) return null;

  const handleExport = () => {
    const data = getExportData(tabInfo.key);
    if (!data) return;
    exportToExcel({
      sheetName: tabInfo.sheet,
      fileName: buildFileName(tabInfo.label),
      headers: data.headers,
      rows: data.rows,
    });
  };

  return (
    <button
      onClick={handleExport}
      className="border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-sm px-3 py-1.5 rounded-md gap-1.5 flex items-center"
    >
      <Download className="h-3.5 w-3.5" />
      Export
    </button>
  );
}
