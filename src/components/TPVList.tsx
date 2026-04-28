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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  useTPVItems,
  useUpdateTPVItem,
  useAddTPVItem,
  useDeleteTPVItems,
  useBulkUpdateTPVStatus,
  useBulkInsertTPVItems,
} from "@/hooks/useTPVItems";
import { useTPVStatusOptions } from "@/hooks/useTPVStatusOptions";
import { ArrowLeft, Plus, Upload, Trash2, FileText, Cog, Printer, AlertTriangle, Loader2 } from "lucide-react";
import { buildPruvodkaHtml } from "@/lib/exportPdf";
import { PdfPreviewModal } from "./PdfPreviewModal";
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

import { useProductionStatuses } from "@/hooks/useProductionStatuses";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activityLog";
import { TPVExtractor } from "./assistant/TPVExtractor";
import { useCNDiff } from "@/hooks/useCNDiff";
import { CNDiffDialog } from "./CNDiffDialog";
import { useProjectStages } from "@/hooks/useProjectStages";

const TPV_LIST_COLUMNS: { key: string; label: string; locked?: boolean; defaultHidden?: boolean }[] = [
  { key: "item_code", label: "Kód prvku" },
  { key: "nazev", label: "Název prvku" },
  { key: "popis", label: "Popis prvku" },
  { key: "konstrukter", label: "Konstruktér" },
  { key: "status", label: "Status" },
  { key: "vyroba_status", label: "Výroba" },
  { key: "stage_id", label: "Etapa", defaultHidden: true },
  { key: "sent_date", label: "Odesláno" },
  { key: "accepted_date", label: "Přijato" },
  { key: "notes", label: "Poznámka" },
  { key: "pocet", label: "Počet", defaultHidden: true },
  { key: "cena", label: "Cena", defaultHidden: true },
];

const TPV_LIST_LABEL_MAP = Object.fromEntries(TPV_LIST_COLUMNS.map((c) => [c.key, c.label]));
const TPV_LIST_ALL_KEYS = TPV_LIST_COLUMNS.map((c) => c.key);

