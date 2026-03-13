import { useState, useRef, useCallback, useEffect, useMemo, type UIEvent } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileTPVCardList } from "./mobile/MobileTPVCardList";
import { useAllCustomColumns, useUpdateCustomField } from "@/hooks/useCustomColumns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InlineEditableCell } from "./InlineEditableCell";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "./ConfirmDialog";
import { useTPVItems, useUpdateTPVItem, useAddTPVItem, useDeleteTPVItems, useBulkUpdateTPVStatus, useBulkInsertTPVItems } from "@/hooks/useTPVItems";
import { useTPVStatusOptions } from "@/hooks/useTPVStatusOptions";
import { ArrowLeft, Plus, Upload, Trash2, FileText } from "lucide-react";
import { ProjectDetailDialog } from "./ProjectDetailDialog";
import { useProjects } from "@/hooks/useProjects";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";
import { useColumnLabels } from "@/hooks/useColumnLabels";
import { useHeaderDrag } from "@/hooks/useHeaderDrag";
import { SortableHeader } from "./SortableHeader";
import { ColumnVisibilityToggle } from "./ColumnVisibilityToggle";
import { cn } from "@/lib/utils";
import { ExcelImportWizard } from "./ExcelImportWizard";
import { formatCurrency } from "@/lib/currency";
import { useExportContext } from "./ExportContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useProductionStatuses } from "@/hooks/useProductionStatuses";

const TPV_LIST_COLUMNS: { key: string; label: string; locked?: boolean; defaultHidden?: boolean }[] = [
  { key: "item_name", label: "Kód Prvku" },
  { key: "item_type", label: "Název Prvku" },
  { key: "nazev_prvku", label: "Popis" },
  { key: "konstrukter", label: "Konstruktér" },
  { key: "status", label: "Status" },
  { key: "vyroba_status", label: "Výroba" },
  { key: "sent_date", label: "Odesláno" },
  { key: "accepted_date", label: "Přijato" },
  { key: "notes", label: "Poznámka" },
  { key: "pocet", label: "Počet", defaultHidden: true },
  { key: "cena", label: "Cena", defaultHidden: true },
];

const TPV_LIST_LABEL_MAP = Object.fromEntries(TPV_LIST_COLUMNS.map(c => [c.key, c.label]));
const TPV_LIST_ALL_KEYS = TPV_LIST_COLUMNS.map(c => c.key);

