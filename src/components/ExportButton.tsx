import { useState, useRef, useEffect } from "react";
import { Download } from "lucide-react";
import { useExportContext } from "./ExportContext";
import { ExportPopup } from "./ExportPopup";

const TAB_MAP: Record<string, { key: string; sheet: string; label: string }> = {
  "project-info": { key: "project-info", sheet: "Project Info", label: "Project Info" },
  "pm-status": { key: "pm-status", sheet: "PM Status", label: "PM Status" },
  "tpv-status": { key: "tpv-status", sheet: "TPV Status", label: "TPV Status" },
};

export function ExportButton({ activeTab }: { activeTab: string }) {
  const { getExportMeta } = useExportContext();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const tabInfo = TAB_MAP[activeTab];
  if (!tabInfo) return null;

  const meta = getExportMeta(tabInfo.key);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-sm px-3 py-1.5 rounded-md gap-1.5 flex items-center"
      >
        <Download className="h-3.5 w-3.5" />
        Export
      </button>
      {open && meta && (
        <ExportPopup
          tabKey={tabInfo.key}
          tabLabel={tabInfo.label}
          sheetName={tabInfo.sheet}
          meta={meta}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
