import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { useAllCustomColumns, useUpdateCustomField } from "@/hooks/useCustomColumns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InlineEditableCell } from "./InlineEditableCell";
import { CurrencyEditCell } from "./CurrencyEditCell";
import { SortableHeader } from "./SortableHeader";
import { useProjects } from "@/hooks/useProjects";
import { useUpdateProject } from "@/hooks/useProjectMutations";
import { useSortFilter } from "@/hooks/useSortFilter";
import { useProjectStatusOptions } from "@/hooks/useProjectStatusOptions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatAppDate, parseAppDate } from "@/lib/dateFormat";
import { CalendarIcon, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { PeopleSelectDropdown } from "./PeopleSelectDropdown";
import { ProjectEditDialog } from "./ProjectEditDialog";
import { ColumnVisibilityToggle } from "./ColumnVisibilityToggle";
import { useProjectIdCheck } from "@/hooks/useProjectIdCheck";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import { useAuth } from "@/hooks/useAuth";
import { getProjectRiskColor } from "@/hooks/useRiskHighlight";
import { useAllColumnVisibility, PROJECT_INFO_NATIVE, PM_NATIVE, TPV_NATIVE, ALL_COLUMNS } from "./ColumnVisibilityContext";
import { getColumnStyle, renderColumnHeader, renderColumnCell } from "./CrossTabColumns";
import { useHeaderDrag } from "@/hooks/useHeaderDrag";
import { useDocumentCounts } from "@/hooks/useDocumentCounts";
import { useExportContext } from "./ExportContext";
import { getProjectCellValue } from "@/lib/exportExcel";
import { getColumnLabel } from "./CrossTabColumns";
import type { Project } from "@/hooks/useProjects";

const NATIVE_KEYS = ["project_id", "project_name", ...PROJECT_INFO_NATIVE];
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key);

const emptyProject = {
  project_id: "",
  project_name: "",
  klient: "",
  pm: "",
  konstrukter: "",
  kalkulant: "",
  status: "Příprava",
  datum_smluvni: "",
  prodejni_cena: "",
  currency: "CZK",
  marze: "",
  fakturace: "",
};

// ── Memoized project row ────────────────────────────────────────────
interface ProjectRowProps {
  project: Project;
  docCount: number;
  isVisible: (key: string) => boolean;
  renderKeys: string[];
  save: (id: string, field: string, value: string, oldValue: string) => void;
  saveCurrency: (id: string, amount: string, currency: string, oldAmount: string, oldCurrency: string) => void;
  canEdit: boolean;
  statusLabels: string[];
  customColumns: any[];
  saveCustomField: (rowId: string, colKey: string, val: string, old: string) => void;
  riskHighlight: any;
  onEditProject: (p: Project) => void;
}

const ProjectRow = memo(function ProjectRow({
  project: p,
  docCount,
  isVisible: v,
  renderKeys,
  save,
  saveCurrency,
  canEdit,
  statusLabels,
  customColumns,
  saveCustomField,
  riskHighlight,
  onEditProject,
}: ProjectRowProps) {
  const bgStyle = useMemo(() => {
    const c = riskHighlight ? getProjectRiskColor(p, riskHighlight) : null;
    return c ? { backgroundColor: c } : {};
  }, [p.risk, p.datum_smluvni, riskHighlight]);

  return (
    <TableRow className="hover:bg-muted/50 transition-colors" style={bgStyle}>
      <TableCell style={{ minWidth: 36, width: 36, maxWidth: 36 }} className="text-center">
        {(docCount ?? 0) > 0 && (
          <span className="inline-flex items-center gap-0.5 text-gray-400 text-[10px]">
            <Paperclip className="h-3 w-3" />
            {docCount}
          </span>
        )}
      </TableCell>
      {v("project_id") && (
        <TableCell className="font-mono text-xs truncate cursor-pointer hover:underline text-primary" title={p.project_id} onClick={() => onEditProject(p)}>
          {p.project_id}
        </TableCell>
      )}
      {v("project_name") && <TableCell style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.project_name}><InlineEditableCell value={p.project_name} onSave={(val) => save(p.id, "project_name", val, p.project_name)} className="font-medium" readOnly={!canEdit} /></TableCell>}
      {renderKeys.map((key) => renderColumnCell({ colKey: key, project: p, save, canEdit, statusLabels, saveCurrency, customColumns, saveCustomField: (rowId, colKey, val, old) => saveCustomField(rowId, colKey, val, old) }))}
    </TableRow>
  );
});