function getTPVListColumnStyle(key: string, customWidth?: number | null): React.CSSProperties {
  if (customWidth) return { width: customWidth, minWidth: customWidth };
  switch (key) {
    case "sent_date":
    case "accepted_date":
      return { width: 100, minWidth: 100, maxWidth: 100 };
    case "item_name":
      return { minWidth: 100, maxWidth: 140 };
    case "item_type":
      return { minWidth: 180 };
    case "nazev_prvku":
      return { minWidth: 200 };
    case "notes":
      return { minWidth: 200 };
    case "status":
      return { minWidth: 140 };
    case "vyroba_status":
      return { minWidth: 140, maxWidth: 200 };
    case "konstrukter":
      return { minWidth: 124, maxWidth: 124, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as React.CSSProperties;
    case "pocet":
      return { width: 80, minWidth: 80, textAlign: "right" } as React.CSSProperties;
    case "cena":
      return { width: 120, minWidth: 120, textAlign: "right" } as React.CSSProperties;
    default:
      return { minWidth: 120 };
  }
}

interface Props {
  projectId: string;
  projectName: string;
  currency?: string;
  onBack: () => void;
  autoOpenImport?: boolean;
}

export function TPVList({ projectId, projectName, currency = "CZK", onBack, autoOpenImport }: Props) {
  const { canManageTPV, canEdit, canEditColumns } = useAuth();
  const { data: items = [], isLoading } = useTPVItems(projectId);
  const { data: statusOptions = [] } = useTPVStatusOptions();
  const TPV_STATUSES = statusOptions.map(o => o.label);
  const { data: allProjects = [] } = useProjects();
  const { statusMap: productionStatusMap } = useProductionStatuses(projectId);
  const [detailOpen, setDetailOpen] = useState(false);
  const currentProject = useMemo(() => allProjects.find(p => p.project_id === projectId), [allProjects, projectId]);

  const updateItem = useUpdateTPVItem();
  const addItem = useAddTPVItem();
  const deleteItems = useDeleteTPVItems();
  
  const bulkInsert = useBulkInsertTPVItems();
  const { columns: customColumns } = useAllCustomColumns("tpv_items");
  const updateCustomField = useUpdateCustomField();

  const {
    getLabel, getWidth, updateLabel, updateWidth,
    getOrderedKeys, getDisplayOrderedKeys, updateDisplayOrder,
    getVisibilityMap, updateVisibility,
  } = useColumnLabels("tpv-list");

  const visMap = useMemo(() => getVisibilityMap(), [getVisibilityMap]);
  const DEFAULT_HIDDEN_KEYS = useMemo(() => new Set(TPV_LIST_COLUMNS.filter(c => c.defaultHidden).map(c => c.key)), []);
  const isColVisible = useCallback((key: string) => {
    if (visMap[key] === undefined) return !DEFAULT_HIDDEN_KEYS.has(key);
    return visMap[key] !== false;
  }, [visMap, DEFAULT_HIDDEN_KEYS]);
  const toggleColVis = useCallback((key: string) => {
    updateVisibility(key, !isColVisible(key));
  }, [isColVisible, updateVisibility]);

  // Always use TPV_LIST_COLUMNS definition order as source of truth
  const allVisibleKeys = useMemo(() => {
    return TPV_LIST_ALL_KEYS.filter(k => isColVisible(k));
  }, [isColVisible]);

  const [editMode, setEditMode] = useState(false);
  const [localOrder, setLocalOrder] = useState<string[]>(allVisibleKeys);

  useEffect(() => {
    if (!editMode) setLocalOrder(allVisibleKeys);
  }, [allVisibleKeys, editMode]);

  const handleToggleEditMode = useCallback(async () => {
    if (editMode) {
      await updateDisplayOrder(localOrder);
    } else {
      setLocalOrder(allVisibleKeys);
    }
    setEditMode(!editMode);
  }, [editMode, localOrder, allVisibleKeys, updateDisplayOrder]);

  const handleCancelEditMode = useCallback(() => {
    setLocalOrder(allVisibleKeys);
    setEditMode(false);
  }, [allVisibleKeys]);

  const { dragKey, dropTarget, getDragProps } = useHeaderDrag(localOrder, setLocalOrder);

  const renderKeys = editMode ? localOrder : allVisibleKeys;

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
  const [wizardOpen, setWizardOpen] = useState(!!autoOpenImport);
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [addingInline, setAddingInline] = useState(false);
  const [inlineName, setInlineName] = useState("");
  const inlineRef = useRef<HTMLInputElement>(null);

  // ── Scroll sync refs for split header/body ───────────────────────
  const tpvHeaderScrollRef = useRef<HTMLDivElement>(null);
  const tpvBodyScrollRef = useRef<HTMLDivElement>(null);
  const handleTpvBodyScroll = useCallback(() => {
    if (tpvBodyScrollRef.current && tpvHeaderScrollRef.current) {
      tpvHeaderScrollRef.current.scrollLeft = tpvBodyScrollRef.current.scrollLeft;
    }
  }, []);

  const visibleColCount = renderKeys.length + 2; // +checkbox +actions

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

  const handleInlineAdd = () => {
    const name = inlineName.trim();
    if (!name) { setAddingInline(false); return; }
    addItem.mutate({ project_id: projectId, item_name: name });
    setInlineName("");
    setAddingInline(false);
  };

  useEffect(() => {
    if (addingInline && inlineRef.current) inlineRef.current.focus();
  }, [addingInline]);

  // ── Bulk-aware field save ────────────────────────────────────────
  const BULK_FIELDS = new Set(["status", "konstrukter", "sent_date", "accepted_date"]);

  const saveField = (itemId: string, field: string, value: string, oldValue: string) => {
    if (BULK_FIELDS.has(field) && selected.size > 1 && selected.has(itemId)) {
      for (const id of selected) {
        updateItem.mutate({ id, field, value, projectId });
      }
    } else {
      updateItem.mutate({ id: itemId, field, value, projectId, oldValue });
    }
  };

  // ── Header helpers ──────────────────────────────────────────────
  // Build list of all current column labels for duplicate detection
  const allCurrentLabels = useMemo(() => {
    return renderKeys.map(key => {
      const customCol = customColumns.find(c => c.column_key === key);
      return customCol ? customCol.label : getLabel(key, TPV_LIST_LABEL_MAP[key] || key);
    });
  }, [renderKeys, getLabel, customColumns]);

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
    existingLabels: allCurrentLabels,
    ...(editMode ? {
      dragProps: getDragProps(key),
      dropIndicator: dropTarget?.key === key ? dropTarget.side : null,
      isDragging: dragKey === key,
    } : {}),
  });
  const { registerExport } = useExportContext();

  const tpvExportMeta = useMemo(() => ({
    getter: (selectedKeys?: string[]) => {
      const visKeys = selectedKeys ?? renderKeys;
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
    defaultVisibleKeys: renderKeys,
  }), [renderKeys, sortedItems, getLabel]);

  useEffect(() => {
    registerExport("tpv-list", tpvExportMeta);
    return () => {
      registerExport("tpv-list", null as any);
    };
  }, [registerExport, tpvExportMeta]);

  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <>
        <MobileTPVCardList
          items={sortedItems}
          projectId={projectId}
          projectName={projectName}
          currency={currency}
          productionStatusMap={productionStatusMap}
          onBack={onBack}
          onOpenDetail={() => setDetailOpen(true)}
          onAddItem={(name) => addItem.mutate({ project_id: projectId, item_name: name })}
          onOpenImport={() => setWizardOpen(true)}
          canManageTPV={canManageTPV}
        />
        <ProjectDetailDialog
          project={currentProject ?? null}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
        <ExcelImportWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          projectId={projectId}
          projectName={projectName}
        />
      </>
    );
  }

  return (
    <div className="w-full min-w-0 h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Zpět
        </Button>
        <button
          onClick={() => setDetailOpen(true)}
          className="text-sm font-serif font-bold hover:underline cursor-pointer transition-colors"
          style={{ color: "#223937" }}
        >
          {projectId} — {projectName}
        </button>
        <button
          onClick={() => setDetailOpen(true)}
          className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Otevřít detail projektu"
        >
          <FileText className="h-3.5 w-3.5" />
        </button>
        <span className="text-muted-foreground/40 text-sm">|</span>
        {canManageTPV && (
          <Button size="sm" variant="outline" onClick={() => setWizardOpen(true)}>
            <Upload className="h-3 w-3 mr-1" /> Import z Excelu
          </Button>
        )}

        {selected.size > 0 && canManageTPV && (
          <div className="flex items-center gap-2 ml-4 border-l pl-4">
            <span className="text-sm text-muted-foreground">{selected.size} vybráno</span>
          </div>
        )}
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <div className="bg-accent/10 border border-accent/30 text-accent text-xs font-medium px-3 py-1.5 rounded-t-lg">
          Režim úpravy sloupců
        </div>
      )}

      <div className={cn("rounded-lg border bg-card flex flex-col flex-1 min-h-0", editMode && "rounded-t-none border-t-0")}>
        {/* FIXED HEADER — never scrolls */}
        <div ref={tpvHeaderScrollRef} className="flex-shrink-0 overflow-hidden rounded-t-lg">
          <Table>
            <TableHeader className="sticky-off">
              <TableRow className="bg-primary/5">
                <TableHead className="w-10">
                  <Checkbox checked={items.length > 0 && selected.size === items.length} onCheckedChange={toggleAll} />
                </TableHead>
                {renderKeys.map(key => (
                  <SortableHeader key={key} {...headerProps(key)} />
                ))}
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
                  onCancelEditMode={canEditColumns ? handleCancelEditMode : undefined}
                />
              </TableRow>
            </TableHeader>
          </Table>
        </div>

        {/* SCROLLABLE BODY */}
        <div ref={tpvBodyScrollRef} className="flex-1 overflow-auto always-scrollbar" onScroll={handleTpvBodyScroll}>
          <Table>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={visibleColCount} className="text-center text-muted-foreground">Načítání...</TableCell></TableRow>
              ) : sortedItems.length === 0 ? (
                <TableRow><TableCell colSpan={visibleColCount} className="text-center text-muted-foreground">Žádné položky</TableCell></TableRow>
              ) : sortedItems.map(item => (
                <TableRow key={item.id} className={`hover:bg-muted/50 transition-colors h-9 ${selected.has(item.id) ? "bg-primary/5" : ""}`}>
                  {canManageTPV && <TableCell><Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} /></TableCell>}
                  {!canManageTPV && <TableCell />}
                  {renderKeys.map(key => {
                    if (key === "item_name") return (
                      <TableCell key={key}>
                        <InlineEditableCell value={item.item_name || ""} onSave={(v) => saveField(item.id, "item_name", v, item.item_name || "")} className="font-mono text-xs" readOnly={!canManageTPV} />
                      </TableCell>
                    );
                    if (key === "item_type") return (
                      <TableCell key={key}>
                        <InlineEditableCell value={item.item_type || ""} onSave={(v) => saveField(item.id, "item_type", v, item.item_type || "")} className="font-semibold" readOnly={!canManageTPV} />
                      </TableCell>
                    );
                    if (key === "nazev_prvku") return (
                      <TableCell key={key}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="max-w-[300px] truncate">
                              <InlineEditableCell value={(item as any).nazev_prvku || ""} onSave={(v) => saveField(item.id, "nazev_prvku", v, (item as any).nazev_prvku || "")} readOnly={!canManageTPV} />
                            </div>
                          </TooltipTrigger>
                          {(item as any).nazev_prvku && (item as any).nazev_prvku.length > 40 && (
                            <TooltipContent className="max-w-[400px]">{(item as any).nazev_prvku}</TooltipContent>
                          )}
                        </Tooltip>
                      </TableCell>
                    );
                    if (key === "konstrukter") return (
                      <TableCell key={key}>
                        <InlineEditableCell value={item.konstrukter || ""} type="people" peopleRole="Konstruktér" onSave={(v) => saveField(item.id, "konstrukter", v, item.konstrukter || "")} readOnly={!canManageTPV} />
                      </TableCell>
                    );
                    if (key === "status") {
                      const statusOpt = statusOptions.find(o => o.label === item.status);
                      const statusColor = statusOpt?.color;
                      const statusDisplay = item.status && statusColor ? (
                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${statusColor}20`, color: statusColor, borderColor: `${statusColor}50` }}>
                          {item.status}
                        </span>
                      ) : undefined;
                      return <TableCell key={key}><InlineEditableCell value={item.status} type="select" options={TPV_STATUSES} displayValue={statusDisplay} onSave={(v) => saveField(item.id, "status", v, item.status || "")} readOnly={!canManageTPV} /></TableCell>;
                    }
                    if (key === "vyroba_status") {
                      const itemKey = item.item_name || item.item_type;
                      const statuses = productionStatusMap.get(itemKey);
                      if (!statuses || statuses.length === 0) {
                        return (
                          <TableCell key={key}>
                            <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: "#f0eee9", color: "#99a5a3", borderColor: "#e2ddd6" }}>
                              Neodesláno
                            </span>
                          </TableCell>
                        );
                      }
                      return (
                        <TableCell key={key}>
                          <div className="flex flex-wrap gap-0.5">
                            {statuses.map((s, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                                style={{
                                  backgroundColor: `${s.color}15`,
                                  color: s.color,
                                  borderColor: `${s.color}40`,
                                  textDecoration: s.label.startsWith("✕") ? "line-through" : undefined,
                                }}
                              >
                                {s.label}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                      );
                    }
                    // remaining columns: sent_date, accepted_date, notes, pocet, cena, custom fields
                    if (key === "sent_date") return <TableCell key={key}><InlineEditableCell value={item.sent_date || ""} type="date" onSave={(v) => saveField(item.id, "sent_date", v, item.sent_date || "")} readOnly={!canManageTPV} /></TableCell>;
                    if (key === "accepted_date") return <TableCell key={key}><InlineEditableCell value={item.accepted_date || ""} type="date" onSave={(v) => saveField(item.id, "accepted_date", v, item.accepted_date || "")} readOnly={!canManageTPV} /></TableCell>;
                    if (key === "notes") return <TableCell key={key}><InlineEditableCell value={item.notes || ""} type="textarea" onSave={(v) => saveField(item.id, "notes", v, item.notes || "")} readOnly={!canManageTPV} /></TableCell>;
                    if (key === "pocet") return <TableCell key={key}><InlineEditableCell value={String(item.pocet ?? "")} type="number" onSave={(v) => saveField(item.id, "pocet", v, String(item.pocet ?? ""))} readOnly={!canManageTPV} /></TableCell>;
                    if (key === "cena") return <TableCell key={key} className="text-right"><span className="text-xs font-mono">{formatCurrency(item.cena, currency)}</span></TableCell>;
                    // Custom columns
                    if (key.startsWith("custom_") && customColumns) {
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
                            onSave={(v) => updateCustomField.mutate({ tableName: "tpv_items", rowId: item.id, columnKey: key, value: v, oldValue: val })}
                            readOnly={!canManageTPV}
                          />
                        </TableCell>
                      );
                    }
                    return null;
                  })}
                  <TableCell>
                    {canManageTPV && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                        if (selected.size > 1 && selected.has(item.id)) {
                          setDeleteIds(Array.from(selected));
                        } else {
                          setDeleteIds([item.id]);
                        }
                      }}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {/* Inline add row */}
              {canManageTPV && (
                <TableRow className="h-9 hover:bg-muted/30">
                  <TableCell />
                  <TableCell colSpan={renderKeys.length + 2}>
                    {addingInline ? (
                      <div className="flex items-center gap-2">
                        <Plus className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <Input
                          ref={inlineRef}
                          value={inlineName}
                          onChange={e => setInlineName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") handleInlineAdd();
                            if (e.key === "Escape") { setAddingInline(false); setInlineName(""); }
                          }}
                          onBlur={handleInlineAdd}
                          placeholder="Název položky…"
                          className="h-7 text-sm border-0 shadow-none focus-visible:ring-0 px-0"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingInline(true)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Přidat položku
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

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
        description={deleteIds && deleteIds.length > 1 ? `Chystáte se smazat ${deleteIds.length} položek. Tato akce je nevratná.` : "Tato akce je nevratná."}
      />

      {/* Excel Import Wizard */}
      <ExcelImportWizard
        projectId={projectId}
        projectName={projectName}
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
      />

      {currentProject && (
        <ProjectDetailDialog
          project={currentProject}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          onOpenTPVList={() => {}}
          tpvItemCount={items.length}
        />
      )}
    </div>
  );
}
