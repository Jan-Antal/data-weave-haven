import { useState, useEffect, useMemo } from "react";
import { Download, X, ChevronRight, ChevronDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { exportToExcel, buildFileName } from "@/lib/exportExcel";
import { toast } from "@/hooks/use-toast";
import type { ExportMeta } from "./ExportContext";

const STORAGE_PREFIX = "export-cols-";

interface Props {
  tabKey: string;
  tabLabel: string;
  sheetName: string;
  meta: ExportMeta;
  onClose: () => void;
  projectId?: string;
}

export function ExportPopup({ tabKey, tabLabel, sheetName, meta, onClose, projectId }: Props) {
  const storageKey = STORAGE_PREFIX + tabKey;

  // All available keys from groups
  const allKeys = useMemo(() => meta.groups.flatMap(g => g.keys), [meta]);

  // Load initial selection: localStorage > defaultVisibleKeys
  const [selected, setSelected] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const arr = JSON.parse(saved) as string[];
        const valid = arr.filter(k => allKeys.includes(k));
        // If available keys changed (Owner updated visibility), reset to defaults
        if (valid.length > 0 && valid.length === allKeys.length) {
          return new Set(valid);
        }
      }
    } catch {}
    return new Set(meta.defaultVisibleKeys);
  });

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleGroup = (label: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const toggleCol = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const selectAllGroup = (keys: string[]) => {
    setSelected(prev => {
      const next = new Set(prev);
      keys.forEach(k => next.add(k));
      return next;
    });
  };

  const deselectAllGroup = (keys: string[]) => {
    setSelected(prev => {
      const next = new Set(prev);
      keys.forEach(k => next.delete(k));
      return next;
    });
  };

  const handleExport = () => {
    const selectedKeys = allKeys.filter(k => selected.has(k));
    if (selectedKeys.length === 0) return;

    // Save to localStorage
    localStorage.setItem(storageKey, JSON.stringify(selectedKeys));

    const data = meta.getter(selectedKeys);
    if (!data) return;

    exportToExcel({
      sheetName,
      fileName: buildFileName(tabLabel, projectId),
      headers: data.headers,
      rows: data.rows,
    });
    onClose();
  };

  const selectedCount = selected.size;

  return (
    <div className="absolute top-full right-0 mt-1 z-50 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 flex flex-col" style={{ maxHeight: 500 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-800">Export do Excelu</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Column groups */}
      <div className="overflow-y-auto flex-1 py-1">
        {meta.groups.map(group => {
          const isCollapsed = collapsed.has(group.label);
          const allChecked = group.keys.every(k => selected.has(k));
          const noneChecked = group.keys.every(k => !selected.has(k));

          return (
            <div key={group.label}>
              {/* Group header */}
              <div className="flex items-center justify-between px-4 py-1.5 bg-gray-50/80">
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-700 transition-colors"
                >
                  {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {group.label}
                </button>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => selectAllGroup(group.keys)}
                    className={`text-[11px] px-1.5 py-0.5 rounded transition-colors ${allChecked ? "text-gray-300" : "text-blue-600 hover:bg-blue-50"}`}
                    disabled={allChecked}
                  >
                    Vše
                  </button>
                  <span className="text-gray-300 text-[11px]">/</span>
                  <button
                    onClick={() => deselectAllGroup(group.keys)}
                    className={`text-[11px] px-1.5 py-0.5 rounded transition-colors ${noneChecked ? "text-gray-300" : "text-blue-600 hover:bg-blue-50"}`}
                    disabled={noneChecked}
                  >
                    Nic
                  </button>
                </div>
              </div>

              {/* Columns */}
              {!isCollapsed && (
                <div className="py-0.5">
                  {group.keys.map(key => (
                    <label
                      key={key}
                      className="flex items-center gap-2.5 px-5 py-1 cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <Checkbox
                        checked={selected.has(key)}
                        onCheckedChange={() => toggleCol(key)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-sm text-gray-700">{group.getLabel(key)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-xl">
        <Button variant="outline" size="sm" onClick={onClose} className="text-gray-500 border-gray-200 h-8 shrink-0">
          Zrušit
        </Button>
        <span className="text-sm text-gray-400 truncate">{selectedCount} sloupců vybráno</span>
        <Button
          size="sm"
          onClick={handleExport}
          disabled={selectedCount === 0}
          className="h-8 bg-[#2d5a3d] hover:bg-[#244d33] text-white shrink-0"
        >
          <Download className="h-3.5 w-3.5 mr-1" />
          Exportovat
        </Button>
      </div>
    </div>
  );
}