interface ProjectInfoTableProps {
  personFilter: string | null;
  statusFilter: string[];
  search: string;
  riskHighlight?: import("@/hooks/useRiskHighlight").RiskHighlightType;
}

export function ProjectInfoTable({ personFilter, statusFilter, search: externalSearch, riskHighlight }: ProjectInfoTableProps) {
  const { data: projects = [], isLoading } = useProjects();
  const { data: statusOptions = [] } = useProjectStatusOptions();
  const statusLabels = useMemo(() => statusOptions.map((s) => s.label), [statusOptions]);
  const updateProject = useUpdateProject();
  const { columns: customColumns } = useAllCustomColumns("projects");
  const updateCustomField = useUpdateCustomField();
  const { sorted, sortCol, sortDir, toggleSort } = useSortFilter(projects, { personFilter, statusFilter }, externalSearch);
  const allProjectIds = useMemo(() => projects.map((p) => p.project_id), [projects]);
  const { counts: docCounts } = useDocumentCounts(allProjectIds);
  const [addOpen, setAddOpen] = useState(false);
  const [newProj, setNewProj] = useState({ ...emptyProject });
  const [datumWarning, setDatumWarning] = useState(false);
  const qc = useQueryClient();
  const [editProject, setEditProject] = useState<typeof projects[0] | null>(null);
  const { projectInfo: { isVisible } } = useAllColumnVisibility();
  const { idExists, checkProjectId, reset: resetIdCheck } = useProjectIdCheck();
  const { getLabel, getWidth, updateLabel, updateWidth, getOrderedKeys, getDisplayOrderedKeys, updateDisplayOrder } = useColumnLabels("project-info");
  const [editMode, setEditMode] = useState(false);
  const { canEdit, canEditColumns, canDeleteProject, isViewer } = useAuth();
  const { registerExport } = useExportContext();

  // Persisted group order from DB (for side panel)
  const orderedNativeKeys = useMemo(() => getOrderedKeys(PROJECT_INFO_NATIVE), [getOrderedKeys]);
  const orderedAllKeys = useMemo(() => getOrderedKeys(ALL_KEYS), [getOrderedKeys]);

  // All visible keys in their group order
  const allVisibleGroupOrder = useMemo(() => {
    const native = orderedNativeKeys.filter((k) => isVisible(k));
    const cross = orderedAllKeys.filter((k) => !NATIVE_KEYS.includes(k) && isVisible(k));
    return [...native, ...cross];
  }, [orderedNativeKeys, orderedAllKeys, isVisible]);

  // Display order (independent horizontal table order)
  const allVisibleKeys = useMemo(
    () => getDisplayOrderedKeys(allVisibleGroupOrder),
    [getDisplayOrderedKeys, allVisibleGroupOrder]
  );

  const [localOrder, setLocalOrder] = useState<string[]>(allVisibleKeys);

  // Sync local order when not in edit mode or when visible keys change
  useEffect(() => {
    if (!editMode) setLocalOrder(allVisibleKeys);
  }, [allVisibleKeys, editMode]);

  const handleToggleEditMode = useCallback(async () => {
    if (editMode) {
      // Exiting edit mode — save the display order to DB
      await updateDisplayOrder(localOrder);
    } else {
      // Entering edit mode — snapshot current order
      setLocalOrder(allVisibleKeys);
    }
    setEditMode(!editMode);
  }, [editMode, localOrder, allVisibleKeys, updateDisplayOrder]);

  const { dragKey, dropTarget, getDragProps } = useHeaderDrag(localOrder, setLocalOrder);

  useEffect(() => {
    const handleOpenAdd = () => setAddOpen(true);
    document.addEventListener("open-add-project", handleOpenAdd);
    return () => document.removeEventListener("open-add-project", handleOpenAdd);
  }, []);

  // Register export data getter with column metadata
  useEffect(() => {
    const allExportKeys = ["project_id", "project_name", ...allVisibleKeys];
    registerExport("project-info", {
      getter: (selectedKeys) => {
        const keys = selectedKeys ?? allExportKeys;
        const headers = keys.map(k => getLabel(k, getColumnLabel(k)));
        const rows = sorted.map(p => keys.map(k => getProjectCellValue(p as any, k)));
        return { headers, rows };
      },
      groups: [
        { label: "Project Info", keys: ["project_id", "project_name", ...PROJECT_INFO_NATIVE], getLabel: (k) => getLabel(k, getColumnLabel(k)) },
        { label: "PM Status", keys: PM_NATIVE, getLabel: (k) => getLabel(k, getColumnLabel(k)) },
        { label: "TPV Status", keys: TPV_NATIVE, getLabel: (k) => getLabel(k, getColumnLabel(k)) },
      ],
      defaultVisibleKeys: allExportKeys,
    });
  }, [registerExport, sorted, allVisibleKeys, getLabel]);

  const save = useCallback((id: string, field: string, value: string, oldValue: string) => {
    updateProject.mutate({ id, field, value, oldValue });
  }, [updateProject]);

  const saveCurrency = useCallback((id: string, amount: string, currency: string, oldAmount: string, oldCurrency: string) => {
    const parsedAmount = amount === "" ? null : Number(amount);
    supabase.from("projects").update({ prodejni_cena: parsedAmount, currency } as any).eq("id", id).then(({ error }) => {
      if (error) {
        toast({ title: "Chyba", description: error.message, variant: "destructive" });
      } else {
        qc.invalidateQueries({ queryKey: ["projects"] });
        toast({ title: "Uloženo" });
      }
    });
  }, [qc]);

  const handleSaveCustomField = useCallback((rowId: string, colKey: string, val: string, old: string) => {
    updateCustomField.mutate({ rowId, tableName: "projects", columnKey: colKey, value: val, oldValue: old });
  }, [updateCustomField]);

  const handleEditProject = useCallback((p: Project) => {
    setEditProject(p);
  }, []);

  const handleAddProject = async () => {
    if (!newProj.project_id || !newProj.project_name) return;
    if (!newProj.datum_smluvni && !datumWarning) {
      setDatumWarning(true);
      return;
    }
    const { error } = await supabase.from("projects").insert({
      project_id: newProj.project_id,
      project_name: newProj.project_name,
      klient: newProj.klient || null,
      pm: newProj.pm || null,
      konstrukter: newProj.konstrukter || null,
      kalkulant: newProj.kalkulant || null,
      status: newProj.status || null,
      datum_smluvni: newProj.datum_smluvni || null,
      prodejni_cena: newProj.prodejni_cena ? Number(newProj.prodejni_cena) : null,
      currency: newProj.currency || "CZK",
      marze: newProj.marze || null,
      fakturace: newProj.fakturace || null,
    });
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Projekt vytvořen" });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setAddOpen(false);
      setNewProj({ ...emptyProject });
      setDatumWarning(false);
    }
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Načítání...</div>;

  const v = isVisible;

  const headerProps = (key: string) => ({
    colKey: key,
    sortCol,
    sortDir,
    onSort: toggleSort,
    getLabel,
    getWidth,
    editMode,
    updateLabel,
    updateWidth,
    ...(editMode ? {
      dragProps: getDragProps(key),
      dropIndicator: dropTarget?.key === key ? dropTarget.side : null,
      isDragging: dragKey === key,
    } : {}),
  });

  // In edit mode use local order, otherwise use DB order
  const renderKeys = editMode ? localOrder : allVisibleKeys;

  return (
    <div>
      {editMode && (
        <div className="bg-accent/10 border border-accent/30 text-accent text-xs font-medium px-3 py-1.5 rounded-t-lg">
          Režim úpravy sloupců
        </div>
      )}
      <div className={cn("rounded-lg border bg-card overflow-x-auto always-scrollbar", editMode && "rounded-t-none border-t-0")}>
        <Table>
          <TableHeader>
            <TableRow className="bg-primary/5">
              <TableHead style={{ minWidth: 36, width: 36, maxWidth: 36 }} className="text-center">
                <Paperclip className="h-3.5 w-3.5 text-gray-400 mx-auto" />
              </TableHead>
              {v("project_id") && renderColumnHeader(headerProps("project_id"))}
              {v("project_name") && renderColumnHeader(headerProps("project_name"))}
              {renderKeys.map((key) => renderColumnHeader(headerProps(key)))}
              <ColumnVisibilityToggle tabKey="projectInfo" editMode={editMode} onToggleEditMode={canEditColumns ? handleToggleEditMode : undefined} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                docCount={docCounts[p.project_id] ?? 0}
                isVisible={v}
                renderKeys={renderKeys}
                save={save}
                saveCurrency={saveCurrency}
                canEdit={canEdit}
                statusLabels={statusLabels}
                customColumns={customColumns}
                saveCustomField={handleSaveCustomField}
                riskHighlight={riskHighlight}
                onEditProject={handleEditProject}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader><DialogTitle>Nový projekt</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <Label>Project ID <span className="text-[hsl(var(--accent))]">*</span></Label>
              <Input
                value={newProj.project_id}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewProj((p) => ({ ...p, project_id: val }));
                  if (val.length >= 2) checkProjectId(val);
                  else resetIdCheck();
                }}
                className={idExists ? "border-destructive" : ""}
              />
              {idExists && <p className="text-destructive text-xs mt-1">Toto ID již existuje</p>}
            </div>
            <div>
              <Label>Project Name <span className="text-[hsl(var(--accent))]">*</span></Label>
              <Input value={newProj.project_name} onChange={(e) => setNewProj((p) => ({ ...p, project_name: e.target.value }))} />
            </div>
            <div>
              <Label>Klient</Label>
              <Input value={newProj.klient} onChange={(e) => setNewProj((p) => ({ ...p, klient: e.target.value }))} />
            </div>
            <div>
              <Label>PM</Label>
              <PeopleSelectDropdown value={newProj.pm} onValueChange={(val) => setNewProj((p) => ({ ...p, pm: val }))} role="PM" />
            </div>
            <div>
              <Label>Konstruktér</Label>
              <PeopleSelectDropdown value={newProj.konstrukter} onValueChange={(val) => setNewProj((p) => ({ ...p, konstrukter: val }))} role="Konstruktér" />
            </div>
            <div>
              <Label>Kalkulant</Label>
              <PeopleSelectDropdown value={newProj.kalkulant} onValueChange={(val) => setNewProj((p) => ({ ...p, kalkulant: val }))} role="Kalkulant" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={newProj.status} onValueChange={(val) => setNewProj((p) => ({ ...p, status: val }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statusLabels.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Datum smluvní</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !newProj.datum_smluvni && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newProj.datum_smluvni ? formatAppDate(parseAppDate(newProj.datum_smluvni)!) : "Vyberte datum"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                  <Calendar mode="single" selected={newProj.datum_smluvni ? parseAppDate(newProj.datum_smluvni) : undefined} onSelect={(date) => { if (date) { const iso = date.toISOString().split("T")[0]; setNewProj((p) => ({ ...p, datum_smluvni: iso })); } }} />
                </PopoverContent>
              </Popover>
              {datumWarning && <p className="text-[hsl(var(--accent))] text-xs mt-1">Datum smluvní není vyplněn. Klikněte znovu pro uložení bez data.</p>}
            </div>
            <div>
              <Label>Prodejní cena</Label>
              <Input type="number" value={newProj.prodejni_cena} onChange={(e) => setNewProj((p) => ({ ...p, prodejni_cena: e.target.value }))} />
            </div>
            <div>
              <Label>Měna</Label>
              <Select value={newProj.currency} onValueChange={(val) => setNewProj((p) => ({ ...p, currency: val }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CZK">CZK</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Marže</Label>
              <Input value={newProj.marze} onChange={(e) => setNewProj((p) => ({ ...p, marze: e.target.value }))} />
            </div>
            <div>
              <Label>Fakturace</Label>
              <Input value={newProj.fakturace} onChange={(e) => setNewProj((p) => ({ ...p, fakturace: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setAddOpen(false); setDatumWarning(false); resetIdCheck(); }}>Zrušit</Button>
            <Button onClick={handleAddProject} disabled={!newProj.project_id || !newProj.project_name || idExists}>Vytvořit projekt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editProject && <ProjectEditDialog project={editProject} open={!!editProject} onOpenChange={(open) => { if (!open) setEditProject(null); }} />}
    </div>
  );
}
