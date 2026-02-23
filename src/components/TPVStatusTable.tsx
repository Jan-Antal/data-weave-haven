import { useState, Fragment, useRef } from "react";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { StatusBadge, RiskBadge, ProgressBar } from "./StatusBadge";
import { InlineEditableCell } from "./InlineEditableCell";
import { SortableHeader } from "./SortableHeader";
import { useProjects } from "@/hooks/useProjects";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { useSortFilter } from "@/hooks/useSortFilter";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { useTPVStatusOptions } from "@/hooks/useTPVStatusOptions";
import { ChevronRight, ChevronDown, Plus, Trash2, Upload } from "lucide-react";
import { TableHeader, TableHead } from "@/components/ui/table";
import { useColumnVisibility } from "@/hooks/useColumnVisibility";
import { ColumnVisibilityToggle } from "./ColumnVisibilityToggle";
import { useTPVItems, useUpdateTPVItem, useAddTPVItem, useDeleteTPVItems, useBulkUpdateTPVStatus, useBulkInsertTPVItems } from "@/hooks/useTPVItems";
import { ConfirmDialog } from "./ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from "xlsx";

const TPV_COLUMNS = [
  { key: "project_id", label: "Project ID", locked: true },
  { key: "project_name", label: "Project Name", locked: true },
  { key: "pm", label: "PM" },
  { key: "klient", label: "Klient" },
  { key: "konstrukter", label: "Konstruktér" },
  { key: "narocnost", label: "Náročnost" },
  { key: "hodiny_tpv", label: "Hodiny TPV" },
  { key: "percent_tpv", label: "% Status" },
  { key: "status", label: "Status" },
  { key: "tpv_risk", label: "Risk" },
  { key: "zamereni", label: "Zaměření" },
  { key: "expedice", label: "Expedice" },
  { key: "predani", label: "Předání" },
  { key: "tpv_poznamka", label: "Poznámka" },
];

function ExpandArrow({ projectId, isExpanded }: { projectId: string; isExpanded: boolean }) {
  const { data: items = [] } = useTPVItems(projectId);
  const hasItems = items.length > 0;

  if (isExpanded) {
    return <ChevronDown className={`h-5 w-5 stroke-[3] ${hasItems ? "text-accent" : "text-muted-foreground"}`} />;
  }
  return (
    <ChevronRight className={`h-5 w-5 stroke-[3] ${hasItems ? "text-accent fill-accent/20" : "text-muted-foreground/50"}`} />
  );
}

