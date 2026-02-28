import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useAllCustomColumns, useUpdateCustomField } from "@/hooks/useCustomColumns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InlineEditableCell } from "./InlineEditableCell";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "./ConfirmDialog";
import { useTPVItems, useUpdateTPVItem, useAddTPVItem, useDeleteTPVItems, useBulkUpdateTPVStatus, useBulkInsertTPVItems } from "@/hooks/useTPVItems";
import { useTPVStatusOptions } from "@/hooks/useTPVStatusOptions";
import { ArrowLeft, Plus, Upload, Trash2, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import { useHeaderDrag } from "@/hooks/useHeaderDrag";
import { SortableHeader } from "./SortableHeader";
import { ColumnVisibilityToggle } from "./ColumnVisibilityToggle";
import { cn } from "@/lib/utils";
import { exportToExcel, buildFileName } from "@/lib/exportExcel";
import { ExportPopup } from "./ExportPopup";

const TPV_LIST_COLUMNS: { key: string; label: string; locked?: boolean }[] = [
  { key: "item_name", label: "Název", locked: true },
  { key: "item_type", label: "Typ" },
  { key: "konstrukter", label: "Konstruktér" },
  { key: "status", label: "Status" },
  { key: "sent_date", label: "Odesláno" },
  { key: "accepted_date", label: "Přijato" },
  { key: "notes", label: "Poznámka" },
];

const TPV_LIST_LABEL_MAP = Object.fromEntries(TPV_LIST_COLUMNS.map(c => [c.key, c.label]));
const TPV_LIST_NON_LOCKED = TPV_LIST_COLUMNS.filter(c => !c.locked).map(c => c.key);

function getTPVListColumnStyle(key: string, customWidth?: number | null): React.CSSProperties {
  if (customWidth) return { width: customWidth, minWidth: customWidth };
  switch (key) {
    case "sent_date":
    case "accepted_date":
      return { width: 100, minWidth: 100, maxWidth: 100 };
    case "item_name":
      return { minWidth: 200 };
    case "notes":
      return { minWidth: 200 };
    case "status":
      return { minWidth: 140 };
    case "konstrukter":
      return { minWidth: 124, maxWidth: 124, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as React.CSSProperties;
    default:
      return { minWidth: 120 };
  }
}

interface Props {
  projectId: string;
  projectName: string;
  onBack: () => void;
}

export function TPVList({ projectId, projectName, onBack }: Props) {
  const { canManageTPV, canEdit, canEditColumns } = useAuth();
  const { data: items = [], isLoading } = useTPVItems(projectId);
  const { data: statusOptions = [] } = useTPVStatusOptions();
  const TPV_STATUSES = statusOptions.map(o => o.label);

  const updateItem = useUpdateTPVItem();
  const addItem = useAddTPVItem();
  const deleteItems = useDeleteTPVItems();
  const bulkStatus = useBulkUpdateTPVStatus();
  const bulkInsert = useBulkInsertTPVItems();
  const { columns: customColumns } = useAllCustomColumns("tpv_items");
  const updateCustomField = useUpdateCustomField();

  // ── Column management via shared hooks ──────────────────────────
  const {
    getLabel, getWidth, updateLabel, updateWidth,
    getOrderedKeys, getDisplayOrderedKeys, updateDisplayOrder,
    getVisibilityMap, updateVisibility,
  } = useColumnLabels("tpv-list");

  const visMap = useMemo(() => getVisibilityMap(), [getVisibilityMap]);
  const isColVisible = useCallback((key: string) => {
    if (key === "item_name") return true;
    return visMap[key] !== false;
  }, [visMap]);
  const toggleColVis = useCallback((key: string) => {
    updateVisibility(key, !isColVisible(key));
  }, [isColVisible, updateVisibility]);

  const orderedNonLocked = useMemo(() => getOrderedKeys(TPV_LIST_NON_LOCKED), [getOrderedKeys]);
  const allVisibleNonLocked = useMemo(() => {
    const vis = orderedNonLocked.filter(k => isColVisible(k));
    return getDisplayOrderedKeys(vis);
  }, [orderedNonLocked, isColVisible, getDisplayOrderedKeys]);

  const [editMode, setEditMode] = useState(false);
  const [localOrder, setLocalOrder] = useState<string[]>(allVisibleNonLocked);

  useEffect(() => {
    if (!editMode) setLocalOrder(allVisibleNonLocked);
  }, [allVisibleNonLocked, editMode]);

  const handleToggleEditMode = useCallback(async () => {
    if (editMode) {
      await updateDisplayOrder(localOrder);
    } else {
      setLocalOrder(allVisibleNonLocked);
    }
    setEditMode(!editMode);
  }, [editMode, localOrder, allVisibleNonLocked, updateDisplayOrder]);

  const { dragKey, dropTarget, getDragProps } = useHeaderDrag(localOrder, setLocalOrder);

  const renderKeys = editMode ? localOrder : allVisibleNonLocked;

  // ── Sort state ──────────────────────────────────────────────────
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const toggleSort = (col: string) => {
    if (sortCol === col) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortCol(null); setSortDir(null); }
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const sortedItems = useMemo(() => {
    if (!sortCol || !sortDir) return items;
    return [...items].sort((a, b) => {
      const va = (a as any)[sortCol] || "";
      const vb = (b as any)[sortCol] || "";
      const cmp = String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [items, sortCol, sortDir]);

  // ── Selection & CRUD state ──────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [bulkStatusValue, setBulkStatusValue] = useState("");
  const [newItem, setNewItem] = useState({ item_name: "", item_type: "", status: "", sent_date: "", accepted_date: "", notes: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const visibleColCount = renderKeys.length + 3; // +checkbox +item_name +actions

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  };

  const handleAdd = () => {
    if (!newItem.item_name) return;
    addItem.mutate({
      project_id: projectId,
      item_name: newItem.item_name,
      item_type: newItem.item_type || undefined,
      status: newItem.status || undefined,
      sent_date: newItem.sent_date || undefined,
      accepted_date: newItem.accepted_date || undefined,
      notes: newItem.notes || undefined,
    });
    setNewItem({ item_name: "", item_type: "", status: "", sent_date: "", accepted_date: "", notes: "" });
    setAddOpen(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
      setImportData(data.map(row => ({
        item_name: row["item_name"] || row["Název"] || row["name"] || "",
        item_type: row["item_type"] || row["Typ"] || row["type"] || "",
        status: row["status"] || row["Status"] || "",
        sent_date: row["sent_date"] || row["Odesláno"] || "",
        accepted_date: row["accepted_date"] || row["Přijato"] || "",
        notes: row["notes"] || row["Poznámka"] || "",
      })));
      setImportOpen(true);
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handleImportConfirm = () => {
    const validItems = importData.filter(r => r.item_name).map(r => ({ ...r, project_id: projectId }));
    if (validItems.length) bulkInsert.mutate({ items: validItems, projectId });
    setImportOpen(false);
    setImportData([]);
  };

  const handleBulkStatusApply = () => {
    if (!bulkStatusValue || selected.size === 0) return;
    bulkStatus.mutate({ ids: Array.from(selected), status: bulkStatusValue, projectId });
    setSelected(new Set());
    setBulkStatusValue("");
  };

  const saveField = (itemId: string, field: string, value: string, oldValue: string) => {
    updateItem.mutate({ id: itemId, field, value, projectId, oldValue });
  };

  // ── Header helpers ──────────────────────────────────────────────
  const headerProps = (key: string) => ({
    label: TPV_LIST_LABEL_MAP[key] || key,
    column: key,
    sortCol,
    sortDir,
    onSort: toggleSort,
    style: getTPVListColumnStyle(key, getWidth(key)),
    editMode,
    customLabel: getLabel(key, TPV_LIST_LABEL_MAP[key] || key),
    onLabelChange: (v: string) => updateLabel(key, v),
    onWidthChange: (w: number) => updateWidth(key, w),
    ...(editMode ? {
      dragProps: getDragProps(key),
      dropIndicator: dropTarget?.key === key ? dropTarget.side : null,
      isDragging: dragKey === key,
    } : {}),
  });

  const tpvExportMeta = useMemo(() => ({
    getter: (selectedKeys?: string[]) => {
      const visKeys = selectedKeys ?? ["item_name", ...renderKeys];
      const headers = visKeys.map(k => getLabel(k, TPV_LIST_LABEL_MAP[k] || k));
      const rows = sortedItems.map(item => visKeys.map(k => {
        if (k.startsWith("custom_")) {
          const cf = (item as any).custom_fields || {};
          return cf[k] ?? "";
        }
        const val = (item as any)[k];
        return val == null ? "" : String(val);
      }));
      return { headers, rows };
    },
    groups: [
      { label: "TPV List", keys: TPV_LIST_COLUMNS.map(c => c.key), getLabel: (k: string) => getLabel(k, TPV_LIST_LABEL_MAP[k] || k) },
    ],
    defaultVisibleKeys: ["item_name", ...renderKeys],
  }), [renderKeys, sortedItems, getLabel]);

  const [exportOpen, setExportOpen] = useState(false);
  const exportWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportWrapperRef.current && !exportWrapperRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportOpen]);

  return (
    <div className="w-full min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Zpět
        </Button>
        <span className="text-sm font-serif font-bold">{projectId} — {projectName}</span>
        <span className="text-muted-foreground/40 text-sm">|</span>
        <div ref={exportWrapperRef} className="relative">
          <button
            onClick={() => setExportOpen(!exportOpen)}
            className="border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-sm px-3 py-1.5 rounded-md gap-1.5 flex items-center"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
          {exportOpen && (
            <ExportPopup
              tabKey={`tpv-list-${projectId}`}
              tabLabel="TPV"
              sheetName="TPV Items"
              meta={tpvExportMeta}
              onClose={() => setExportOpen(false)}
              projectId={projectId}
            />
          )}
        </div>
        {canManageTPV && (
          <>
            <Button size="sm" variant="outline" onClick={() => { setNewItem({ item_name: "", item_type: "", status: "", sent_date: "", accepted_date: "", notes: "" }); setAddOpen(true); }}>
              <Plus className="h-3 w-3 mr-1" /> Přidat položku
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3 w-3 mr-1" /> Import z Excelu
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />
          </>
        )}

        {selected.size > 0 && canManageTPV && (
          <div className="flex items-center gap-2 ml-4 border-l pl-4">
            <span className="text-sm text-muted-foreground">{selected.size} vybráno</span>
            <Select value={bulkStatusValue} onValueChange={setBulkStatusValue}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Změnit status..." />
              </SelectTrigger>
              <SelectContent>
                {TPV_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={handleBulkStatusApply} disabled={!bulkStatusValue}>Aplikovat</Button>
            <Button size="sm" variant="destructive" onClick={() => setDeleteIds(Array.from(selected))}>
              <Trash2 className="h-3 w-3 mr-1" /> Smazat
            </Button>
          </div>
        )}
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <div className="bg-accent/10 border border-accent/30 text-accent text-xs font-medium px-3 py-1.5 rounded-t-lg">
          Režim úpravy sloupců
        </div>
      )}

      <div className={cn("rounded-lg border bg-card overflow-x-auto always-scrollbar", editMode && "rounded-t-none border-t-0")}>
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/5">
              <TableHead className="w-10">
                <Checkbox checked={items.length > 0 && selected.size === items.length} onCheckedChange={toggleAll} />
              </TableHead>
              {/* Locked: item_name */}
              {isColVisible("item_name") && (
                <SortableHeader {...headerProps("item_name")} />
              )}
              {/* Dynamic columns */}
              {renderKeys.map(key => (
                <SortableHeader key={key} {...headerProps(key)} />
              ))}
              {/* Column toggle */}
              <ColumnVisibilityToggle
                standalone
                columns={TPV_LIST_COLUMNS}
                groupLabel="TPV List"
                labelTab="tpv-list"
                tableName="tpv_items"
                isVisible={isColVisible}
                toggleColumn={toggleColVis}
                editMode={editMode}
                onToggleEditMode={canEditColumns ? handleToggleEditMode : undefined}
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={visibleColCount} className="text-center text-muted-foreground">Načítání...</TableCell></TableRow>
            ) : sortedItems.length === 0 ? (
              <TableRow><TableCell colSpan={visibleColCount} className="text-center text-muted-foreground">Žádné položky</TableCell></TableRow>
            ) : sortedItems.map(item => (
              <TableRow key={item.id} className={`hover:bg-muted/50 transition-colors h-9 ${selected.has(item.id) ? "bg-primary/5" : ""}`}>
                {canManageTPV && <TableCell><Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} /></TableCell>}
                {!canManageTPV && <TableCell />}
                {isColVisible("item_name") && (
                  <TableCell><InlineEditableCell value={item.item_name} onSave={(v) => saveField(item.id, "item_name", v, item.item_name)} className="font-medium" readOnly={!canManageTPV} /></TableCell>
                )}
                {renderKeys.map(key => {
                  if (key === "item_type") return <TableCell key={key}><InlineEditableCell value={item.item_type} onSave={(v) => saveField(item.id, "item_type", v, item.item_type || "")} readOnly={!canManageTPV} /></TableCell>;
                  if (key === "konstrukter") return (
                    <TableCell key={key}>
                      <InlineEditableCell value={item.konstrukter || ""} type="people" peopleRole="Konstruktér" onSave={(v) => saveField(item.id, "konstrukter", v, item.konstrukter || "")} readOnly={!canManageTPV} />
                    </TableCell>
                  );
                  if (key === "status") return <TableCell key={key}><InlineEditableCell value={item.status} type="select" options={TPV_STATUSES} onSave={(v) => saveField(item.id, "status", v, item.status || "")} readOnly={!canManageTPV} /></TableCell>;
                  if (key === "sent_date") return <TableCell key={key}><InlineEditableCell value={item.sent_date} onSave={(v) => saveField(item.id, "sent_date", v, item.sent_date || "")} readOnly={!canManageTPV} /></TableCell>;
                  if (key === "accepted_date") return <TableCell key={key}><InlineEditableCell value={item.accepted_date} onSave={(v) => saveField(item.id, "accepted_date", v, item.accepted_date || "")} readOnly={!canManageTPV} /></TableCell>;
                  if (key === "notes") return <TableCell key={key}><InlineEditableCell value={item.notes} type="textarea" onSave={(v) => saveField(item.id, "notes", v, item.notes || "")} readOnly={!canManageTPV} /></TableCell>;
                  // Custom columns
                  if (key.startsWith("custom_")) {
                    const def = customColumns.find(c => c.column_key === key);
                    if (!def) return null;
                    const customFields = (item as any).custom_fields || {};
                    const val = customFields[key] || "";
                    const cellType = def.data_type === "date" ? "date" : def.data_type === "number" ? "number" : def.data_type === "select" ? "select" : def.data_type === "people" ? "people" : undefined;
                    return (
                      <TableCell key={key}>
                        <InlineEditableCell
                          value={val}
                          type={cellType as any}
                          options={def.data_type === "select" ? def.select_options : undefined}
                          peopleRole={def.data_type === "people" ? (def.people_role as any || undefined) : undefined}
                          onSave={(v) => updateCustomField.mutate({ rowId: item.id, tableName: "tpv_items", columnKey: key, value: v, oldValue: val })}
                          readOnly={!canManageTPV}
                        />
                      </TableCell>
                    );
                  }
                  return null;
                })}
                <TableCell>
                  {canManageTPV && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteIds([item.id])}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Add Item Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nová položka</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Název</Label><Input value={newItem.item_name} onChange={(e) => setNewItem(s => ({ ...s, item_name: e.target.value }))} /></div>
            <div><Label>Typ</Label><Input value={newItem.item_type} onChange={(e) => setNewItem(s => ({ ...s, item_type: e.target.value }))} /></div>
            <div><Label>Status</Label>
              <Select value={newItem.status} onValueChange={(v) => setNewItem(s => ({ ...s, status: v }))}>
                <SelectTrigger><SelectValue placeholder="Vyberte status..." /></SelectTrigger>
                <SelectContent>{TPV_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Odesláno</Label><Input value={newItem.sent_date} onChange={(e) => setNewItem(s => ({ ...s, sent_date: e.target.value }))} /></div>
            <div><Label>Přijato</Label><Input value={newItem.accepted_date} onChange={(e) => setNewItem(s => ({ ...s, accepted_date: e.target.value }))} /></div>
            <div><Label>Poznámka</Label><Input value={newItem.notes} onChange={(e) => setNewItem(s => ({ ...s, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Zrušit</Button>
            <Button onClick={handleAdd}>Přidat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Import z Excelu — náhled</DialogTitle></DialogHeader>
          <div className="rounded border overflow-auto max-h-[50vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Název</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Odesláno</TableHead>
                  <TableHead>Přijato</TableHead>
                  <TableHead>Poznámka</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importData.map((row, i) => (
                  <TableRow key={i}>
                    {(["item_name", "item_type", "status", "sent_date", "accepted_date", "notes"] as const).map(field => (
                      <TableCell key={field}>
                        <Input
                          className="h-7 text-xs"
                          value={row[field]}
                          onChange={(e) => {
                            const copy = [...importData];
                            copy[i] = { ...copy[i], [field]: e.target.value };
                            setImportData(copy);
                          }}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportData([]); }}>Zrušit</Button>
            <Button onClick={handleImportConfirm}>Importovat ({importData.filter(r => r.item_name).length} položek)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteIds}
        onConfirm={() => {
          if (deleteIds) {
            deleteItems.mutate({ ids: deleteIds, projectId });
            setSelected(prev => { const next = new Set(prev); deleteIds.forEach(id => next.delete(id)); return next; });
            setDeleteIds(null);
          }
        }}
        onCancel={() => setDeleteIds(null)}
        description={deleteIds && deleteIds.length > 1 ? `Smazat ${deleteIds.length} položek?` : "Tato akce je nevratná."}
      />
    </div>
  );
}
