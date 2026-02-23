import { useState, useRef } from "react";
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
import { ArrowLeft, Plus, Upload, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";

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
              <TableHead className="font-semibold min-w-[200px]">Název</TableHead>
              <TableHead className="font-semibold min-w-[120px]">Typ</TableHead>
              <TableHead className="font-semibold min-w-[140px]">Konstruktér</TableHead>
              <TableHead className="font-semibold min-w-[160px]">Status</TableHead>
              <TableHead className="font-semibold min-w-[90px]">Odesláno</TableHead>
              <TableHead className="font-semibold min-w-[90px]">Přijato</TableHead>
              <TableHead className="font-semibold min-w-[200px]">Poznámka</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Načítání...</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Žádné položky</TableCell></TableRow>
            ) : items.map(item => (
              <TableRow key={item.id} className={`hover:bg-muted/50 transition-colors h-9 ${selected.has(item.id) ? "bg-primary/5" : ""}`}>
                {canManageTPV && <TableCell><Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} /></TableCell>}
                {!canManageTPV && <TableCell />}
                <TableCell><InlineEditableCell value={item.item_name} onSave={(v) => saveField(item.id, "item_name", v, item.item_name)} className="font-medium" readOnly={!canManageTPV} /></TableCell>
                <TableCell><InlineEditableCell value={item.item_type} onSave={(v) => saveField(item.id, "item_type", v, item.item_type || "")} readOnly={!canManageTPV} /></TableCell>
                <TableCell>
                  <InlineEditableCell
                    value={item.konstrukter || ""}
                    type="people"
                    peopleRole="Konstruktér"
                    onSave={(v) => saveField(item.id, "konstrukter", v, item.konstrukter || "")}
                    readOnly={!canManageTPV}
                  />
                </TableCell>
                <TableCell><InlineEditableCell value={item.status} type="select" options={TPV_STATUSES} onSave={(v) => saveField(item.id, "status", v, item.status || "")} readOnly={!canManageTPV} /></TableCell>
                <TableCell><InlineEditableCell value={item.sent_date} onSave={(v) => saveField(item.id, "sent_date", v, item.sent_date || "")} readOnly={!canManageTPV} /></TableCell>
                <TableCell><InlineEditableCell value={item.accepted_date} onSave={(v) => saveField(item.id, "accepted_date", v, item.accepted_date || "")} readOnly={!canManageTPV} /></TableCell>
                <TableCell><InlineEditableCell value={item.notes} type="textarea" onSave={(v) => saveField(item.id, "notes", v, item.notes || "")} readOnly={!canManageTPV} /></TableCell>
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
