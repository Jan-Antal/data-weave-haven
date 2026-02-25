import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InlineEditableCell } from "./InlineEditableCell";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDialog } from "./ConfirmDialog";
import { useTPVItems, useUpdateTPVItem, useAddTPVItem, useDeleteTPVItems, useBulkUpdateTPVStatus, useBulkInsertTPVItems } from "@/hooks/useTPVItems";
import { useTPVStatusOptions } from "@/hooks/useTPVStatusOptions";
import { ArrowLeft, Plus, Upload, Trash2, Columns3, GripVertical } from "lucide-react";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const TPV_LIST_STORAGE_KEY = "tpv-list-columns";
const TPV_LIST_ORDER_KEY = "tpv-list-column-order";

const TPV_LIST_COLUMNS: { key: string; label: string; locked?: boolean }[] = [
  { key: "item_name", label: "Název", locked: true },
  { key: "item_type", label: "Typ" },
  { key: "konstrukter", label: "Konstruktér" },
  { key: "status", label: "Status" },
  { key: "sent_date", label: "Odesláno" },
  { key: "accepted_date", label: "Přijato" },
  { key: "notes", label: "Poznámka" },
];

const DEFAULT_KEYS = TPV_LIST_COLUMNS.map(c => c.key);

function loadTPVListVisibility(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(TPV_LIST_STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  const defaults: Record<string, boolean> = {};
  TPV_LIST_COLUMNS.forEach(c => { defaults[c.key] = true; });
  return defaults;
}

function saveTPVListVisibility(vis: Record<string, boolean>) {
  try { localStorage.setItem(TPV_LIST_STORAGE_KEY, JSON.stringify(vis)); } catch {}
}

function loadTPVListOrder(): string[] {
  try {
    const stored = localStorage.getItem(TPV_LIST_ORDER_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      // Ensure all keys are present
      const missing = DEFAULT_KEYS.filter(k => !parsed.includes(k));
      return [...parsed, ...missing];
    }
  } catch {}
  return DEFAULT_KEYS;
}

function saveTPVListOrder(order: string[]) {
  try { localStorage.setItem(TPV_LIST_ORDER_KEY, JSON.stringify(order)); } catch {}
}

function SortableTPVColumnRow({
  colKey, label, checked, onToggle, locked,
}: {
  colKey: string; label: string; checked: boolean; onToggle: () => void; locked?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: colKey,
    disabled: !!locked,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm">
      {!locked ? (
        <div {...attributes} {...listeners} className="cursor-grab shrink-0 p-0.5">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      ) : (
        <div className="shrink-0 p-0.5 w-[18px]" />
      )}
      <label className="flex items-center gap-2 flex-1 cursor-pointer px-1">
        <Checkbox checked={checked} onCheckedChange={() => { if (!locked) onToggle(); }} disabled={locked} />
        <span className={locked ? "text-muted-foreground" : ""}>{label}</span>
      </label>
    </div>
  );
}

interface Props {
  projectId: string;
  projectName: string;
  onBack: () => void;
}

export function TPVItemsView({ projectId, projectName, onBack }: Props) {
  const { canManageTPV, canEdit } = useAuth();
  const { data: items = [], isLoading } = useTPVItems(projectId);
  const { data: statusOptions = [] } = useTPVStatusOptions();
  const TPV_STATUSES = statusOptions.map(o => o.label);
  
  const updateItem = useUpdateTPVItem();
  const addItem = useAddTPVItem();
  const deleteItems = useDeleteTPVItems();
  const bulkStatus = useBulkUpdateTPVStatus();
  const bulkInsert = useBulkInsertTPVItems();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [bulkStatusValue, setBulkStatusValue] = useState("");
  const [newItem, setNewItem] = useState({ item_name: "", item_type: "", status: "", sent_date: "", accepted_date: "", notes: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [colVis, setColVis] = useState<Record<string, boolean>>(loadTPVListVisibility);
  const [colOrder, setColOrder] = useState<string[]>(loadTPVListOrder);

  const isColVisible = (key: string) => colVis[key] !== false;
  const toggleColVis = (key: string) => {
    const next = { ...colVis, [key]: !isColVisible(key) };
    setColVis(next);
    saveTPVListVisibility(next);
  };

  const orderedVisibleKeys = useMemo(
    () => colOrder.filter(k => isColVisible(k)),
    [colOrder, colVis]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleColDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = colOrder.indexOf(active.id as string);
    const newIndex = colOrder.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(colOrder, oldIndex, newIndex);
    setColOrder(newOrder);
    saveTPVListOrder(newOrder);
  }, [colOrder]);

  const visibleColCount = orderedVisibleKeys.length + 2; // +checkbox +actions

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

  return (
    <div className="w-full min-w-0">
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Zpět
        </Button>
        <span className="text-sm font-serif font-bold">{projectId} — {projectName}</span>
        <span className="text-muted-foreground/40 text-sm">|</span>
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

      <div className="rounded-lg border bg-card overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/5">
              <TableHead className="w-10"><Checkbox checked={items.length > 0 && selected.size === items.length} onCheckedChange={toggleAll} /></TableHead>
              {orderedVisibleKeys.map(key => {
                const col = TPV_LIST_COLUMNS.find(c => c.key === key)!;
                const style = key === "sent_date" || key === "accepted_date"
                  ? { width: 100, minWidth: 100, maxWidth: 100 }
                  : key === "item_name" ? { minWidth: 200 }
                  : key === "notes" ? { minWidth: 200 }
                  : key === "status" ? { minWidth: 140 }
                  : { minWidth: 120 };
                return <TableHead key={key} className="font-semibold" style={style}>{col.label}</TableHead>;
              })}
              {/* Column toggle in header — same as main tables */}
              <TableHead
                className="w-[32px] min-w-[32px] p-0 sticky right-0 z-20"
                style={{ background: "linear-gradient(hsl(var(--primary) / 0.05), hsl(var(--primary) / 0.05)), hsl(var(--card))" }}
              >
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="relative p-2 rounded hover:bg-muted/50 transition-colors" title="Zobrazení sloupců" type="button">
                      <Columns3 className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    side="bottom"
                    avoidCollisions
                    collisionPadding={16}
                    sideOffset={4}
                    className="w-60 p-0 z-[9999] bg-popover border shadow-md flex flex-col"
                    style={{ maxHeight: "calc(100vh - 120px)" }}
                  >
                    <div className="overflow-y-auto p-2 pt-1">
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColDragEnd}>
                        <SortableContext items={colOrder} strategy={verticalListSortingStrategy}>
                          <div className="mb-2">
                            <div className="flex items-center gap-1 w-full text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1">
                              TPV List
                            </div>
                            {colOrder.map(key => {
                              const col = TPV_LIST_COLUMNS.find(c => c.key === key);
                              if (!col) return null;
                              return (
                                <SortableTPVColumnRow
                                  key={key}
                                  colKey={key}
                                  label={col.label}
                                  checked={isColVisible(key)}
                                  onToggle={() => toggleColVis(key)}
                                  locked={col.locked}
                                />
                              );
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  </PopoverContent>
                </Popover>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={visibleColCount} className="text-center text-muted-foreground">Načítání...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={visibleColCount} className="text-center text-muted-foreground">Žádné položky</TableCell></TableRow>
            ) : items.map(item => (
              <TableRow key={item.id} className={`hover:bg-muted/50 transition-colors h-9 ${selected.has(item.id) ? "bg-primary/5" : ""}`}>
                {canManageTPV && <TableCell><Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} /></TableCell>}
                {!canManageTPV && <TableCell />}
                {orderedVisibleKeys.map(key => {
                  if (key === "item_name") return <TableCell key={key}><InlineEditableCell value={item.item_name} onSave={(v) => saveField(item.id, "item_name", v, item.item_name)} className="font-medium" readOnly={!canManageTPV} /></TableCell>;
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