function getTPVListColumnStyle(key: string, customWidth?: number | null): React.CSSProperties {
  if (customWidth) return { width: customWidth, minWidth: customWidth };
  switch (key) {
    case "sent_date":
    case "accepted_date":
      return { width: 100, minWidth: 100, maxWidth: 100 };
    case "item_code":
      return { minWidth: 100, maxWidth: 140 };
    case "nazev":
      return { minWidth: 180 };
    case "popis":
      return { minWidth: 200 };
    case "notes":
      return { minWidth: 200 };
    case "status":
      return { minWidth: 140 };
    case "vyroba_status":
      return { minWidth: 140, maxWidth: 200 };
    case "stage_id":
      return { minWidth: 140, maxWidth: 200 };
    case "konstrukter":
      return {
        minWidth: 124,
        maxWidth: 124,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      } as React.CSSProperties;
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
  const { canManageTPV, canEdit, canEditColumns, profile } = useAuth();
  const { data: items = [], isLoading } = useTPVItems(projectId);

  // DEBUG: log first item fields to diagnose blank columns issue
  useEffect(() => {
    if (items.length > 0) {
      const sample = items[0];
      console.log("[TPVList DEBUG] items count:", items.length, "first item keys:", Object.keys(sample));
      console.log("[TPVList DEBUG] sample item_code:", JSON.stringify(sample.item_code), "nazev:", JSON.stringify(sample.nazev), "popis:", JSON.stringify((sample as any).popis), "konstrukter:", JSON.stringify(sample.konstrukter));
    }
  }, [items]);
  const { data: statusOptions = [] } = useTPVStatusOptions();
  const TPV_STATUSES = statusOptions.map((o) => o.label);
  const { data: allProjects = [] } = useProjects();
  const { data: projectStages = [] } = useProjectStages(projectId);
  const { statusMap: productionStatusMap } = useProductionStatuses(projectId);
  const [detailOpen, setDetailOpen] = useState(false);
  const [extractorOpen, setExtractorOpen] = useState(false);
  const [cnDiffOpen, setCnDiffOpen] = useState(false);
  const currentProject = useMemo(() => allProjects.find((p) => p.project_id === projectId), [allProjects, projectId]);
  const queryClient = useQueryClient();

  // CN diff detection — triggered by file upload events only
  const { diff: cnDiff, isChecking: cnChecking, hasDifferences: cnHasDiff, checkCN, clearDiff: clearCNDiff } = useCNDiff(projectId, items);

  // Listen for CN file uploads from ProjectDetailDialog / MobileDetailProjektSheet
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.projectId === projectId) {
        // Delay to let SharePoint index the new file
        setTimeout(() => checkCN(), 2000);
      }
    };
    window.addEventListener("cn-file-uploaded", handler);
    return () => window.removeEventListener("cn-file-uploaded", handler);
  }, [projectId, checkCN]);

  const updateItem = useUpdateTPVItem();
  const addItem = useAddTPVItem();
  const deleteItems = useDeleteTPVItems();

  const bulkInsert = useBulkInsertTPVItems();
  const { columns: customColumns } = useAllCustomColumns("tpv_items");
  const updateCustomField = useUpdateCustomField();

  const {
    getLabel,
    getWidth,
    updateLabel,
    updateWidth,
    getOrderedKeys,
    getDisplayOrderedKeys,
    updateDisplayOrder,
    getVisibilityMap,
    updateVisibility,
  } = useColumnLabels("tpv-list");

  const visMap = useMemo(() => getVisibilityMap(), [getVisibilityMap]);
  const DEFAULT_HIDDEN_KEYS = useMemo(
    () => new Set(TPV_LIST_COLUMNS.filter((c) => c.defaultHidden).map((c) => c.key)),
    [],
  );
  const hasMultipleStages = projectStages.length >= 2;
  const isColVisible = useCallback(
    (key: string) => {
      // Etapa: auto-show only when project has 2+ stages (still respects explicit user toggle)
      if (key === "stage_id") {
        if (visMap[key] === undefined) return hasMultipleStages;
        return visMap[key] !== false;
      }
      if (visMap[key] === undefined) return !DEFAULT_HIDDEN_KEYS.has(key);
      return visMap[key] !== false;
    },
    [visMap, DEFAULT_HIDDEN_KEYS, hasMultipleStages],
  );
  const toggleColVis = useCallback(
    (key: string) => {
      updateVisibility(key, !isColVisible(key));
    },
    [isColVisible, updateVisibility],
  );

  // Use saved display_order from DB, falling back to definition order
  const allVisibleKeys = useMemo(() => {
    const visible = TPV_LIST_ALL_KEYS.filter((k) => isColVisible(k));
    return getDisplayOrderedKeys(visible);
  }, [isColVisible, getDisplayOrderedKeys]);

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
  const [sortCol, setSortCol] = useState<string | null>("item_code");
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>("asc");
  const toggleSort = (col: string) => {
    if (sortCol === col) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") {
        setSortCol(null);
        setSortDir(null);
      }
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

  // ── Send to production state ────────────────────────────────────
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [notReadyItems, setNotReadyItems] = useState<typeof items>([]);
  const [readyItems, setReadyItems] = useState<typeof items>([]);
  const [isSending, setIsSending] = useState(false);

  // ── Quantity change warning state ──────────────────────────────
  const [pocetWarning, setPocetWarning] = useState<{
    itemId: string;
    itemName: string;
    itemCode: string;
    oldPocet: number;
    newPocet: number;
  } | null>(null);

  // ── Průvodka state ─────────────────────────────────────────────
  const [pruvodkaWarning, setPruvodkaWarning] = useState<{ items: typeof items; allItems: typeof items } | null>(null);
  const [missingExpediceConfirm, setMissingExpediceConfirm] = useState<{ items: typeof items } | null>(null);
  const [pdfHtml, setPdfHtml] = useState<string | null>(null);

  const openPruvodka = useCallback((itemsToPrint: typeof items) => {
    const hasUnapproved = itemsToPrint.some(item => item.status !== "Schváleno");
    const rows = itemsToPrint.map((item, idx) => ({
      rowNum: idx + 1,
      kodPrvku: item.item_code || "",
      nazevPrvku: item.nazev || item.item_code || "",
      konstrukter: item.konstrukter || "",
      pocet: item.pocet ?? "",
      notes: item.notes || "",
      isApproved: item.status === "Schváleno",
    }));

    const html = buildPruvodkaHtml({
      projectId,
      projectName: projectName || projectId,
      issuedBy: profile?.full_name || profile?.email || "—",
      rows,
      hasUnapproved,
      expediceDate: (currentProject as any)?.expedice ?? null,
    });

    setPdfHtml(html);
    setPruvodkaWarning(null);
    setMissingExpediceConfirm(null);
  }, [projectId, projectName, profile, currentProject]);

  const handlePruvodka = useCallback(() => {
    const itemsToPrint = selected.size > 0
      ? sortedItems.filter(item => selected.has(item.id))
      : sortedItems.filter(item => item.status !== "Zrušeno");

    const unapproved = itemsToPrint.filter(item => item.status !== "Schváleno" && item.status !== "Zrušeno");
    const hasExpedice = !!(currentProject as any)?.expedice;

    if (unapproved.length > 0) {
      setPruvodkaWarning({ items: unapproved, allItems: itemsToPrint });
    } else if (!hasExpedice) {
      setMissingExpediceConfirm({ items: itemsToPrint });
    } else {
      openPruvodka(itemsToPrint);
    }
  }, [selected, sortedItems, openPruvodka, currentProject]);
  const handleSendToProduction = useCallback(() => {
    if (selected.size === 0) {
      toast({ title: "Vyberte alespoň jednu položku", variant: "destructive", duration: 2000 });
      return;
    }
    const selectedItems = items.filter((i) => selected.has(i.id));
    const ready = selectedItems.filter((i) => i.status === "Schváleno");
    const notReady = selectedItems.filter((i) => i.status !== "Schváleno");

    if (ready.length === 0) {
      toast({ title: 'Žádná vybraná položka nemá status "Schváleno"', variant: "destructive", duration: 4000 });
      return;
    }

    if (notReady.length > 0) {
      setReadyItems(ready);
      setNotReadyItems(notReady);
      setSendDialogOpen(true);
    } else {
      executeSendToProduction(ready);
    }
  }, [selected, items]);

  const executeSendToProduction = useCallback(
    async (itemsToSend: typeof items) => {
      setIsSending(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Nepřihlášený uživatel");

        // Fetch project cost parameters for correct hour estimation
        const [{ data: projectData }, { data: settingsData }, { data: presetsData }, { data: ratesData }] = await Promise.all([
          supabase
            .from("projects")
            .select("marze, cost_production_pct, cost_preset_id, currency")
            .eq("project_id", projectId)
            .single(),
          supabase.from("production_settings").select("hourly_rate").limit(1).single(),
          supabase.from("cost_breakdown_presets").select("id, is_default, production_pct").order("sort_order"),
          supabase.from("exchange_rates").select("year, eur_czk").order("year", { ascending: false }).limit(1),
        ]);

        const hourlyRate = Number(settingsData?.hourly_rate) || 550;
        const eurRate = ratesData?.[0] ? Number(ratesData[0].eur_czk) : 25.0;
        const isEur = projectData?.currency === "EUR";
        const presets = presetsData || [];
        const projectPreset = projectData?.cost_preset_id
          ? presets.find((p) => p.id === projectData.cost_preset_id)
          : presets.find((p) => p.is_default) || presets[0];

        // Margin: normalize (detect 0.25 vs 25)
        const rawMarze = Number(projectData?.marze) || 0;
        const marze = rawMarze === 0 ? 0.15 : rawMarze > 1 ? rawMarze / 100 : rawMarze;

        // Production percentage from project override or preset
        const prodPct =
          (projectData?.cost_production_pct != null
            ? Number(projectData.cost_production_pct)
            : (projectPreset?.production_pct ?? 35)) / 100;

        let sentCount = 0;
        const skipped: string[] = [];
        const missingPrice: string[] = [];

        // Pre-validation: bez ceny nelze odeslat (nelze dopočítat hodiny na výrobu)
        const itemsWithPrice = itemsToSend.filter((item) => {
          const cena = Number(item.cena) || 0;
          if (cena <= 0) {
            missingPrice.push(item.item_code);
            return false;
          }
          return true;
        });

        if (missingPrice.length > 0) {
          toast({
            title: "Chybí cena položky",
            description: `Před odesláním do výroby je potřeba doplnit cenu u: ${missingPrice.join(", ")}`,
            variant: "destructive",
            duration: 6000,
          });
        }

        if (itemsWithPrice.length === 0) {
          setIsSending(false);
          setSendDialogOpen(false);
          return;
        }

        for (const item of itemsWithPrice) {
          const itemCode = item.item_code;

          // Check if already planned in schedule, or already waiting in inbox.
          // A stale inbox row with status "scheduled" but no schedule row is revived below instead of blocking re-send.
          const [inboxCheck, schedCheck] = await Promise.all([
            supabase
              .from("production_inbox")
              .select("id, status")
              .eq("project_id", projectId)
              .eq("item_code", itemCode)
              .not("status", "in", "(cancelled,returned)")
              .limit(1),
            supabase
              .from("production_schedule")
              .select("id")
              .eq("project_id", projectId)
              .eq("item_code", itemCode)
              .in("status", ["scheduled", "in_progress", "completed", "expedice", "paused"])
              .limit(1),
          ]);

          const activeInboxRow = inboxCheck.data?.[0] as { id: string; status: string } | undefined;
          const isAlreadyScheduled = !!schedCheck.data?.length;
          const isAlreadyPending = activeInboxRow?.status === "pending";

          if (isAlreadyScheduled || isAlreadyPending) {
            skipped.push(itemCode);
            continue;
          }

          // Wipe any prior cancelled/returned rows for this TPV item — guarantees one current production state.
          await supabase
            .from("production_inbox")
            .delete()
            .eq("project_id", projectId)
            .eq("item_code", itemCode)
            .in("status", ["cancelled", "returned"]);
          await supabase
            .from("production_schedule")
            .delete()
            .eq("project_id", projectId)
            .eq("item_code", itemCode)
            .in("status", ["cancelled", "returned"]);

          // Hours = (selling price × (1 - margin) × production%) / hourly rate
          const itemCena = (item.cena || 0) * (Number(item.pocet) || 1);
          const itemCenaConverted = isEur ? itemCena * eurRate : itemCena;
          const estimatedHours =
            itemCenaConverted > 0 ? Math.round((itemCenaConverted * (1 - marze) * prodPct) / hourlyRate) : 0;

          const inboxPayload = {
            project_id: projectId,
            stage_id: (item as any).stage_id || null,
            item_name: item.nazev || item.item_code,
            item_code: item.item_code,
            estimated_hours: estimatedHours,
            estimated_czk: itemCenaConverted,
            status: "pending",
            sent_by: user.id,
          } as any;

          const { error } = activeInboxRow?.status === "scheduled"
            ? await supabase.from("production_inbox").update(inboxPayload).eq("id", activeInboxRow.id)
            : await supabase.from("production_inbox").insert(inboxPayload);

          if (error) {
            console.error("Inbox upsert error:", error);
            continue;
          }

          // Production status is derived from production_inbox/schedule lookup — no direct tpv_items update needed

          // Log activity
          logActivity({
            projectId,
            actionType: "item_scheduled",
            newValue: item.item_code,
            detail: "Odesláno do výroby z TPV",
          });

          sentCount++;
        }

        // Show skipped warnings
        for (const code of skipped) {
          toast({ title: `${code} již je v Inboxu výroby`, duration: 4000 });
        }

        if (sentCount > 0) {
          toast({ title: `${sentCount} položek odesláno do výroby`, duration: 2000 });
        }

        // Invalidate queries
        await queryClient.invalidateQueries({ queryKey: ["production-statuses", projectId] });
        await queryClient.invalidateQueries({ queryKey: ["production_inbox"] });
        await queryClient.invalidateQueries({ queryKey: ["production-inbox"] });
        await queryClient.invalidateQueries({ queryKey: ["tpv_items"] });

        setSelected(new Set());
        setSendDialogOpen(false);
      } catch (err: any) {
        toast({ title: "Chyba", description: err.message, variant: "destructive" });
      } finally {
        setIsSending(false);
      }
    },
    [projectId, queryClient],
  );

  const tpvBodyScrollRef = useRef<HTMLDivElement>(null);

  const visibleColCount = renderKeys.length + 2; // +checkbox +actions

  const lastClickedRef = useRef<string | null>(null);

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (e?.shiftKey && lastClickedRef.current) {
        const ids = sortedItems.map((i) => i.id);
        const startIdx = ids.indexOf(lastClickedRef.current);
        const endIdx = ids.indexOf(id);
        if (startIdx !== -1 && endIdx !== -1) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
          for (let i = from; i <= to; i++) next.add(ids[i]);
        }
      } else {
        next.has(id) ? next.delete(id) : next.add(id);
      }
      return next;
    });
    lastClickedRef.current = id;
  };

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  const handleInlineAdd = () => {
    const name = inlineName.trim();
    if (!name) {
      setAddingInline(false);
      return;
    }
    addItem.mutate({ project_id: projectId, item_code: name });
    setInlineName("");
    setAddingInline(false);
  };

  useEffect(() => {
    if (addingInline && inlineRef.current) inlineRef.current.focus();
  }, [addingInline]);

  // ── Bulk-aware field save ────────────────────────────────────────
  const BULK_FIELDS = new Set(["status", "konstrukter", "sent_date", "accepted_date", "stage_id"]);

  const saveField = async (itemId: string, field: string, value: any, oldValue: string) => {
    // Handle cena empty → save null
    if (field === "cena" && value.trim() === "") {
      updateItem.mutate({ id: itemId, field: "cena", value: null as any, projectId, oldValue });
      return;
    }

    // Intercept pocet changes — check if item is in production
    if (field === "pocet" && value !== oldValue) {
      const newPocet = Number(value) || 0;
      const oldPocetNum = Number(oldValue) || 0;

      // Empty or zero — save directly without production warning
      if (value.trim() === "" || newPocet === 0) {
        updateItem.mutate({ id: itemId, field: "pocet", value: null as any, projectId, oldValue });
        return;
      }

      if (newPocet !== oldPocetNum) {
        // Check if this item exists in production_inbox or production_schedule
        const item = items.find((i) => i.id === itemId);
        const itemCode = item?.item_code || "";
        const itemName = item?.nazev || item?.item_code || "";

        const { data: inboxHits } = await supabase
          .from("production_inbox")
          .select("id")
          .eq("project_id", projectId)
          .eq("item_code", itemCode)
          .in("status", ["pending", "scheduled"])
          .limit(1);

        const { data: scheduleHits } = await supabase
          .from("production_schedule")
          .select("id")
          .eq("project_id", projectId)
          .eq("item_code", itemCode)
          .in("status", ["scheduled", "in_progress"])
          .limit(1);

        if ((inboxHits && inboxHits.length > 0) || (scheduleHits && scheduleHits.length > 0)) {
          setPocetWarning({ itemId, itemName: `${itemCode} ${itemName}`, itemCode, oldPocet: oldPocetNum, newPocet });
          return; // Don't save yet — wait for dialog confirmation
        }
      }
    }

    if (BULK_FIELDS.has(field) && selected.size > 1 && selected.has(itemId)) {
      for (const id of selected) {
        updateItem.mutate({ id, field, value, projectId });
      }
    } else {
      updateItem.mutate({ id: itemId, field, value, projectId, oldValue });
    }
  };

  const confirmPocetChange = async () => {
    if (!pocetWarning) return;
    const { itemId, itemCode, itemName, oldPocet, newPocet } = pocetWarning;
    const item = items.find((i) => i.id === itemId);
    const itemKey = item?.item_code || "";

    // 1. Save the new pocet to tpv_items
    updateItem.mutate({ id: itemId, field: "pocet", value: String(newPocet), projectId, oldValue: String(oldPocet) });

    // 2. Update production_inbox
    const { data: inboxRows } = await supabase
      .from("production_inbox")
      .select("id, estimated_hours")
      .eq("project_id", projectId)
      .eq("item_code", itemKey)
      .in("status", ["pending", "scheduled"]);

    if (inboxRows && inboxRows.length > 0) {
      for (const row of inboxRows) {
        const newHours = Math.round(Number(row.estimated_hours) * (newPocet / oldPocet));
        await supabase
          .from("production_inbox")
          .update({ estimated_hours: newHours } as any)
          .eq("id", row.id);
      }
    }

    // 3. Update production_schedule
    const { data: scheduleRows } = await supabase
      .from("production_schedule")
      .select("id, scheduled_hours")
      .eq("project_id", projectId)
      .eq("item_code", itemKey)
      .in("status", ["scheduled", "in_progress"]);

    if (scheduleRows && scheduleRows.length > 0) {
      for (const row of scheduleRows) {
        const newHours = Math.round(Number(row.scheduled_hours) * (newPocet / oldPocet));
        await supabase
          .from("production_schedule")
          .update({ scheduled_hours: newHours } as any)
          .eq("id", row.id);
      }
    }

    // 4. Log activity
    try {
      await logActivity({
        projectId,
        actionType: "item_scheduled",
        detail: `Počet upraven z ${oldPocet} na ${newPocet} ks (${itemName})`,
      });
    } catch {
      /* ignore logging errors */
    }

    // 5. Toast + invalidate
    toast({ title: "Počet aktualizován — výrobní plán byl upraven" });
    queryClient.invalidateQueries({ queryKey: ["production-inbox"] });
    queryClient.invalidateQueries({ queryKey: ["production-schedule"] });
    queryClient.invalidateQueries({ queryKey: ["tpv-items"] });

    setPocetWarning(null);
  };
  // Build list of all current column labels for duplicate detection
  const allCurrentLabels = useMemo(() => {
    return renderKeys.map((key) => {
      const customCol = customColumns.find((c) => c.column_key === key);
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
    ...(editMode
      ? {
          dragProps: getDragProps(key),
          dropIndicator: dropTarget?.key === key ? dropTarget.side : null,
          isDragging: dragKey === key,
        }
      : {}),
  });
  const { registerExport } = useExportContext();

  const tpvExportMeta = useMemo(
    () => ({
      getter: (selectedKeys?: string[]) => {
        const visKeys = selectedKeys ?? renderKeys;
        const headers = visKeys.map((k) => getLabel(k, TPV_LIST_LABEL_MAP[k] || k));
        const rows = sortedItems.map((item) =>
          visKeys.map((k) => {
            if (k === "vyroba_status") {
              const itemKey = (item as any).item_code || (item as any).nazev;
              const statuses = productionStatusMap.get(itemKey);
              if (!statuses || statuses.length === 0) return "Neodesláno";
              return statuses.map((s: any) => s.label).join(", ");
            }
            if (k === "stage_id") {
              const sid = (item as any).stage_id;
              if (!sid) return "";
              const st = projectStages.find((s) => s.id === sid);
              return st ? (st.display_name || st.stage_name) : "";
            }
            if (k === "cena") return (item as any).cena != null ? Number((item as any).cena) : "";
            if (k.startsWith("custom_")) {
              const cf = (item as any).custom_fields || {};
              return cf[k] ?? "";
            }
            const val = (item as any)[k];
            return val == null ? "" : String(val);
          }),
        );
        return { headers, rows };
      },
      groups: [
        { label: "TPV List", keys: renderKeys, getLabel: (k: string) => getLabel(k, TPV_LIST_LABEL_MAP[k] || k) },
      ],
      defaultVisibleKeys: renderKeys,
    }),
    [renderKeys, sortedItems, getLabel, productionStatusMap, projectStages],
  );

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
          stages={projectStages}
          onBack={onBack}
          onOpenDetail={() => setDetailOpen(true)}
          onAddItem={(name) => addItem.mutate({ project_id: projectId, item_code: name })}
          onOpenImport={() => setWizardOpen(true)}
          canManageTPV={canManageTPV}
        />
        <ProjectDetailDialog project={currentProject ?? null} open={detailOpen} onOpenChange={setDetailOpen} />
        <ExcelImportWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          projectId={projectId}
          projectName={projectName}
        />
      </>
    );
  }

  const renderColGroup = () => (
    <colgroup>
      <col style={{ width: 40, minWidth: 40 }} />
      {renderKeys.map((key) => {
        const s = getTPVListColumnStyle(key, getWidth(key));
        const w = s.width || s.minWidth || 120;
        return <col key={key} style={{ width: w, minWidth: w }} />;
      })}
      <col style={{ width: 40, minWidth: 40 }} />
    </colgroup>
  );

  return (
    <div className="w-full min-w-0 h-full min-h-0 overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap mb-4 shrink-0">
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
        {cnChecking && (
          <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
        )}
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
        {canManageTPV && (
          <Button size="sm" variant="outline" onClick={() => setExtractorOpen(true)}>
            <FileText className="h-3 w-3 mr-1" /> Načíst z CN
          </Button>
        )}
        {canManageTPV && (
          <Button size="sm" variant="outline" onClick={handleSendToProduction} disabled={isSending}>
            <Cog className="h-3 w-3 mr-1" /> Odeslat do výroby
          </Button>
        )}
        <button
          onClick={handlePruvodka}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm border border-border hover:bg-accent hover:text-accent-foreground hover:border-accent transition-colors"
          title="Tisk průvodky do výroby"
        >
          <Printer className="h-4 w-4" />
          <span className="hidden sm:inline">Průvodka</span>
        </button>
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

      {/* CN diff warning banner */}
      {cnDiff && cnDiff.entries.length > 0 && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 text-orange-800 text-sm px-4 py-2.5 rounded-lg mb-2">
          <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />
          <span className="flex-1">
            Cenová nabídka byla změněna — nalezeno <strong>{cnDiff.entries.length}</strong> rozdílů oproti TPV seznamu
          </span>
          <Button size="sm" variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-100" onClick={() => setCnDiffOpen(true)}>
            Zobrazit změny
          </Button>
          <Button size="sm" variant="ghost" className="text-orange-600 hover:bg-orange-100" onClick={clearCNDiff}>
            Ignorovat
          </Button>
        </div>
      )}

      <div
        className={cn(
          "rounded-lg border bg-card flex flex-col flex-1 min-h-0 overflow-hidden",
          editMode && "rounded-t-none border-t-0",
        )}
      >
        {/* SINGLE scrollable container with sticky header */}
        <div ref={tpvBodyScrollRef} className="flex-1 min-h-0 overflow-auto always-scrollbar rounded-t-lg">
          <Table style={{ tableLayout: "fixed" }}>
            {renderColGroup()}
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="bg-primary/5">
                <TableHead className="w-10">
                  <Checkbox checked={items.length > 0 && selected.size === items.length} onCheckedChange={toggleAll} />
                </TableHead>
                {renderKeys.map((key) => (
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
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={visibleColCount} className="text-center text-muted-foreground">
                    Načítání...
                  </TableCell>
                </TableRow>
              ) : sortedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColCount} className="text-center text-muted-foreground">
                    Žádné položky
                  </TableCell>
                </TableRow>
              ) : (
                sortedItems.map((item) => (
                  <TableRow
                    key={item.id}
                    className={`hover:bg-muted/50 transition-colors h-9 ${selected.has(item.id) ? "bg-primary/5" : ""}`}
                  >
                    <TableCell>
                      {canManageTPV && (
                        <Checkbox checked={selected.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} onClick={(e: React.MouseEvent) => { if (e.shiftKey) { e.preventDefault(); toggleSelect(item.id, e); } }} />
                      )}
                    </TableCell>
                    {renderKeys.map((key) => {
                      const cellStyle = getTPVListColumnStyle(key, getWidth(key));
                      if (key === "item_code")
                        return (
                          <TableCell key={key} style={cellStyle}>
                            <InlineEditableCell
                              value={item.item_code || ""}
                              onSave={(v) => saveField(item.id, "item_code", v, item.item_code || "")}
                              className="font-sans text-xs font-bold"
                              readOnly={!canManageTPV}
                            />
                          </TableCell>
                        );
                      if (key === "nazev")
                        return (
                          <TableCell key={key} style={cellStyle}>
                            <InlineEditableCell
                              value={item.nazev || ""}
                              onSave={(v) => saveField(item.id, "nazev", v, item.nazev || "")}
                              className="font-semibold"
                              readOnly={!canManageTPV}
                            />
                          </TableCell>
                        );
                      if (key === "popis")
                        return (
                          <TableCell key={key} style={cellStyle}>
                            <InlineEditableCell
                              value={(item as any).popis || ""}
                              type="textarea"
                              onSave={(v) =>
                                saveField(item.id, "popis", v, (item as any).popis || "")
                              }
                              readOnly={!canManageTPV}
                            />
                          </TableCell>
                        );
                      if (key === "konstrukter")
                        return (
                          <TableCell key={key} style={cellStyle}>
                            <InlineEditableCell
                              value={item.konstrukter || ""}
                              type="people"
                              peopleRole="Konstruktér"
                              onSave={(v) => saveField(item.id, "konstrukter", v, item.konstrukter || "")}
                              readOnly={!canManageTPV}
                            />
                          </TableCell>
                        );
                      if (key === "status") {
                        const statusOpt = statusOptions.find((o) => o.label === item.status);
                        const statusColor = statusOpt?.color;
                        const statusDisplay =
                          item.status && statusColor ? (
                            <span
                              className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                              style={{
                                backgroundColor: `${statusColor}20`,
                                color: statusColor,
                                borderColor: `${statusColor}50`,
                              }}
                            >
                              {item.status}
                            </span>
                          ) : undefined;
                        return (
                          <TableCell key={key} style={cellStyle}>
                            <InlineEditableCell
                              value={item.status}
                              type="select"
                              options={TPV_STATUSES}
                              displayValue={statusDisplay}
                              onSave={(v) => saveField(item.id, "status", v, item.status || "")}
                              readOnly={!canManageTPV}
                            />
                          </TableCell>
                        );
                      }
                      if (key === "vyroba_status") {
                        const itemKey = item.item_code || item.nazev;
                        const statuses = productionStatusMap.get(itemKey);
                        if (!statuses || statuses.length === 0) {
                          return (
                            <TableCell key={key} style={cellStyle}>
                              <span
                                className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                                style={{ backgroundColor: "#f0eee9", color: "#99a5a3", borderColor: "#e2ddd6" }}
                              >
                                Neodesláno
                              </span>
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell key={key} style={cellStyle}>
                            <div className="flex flex-wrap gap-0.5">
                              {statuses.map((s, idx) => {
                                const isCancelled = s.label.startsWith("✕");
                                const badge = (
                                  <span
                                    className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                                    style={{
                                      backgroundColor: `${s.color}15`,
                                      color: s.color,
                                      borderColor: `${s.color}40`,
                                      textDecoration: isCancelled ? "line-through" : undefined,
                                    }}
                                  >
                                    {s.label}
                                  </span>
                                );
                                if (s.tooltip) {
                                  return (
                                    <Tooltip key={idx}>
                                      <TooltipTrigger asChild>{badge}</TooltipTrigger>
                                      <TooltipContent side="top">{s.tooltip}</TooltipContent>
                                    </Tooltip>
                                  );
                                }
                                return <span key={idx}>{badge}</span>;
                              })}
                            </div>
                          </TableCell>
                        );
                      }
                      if (key === "stage_id") {
                        const sid = (item as any).stage_id || "";
                        const stageOptions = projectStages.map((s) => s.display_name || s.stage_name);
                        const idByLabel = new Map(projectStages.map((s) => [s.display_name || s.stage_name, s.id]));
                        const labelById = new Map(projectStages.map((s) => [s.id, s.display_name || s.stage_name]));
                        const currentLabel = sid ? (labelById.get(sid) || "") : "";
                        return (
                          <TableCell key={key} style={cellStyle}>
                            <InlineEditableCell
                              value={currentLabel}
                              type="select"
                              options={stageOptions}
                              onSave={(v) => {
                                const newId = v ? (idByLabel.get(v) || null) : null;
                                saveField(item.id, "stage_id", newId, sid);
                              }}
                              readOnly={!canManageTPV || projectStages.length === 0}
                            />
                          </TableCell>
                        );
                      }
                      // remaining columns: sent_date, accepted_date, notes, pocet, cena, custom fields
                      if (key === "sent_date")
                        return (
                          <TableCell key={key} style={cellStyle}>
                            <InlineEditableCell
                              value={item.sent_date || ""}
                              type="date"
                              onSave={(v) => saveField(item.id, "sent_date", v, item.sent_date || "")}
                              readOnly={!canManageTPV}
                            />
                          </TableCell>
                        );
                      if (key === "accepted_date")
                        return (
                          <TableCell key={key} style={cellStyle}>
                            <InlineEditableCell
                              value={item.accepted_date || ""}
                              type="date"
                              onSave={(v) => saveField(item.id, "accepted_date", v, item.accepted_date || "")}
                              readOnly={!canManageTPV}
                            />
                          </TableCell>
                        );
                      if (key === "notes")
                        return (
                          <TableCell key={key} style={cellStyle}>
                            <InlineEditableCell
                              value={item.notes || ""}
                              type="textarea"
                              onSave={(v) => saveField(item.id, "notes", v, item.notes || "")}
                              readOnly={!canManageTPV}
                            />
                          </TableCell>
                        );
                      if (key === "pocet")
                        return (
                          <TableCell key={key} style={cellStyle}>
                            <InlineEditableCell
                              value={String(item.pocet ?? "")}
                              type="number"
                              onSave={(v) => saveField(item.id, "pocet", v, String(item.pocet ?? ""))}
                              readOnly={!canManageTPV}
                            />
                          </TableCell>
                        );
                      if (key === "cena") {
                        const formatted = formatCurrency(item.cena != null ? Number(item.cena) : null, currency);
                        return (
                          <TableCell key={key} style={cellStyle} className="text-right font-sans text-xs">
                            <InlineEditableCell
                              value={String(item.cena ?? "")}
                              type="number"
                              displayValue={formatted}
                              onSave={(v) => saveField(item.id, "cena", v, String(item.cena ?? ""))}
                              readOnly={!canManageTPV}
                            />
                          </TableCell>
                        );
                      }
                      // Custom columns
                      if (key.startsWith("custom_") && customColumns) {
                        const def = customColumns.find((c) => c.column_key === key);
                        if (!def) return null;
                        const customFields = (item as any).custom_fields || {};
                        const val = customFields[key] || "";
                        const cellType =
                          def.data_type === "date"
                            ? "date"
                            : def.data_type === "number"
                              ? "number"
                              : def.data_type === "select"
                                ? "select"
                                : def.data_type === "people"
                                  ? "people"
                                  : undefined;
                        return (
                          <TableCell key={key}>
                            <InlineEditableCell
                              value={val}
                              type={cellType as any}
                              options={def.data_type === "select" ? def.select_options : undefined}
                              peopleRole={
                                def.data_type === "people" ? (def.people_role as any) || undefined : undefined
                              }
                              onSave={(v) =>
                                updateCustomField.mutate({
                                  tableName: "tpv_items",
                                  rowId: item.id,
                                  columnKey: key,
                                  value: v,
                                  oldValue: val,
                                })
                              }
                              readOnly={!canManageTPV}
                            />
                          </TableCell>
                        );
                      }
                      return null;
                    })}
                    <TableCell>
                      {canManageTPV && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            if (selected.size > 1 && selected.has(item.id)) {
                              setDeleteIds(Array.from(selected));
                            } else {
                              setDeleteIds([item.id]);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
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
                          onChange={(e) => setInlineName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleInlineAdd();
                            if (e.key === "Escape") {
                              setAddingInline(false);
                              setInlineName("");
                            }
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
            setSelected((prev) => {
              const next = new Set(prev);
              deleteIds.forEach((id) => next.delete(id));
              return next;
            });
            setDeleteIds(null);
          }
        }}
        onCancel={() => setDeleteIds(null)}
        description={
          deleteIds && deleteIds.length > 1
            ? `Chystáte se smazat ${deleteIds.length} položek. Tato akce je nevratná.`
            : "Tato akce je nevratná."
        }
      />

      {/* Send to Production Warning Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Některé položky nejsou připraveny</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-[300px] overflow-auto">
            {notReadyItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded bg-destructive/5">
                <span className="font-sans text-xs font-semibold">{item.item_code}</span>
                <span className="text-muted-foreground truncate flex-1">{item.nazev || ""}</span>
                <span className="text-xs text-destructive font-medium shrink-0">{item.status || "Bez statusu"}</span>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSendDialogOpen(false)}>
              Zrušit
            </Button>
            <Button size="sm" onClick={() => executeSendToProduction(readyItems)} disabled={isSending}>
              {isSending ? "Odesílám..." : `Odeslat jen schválené (${readyItems.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quantity Change Warning Dialog */}
      <Dialog
        open={!!pocetWarning}
        onOpenChange={(open) => {
          if (!open) setPocetWarning(null);
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Položka je již v plánu výroby</DialogTitle>
          </DialogHeader>
          {pocetWarning && (
            <p className="text-sm text-muted-foreground py-2">
              Tato položka ({pocetWarning.itemName}) je aktuálně v plánu výroby s počtem{" "}
              <strong>{pocetWarning.oldPocet} ks</strong>. Změna na <strong>{pocetWarning.newPocet} ks</strong> vyžaduje
              aktualizaci výrobního plánu.
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPocetWarning(null)}>
              Zrušit změnu
            </Button>
            <Button size="sm" onClick={confirmPocetChange}>
              Uložit a aktualizovat výrobu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Průvodka Warning Dialog */}
      <Dialog open={!!pruvodkaWarning} onOpenChange={(open) => { if (!open) setPruvodkaWarning(null); }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>⚠ Prvky nejsou schváleny</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-muted-foreground">
              Následující prvky nejsou ve stavu Schváleno. Hrozí riziko změny ze strany klienta:
            </p>
            <div className="max-h-[240px] overflow-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kód prvku</TableHead>
                    <TableHead>Název prvku</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pruvodkaWarning?.items.map((item) => (
                    <TableRow key={item.id} className="bg-amber-50/50">
                      <TableCell className="font-semibold text-xs">{item.item_code}</TableCell>
                      <TableCell className="text-xs">{item.nazev || ""}</TableCell>
                      <TableCell className="text-xs text-amber-600 font-medium">{item.status || "Bez statusu"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              Průvodka bude vytisknuta i pro tyto prvky. Doporučujeme před tiskem získat schválení.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPruvodkaWarning(null)}>
              Zrušit
            </Button>
            <Button size="sm" onClick={() => pruvodkaWarning && openPruvodka(pruvodkaWarning.allItems)}>
              Přesto tisknout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Průvodka PDF Preview */}
      {pdfHtml && (
        <PdfPreviewModal
          html={pdfHtml}
          tabLabel="Průvodka"
          onClose={() => setPdfHtml(null)}
          portrait
        />
      )}

      <TPVExtractor
        projectId={projectId}
        existingItems={items || []}
        open={extractorOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["tpv_items", projectId] });
          // Auto-trigger CN diff check in background after extraction
          setTimeout(() => checkCN(), 1500);
        }}
        onClose={() => setExtractorOpen(false)}
      />

      {/* CN Diff Dialog */}
      {cnDiff && (
        <CNDiffDialog
          open={cnDiffOpen}
          onClose={() => setCnDiffOpen(false)}
          onApplied={() => {
            setCnDiffOpen(false);
            clearCNDiff();
          }}
          diff={cnDiff}
          projectId={projectId}
          currency={currency}
        />
      )}
    </div>
  );
}