function TPVItemsSection({ projectId }: { projectId: string }) {
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
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  };

  const handleAdd = () => {
    if (!newItem.item_name) return;
    addItem.mutate({ project_id: projectId, item_name: newItem.item_name, item_type: newItem.item_type || undefined, status: newItem.status || undefined, sent_date: newItem.sent_date || undefined, accepted_date: newItem.accepted_date || undefined, notes: newItem.notes || undefined });
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

  // Count visible parent columns to calculate colspan
  const colSpan = 16;

  return (
    <>
      {/* Toolbar row */}
      <TableRow className="bg-muted/20 h-9">
        <TableCell colSpan={colSpan}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => { setNewItem({ item_name: "", item_type: "", status: "", sent_date: "", accepted_date: "", notes: "" }); setAddOpen(true); }}>
              <Plus className="h-3 w-3 mr-1" /> Přidat položku
            </Button>
            <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => fileRef.current?.click()}>
              <Upload className="h-3 w-3 mr-1" /> Import
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />
            {selected.size > 0 && (
              <div className="flex items-center gap-2 ml-2 border-l pl-2">
                <span className="text-xs text-muted-foreground">{selected.size} vybráno</span>
                <Select value={bulkStatusValue} onValueChange={setBulkStatusValue}>
                  <SelectTrigger className="h-6 w-[140px] text-xs"><SelectValue placeholder="Status..." /></SelectTrigger>
                  <SelectContent>{TPV_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={handleBulkStatusApply} disabled={!bulkStatusValue}>Aplikovat</Button>
                <Button size="sm" variant="destructive" className="h-6 text-xs" onClick={() => setDeleteIds(Array.from(selected))}>
                  <Trash2 className="h-3 w-3 mr-1" /> Smazat
                </Button>
              </div>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Item sub-header */}
      <TableRow className="bg-muted/10 h-8">
        <TableCell className="w-8"></TableCell>
        <TableCell className="w-8"><Checkbox checked={items.length > 0 && selected.size === items.length} onCheckedChange={toggleAll} /></TableCell>
        <TableCell className="text-xs font-semibold" colSpan={2}>Název</TableCell>
        <TableCell className="text-xs font-semibold">Typ</TableCell>
        <TableCell className="text-xs font-semibold">Konstruktér</TableCell>
        <TableCell className="text-xs font-semibold">Status</TableCell>
        <TableCell className="text-xs font-semibold">Odesláno</TableCell>
        <TableCell className="text-xs font-semibold">Přijato</TableCell>
        <TableCell className="text-xs font-semibold" colSpan={5}>Poznámka</TableCell>
        <TableCell className="w-8"></TableCell>
      </TableRow>

      {/* Items */}
      {isLoading ? (
        <TableRow><TableCell colSpan={colSpan} className="text-center text-muted-foreground text-xs">Načítání...</TableCell></TableRow>
      ) : items.length === 0 ? (
        <TableRow className="bg-muted/10"><TableCell colSpan={colSpan} className="text-center text-muted-foreground text-xs">Žádné položky</TableCell></TableRow>
      ) : items.map(item => (
        <TableRow key={item.id} className={`bg-muted/10 hover:bg-muted/30 transition-colors h-9 ${selected.has(item.id) ? "bg-primary/5" : ""}`}>
          <TableCell className="w-8"></TableCell>
          <TableCell className="w-8"><Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} /></TableCell>
          <TableCell colSpan={2}><InlineEditableCell value={item.item_name} onSave={(v) => saveField(item.id, "item_name", v, item.item_name)} className="font-medium" /></TableCell>
          <TableCell><InlineEditableCell value={item.item_type} onSave={(v) => saveField(item.id, "item_type", v, item.item_type || "")} /></TableCell>
          <TableCell><InlineEditableCell value={item.konstrukter || ""} type="people" peopleRole="Konstruktér" onSave={(v) => saveField(item.id, "konstrukter", v, item.konstrukter || "")} /></TableCell>
          <TableCell><InlineEditableCell value={item.status} type="select" options={TPV_STATUSES} onSave={(v) => saveField(item.id, "status", v, item.status || "")} /></TableCell>
          <TableCell><InlineEditableCell value={item.sent_date} onSave={(v) => saveField(item.id, "sent_date", v, item.sent_date || "")} /></TableCell>
          <TableCell><InlineEditableCell value={item.accepted_date} onSave={(v) => saveField(item.id, "accepted_date", v, item.accepted_date || "")} /></TableCell>
          <TableCell colSpan={5}><InlineEditableCell value={item.notes} type="textarea" onSave={(v) => saveField(item.id, "notes", v, item.notes || "")} /></TableCell>
          <TableCell className="w-8">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteIds([item.id])}>
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </TableCell>
        </TableRow>
      ))}

      {/* Dialogs */}
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

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Import z Excelu — náhled</DialogTitle></DialogHeader>
          <div className="rounded border overflow-auto max-h-[50vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Název</TableHead><TableHead>Typ</TableHead><TableHead>Status</TableHead>
                  <TableHead>Odesláno</TableHead><TableHead>Přijato</TableHead><TableHead>Poznámka</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importData.map((row, i) => (
                  <TableRow key={i}>
                    {(["item_name", "item_type", "status", "sent_date", "accepted_date", "notes"] as const).map(field => (
                      <TableCell key={field}>
                        <Input className="h-7 text-xs" value={row[field]} onChange={(e) => { const copy = [...importData]; copy[i] = { ...copy[i], [field]: e.target.value }; setImportData(copy); }} />
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
    </>
  );
}

interface TPVStatusTableProps {
  personFilter: string | null;
  statusFilter: string[];
  search: string;
}

export function TPVStatusTable({ personFilter, statusFilter, search: externalSearch }: TPVStatusTableProps) {
  const { data: projects = [], isLoading } = useProjects();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const statusLabels = statusOptions.map((s) => s.label);
  const updateProject = useUpdateProject();
  const { sorted, sortCol, sortDir, toggleSort } = useSortFilter(projects, { personFilter, statusFilter }, externalSearch);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { isVisible, toggleColumn, columns } = useColumnVisibility("col-vis-tpv-status", TPV_COLUMNS);

  const toggleExpand = (pid: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  const save = (id: string, field: string, value: string, oldValue: string) => {
    updateProject.mutate({ id, field, value, oldValue });
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Načítání...</div>;

  const sh = { sortCol, sortDir, onSort: toggleSort };
  const v = isVisible;

  return (
    <div>
      <div className="rounded-lg border bg-card overflow-x-scroll always-scrollbar">
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/5">
              <TableHead className="w-8"></TableHead>
              {v("project_id") && <SortableHeader label="Project ID" column="project_id" {...sh} className="min-w-[130px]" />}
              {v("project_name") && <SortableHeader label="Project Name" column="project_name" {...sh} className="min-w-[180px]" />}
              {v("pm") && <SortableHeader label="PM" column="pm" {...sh} className="min-w-[140px]" />}
              {v("klient") && <SortableHeader label="Klient" column="klient" {...sh} className="min-w-[120px]" />}
              {v("konstrukter") && <SortableHeader label="Konstruktér" column="konstrukter" {...sh} className="min-w-[140px]" />}
              {v("narocnost") && <SortableHeader label="Náročnost" column="narocnost" {...sh} className="min-w-[90px]" />}
              {v("hodiny_tpv") && <SortableHeader label="Hodiny TPV" column="hodiny_tpv" {...sh} className="min-w-[90px]" />}
              {v("percent_tpv") && <SortableHeader label="% Status" column="percent_tpv" {...sh} className="min-w-[120px]" />}
              {v("status") && <SortableHeader label="Status" column="status" {...sh} className="min-w-[110px]" />}
              {v("tpv_risk") && <SortableHeader label="Risk" column="tpv_risk" {...sh} className="min-w-[80px]" />}
              {v("zamereni") && <SortableHeader label="Zaměření" column="zamereni" {...sh} className="min-w-[90px]" />}
              {v("expedice") && <SortableHeader label="Expedice" column="expedice" {...sh} className="min-w-[90px]" />}
              {v("predani") && <SortableHeader label="Předání" column="predani" {...sh} className="min-w-[90px]" />}
              {v("tpv_poznamka") && <SortableHeader label="Poznámka" column="tpv_poznamka" {...sh} className="min-w-[175px]" />}
              <ColumnVisibilityToggle columns={columns} isVisible={isVisible} toggleColumn={toggleColumn} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <Fragment key={p.id}>
                <TableRow className="hover:bg-muted/50 transition-colors h-9">
                  <TableCell className="w-8 cursor-pointer" onClick={() => toggleExpand(p.project_id)}>
                    <ExpandArrow projectId={p.project_id} isExpanded={expanded.has(p.project_id)} />
                  </TableCell>
                  {v("project_id") && <TableCell className="font-mono text-xs truncate" title={p.project_id}>{p.project_id}</TableCell>}
                  {v("project_name") && <TableCell><InlineEditableCell value={p.project_name} onSave={(val) => save(p.id, "project_name", val, p.project_name)} className="font-medium" /></TableCell>}
                  {v("pm") && <TableCell><InlineEditableCell value={p.pm} type="people" peopleRole="PM" onSave={(val) => save(p.id, "pm", val, p.pm || "")} /></TableCell>}
                  {v("klient") && <TableCell><InlineEditableCell value={p.klient} onSave={(val) => save(p.id, "klient", val, p.klient || "")} /></TableCell>}
                  {v("konstrukter") && <TableCell><InlineEditableCell value={p.konstrukter} type="people" peopleRole="Konstruktér" onSave={(val) => save(p.id, "konstrukter", val, p.konstrukter || "")} /></TableCell>}
                  {v("narocnost") && (
                    <TableCell>
                      <InlineEditableCell value={p.narocnost} type="select" options={["Low", "Medium", "High"]} onSave={(val) => save(p.id, "narocnost", val, p.narocnost || "")} displayValue={<RiskBadge level={p.narocnost || ""} />} />
                    </TableCell>
                  )}
                  {v("hodiny_tpv") && <TableCell><InlineEditableCell value={p.hodiny_tpv} onSave={(val) => save(p.id, "hodiny_tpv", val, p.hodiny_tpv || "")} /></TableCell>}
                  {v("percent_tpv") && (
                    <TableCell>
                      <InlineEditableCell value={p.percent_tpv} type="number" onSave={(val) => save(p.id, "percent_tpv", val, String(p.percent_tpv ?? ""))} displayValue={<ProgressBar value={p.percent_tpv || 0} />} />
                    </TableCell>
                  )}
                  {v("status") && (
                    <TableCell>
                      <InlineEditableCell value={p.status} type="select" options={statusLabels} onSave={(val) => save(p.id, "status", val, p.status || "")} displayValue={p.status ? <StatusBadge status={p.status} /> : "—"} />
                    </TableCell>
                  )}
                  {v("tpv_risk") && (
                    <TableCell>
                      <InlineEditableCell value={p.tpv_risk} type="select" options={["Low", "Medium", "High"]} onSave={(val) => save(p.id, "tpv_risk", val, p.tpv_risk || "")} displayValue={<RiskBadge level={p.tpv_risk || ""} />} />
                    </TableCell>
                  )}
                  {v("zamereni") && <TableCell><InlineEditableCell value={p.zamereni} type="date" onSave={(val) => save(p.id, "zamereni", val, p.zamereni || "")} /></TableCell>}
                  {v("expedice") && <TableCell><InlineEditableCell value={p.expedice} type="date" onSave={(val) => save(p.id, "expedice", val, p.expedice || "")} /></TableCell>}
                  {v("predani") && <TableCell><InlineEditableCell value={p.predani} type="date" onSave={(val) => save(p.id, "predani", val, p.predani || "")} /></TableCell>}
                  {v("tpv_poznamka") && <TableCell><InlineEditableCell value={p.tpv_poznamka} type="textarea" onSave={(val) => save(p.id, "tpv_poznamka", val, p.tpv_poznamka || "")} /></TableCell>}
                  <TableCell className="w-10" />
                </TableRow>
                {expanded.has(p.project_id) && <TPVItemsSection projectId={p.project_id} />}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
