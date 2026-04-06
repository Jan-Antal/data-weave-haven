import { useState, useCallback, useEffect, useRef, useMemo, Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Upload, Trash2, Plus, Loader2, FileText, CheckCircle2, Search, AlertCircle, Eye, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { DocumentPreviewModal } from "@/components/DocumentPreviewModal";
import { useSharePointDocs } from "@/hooks/useSharePointDocs";
import type { TPVItem } from "@/hooks/useTPVItems";


interface ExtractedItem {
  kod_prvku: string;
  nazev: string;
  popis: string;
  cena: number;
  pocet: number;
  /** Set after diff against existing items */
  _diffStatus?: "new" | "changed" | "unchanged";
  /** DB id if matched to existing item */
  _dbId?: string;
  /** Original DB values for changed fields */
  _dbValues?: Partial<Record<string, string | number>>;
}

interface SPMatch {
  itemId: string;
  name: string;
  size: number;
}

type Phase = "confirm" | "searching" | "found" | "multiple" | "not-found" | "extracting" | "done" | "error" | "pick-or-upload";

interface TPVExtractorProps {
  projectId: string;
  existingItems?: TPVItem[];
  onSuccess: () => void;
  onClose: () => void;
  open: boolean;
}

// ─── Appliance post-filter (safety net) ───────────────────────────────────────
const APPLIANCE_RE = /^(vestavná?\s+)?(chladni[čc]ka|lednice|myčka|my[čc]ka\s+n[áa]dob[ií]|trouba|varná\s+deska|digestoř|pra[čc]ka|su[šs]i[čc]ka|mikrovlnka|spor[áa]k|vinotéka|mraz[áa]k)\s*$/i;

function isApplianceOnly(item: { nazev: string; popis: string }): boolean {
  return APPLIANCE_RE.test(item.nazev.trim());
}

// ─── Module-level extraction cache (15 min TTL) ──────────────────────────────
const CACHE_TTL_MS = 15 * 60 * 1000;

interface ExtractionCacheEntry {
  items: ExtractedItem[];
  fileName: string;
  sourceDoc: { itemId?: string; fileName: string; blobUrl?: string };
  timestamp: number;
}

const extractionCache = new Map<string, ExtractionCacheEntry>();

function getCachedExtraction(projectId: string): ExtractionCacheEntry | null {
  const entry = extractionCache.get(projectId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    extractionCache.delete(projectId);
    return null;
  }
  return entry;
}

// ─── Error Boundary for DocumentPreviewModal ─────────────────────────────────
class PreviewErrorBoundary extends Component<
  { children: ReactNode; onError?: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Preview iframe error caught:", error, info);
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/60">
          <div className="bg-background rounded-lg p-6 shadow-xl text-center space-y-3 max-w-sm">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm">Náhled dokumentu selhal.</p>
            <Button size="sm" variant="outline" onClick={() => this.setState({ hasError: false })}>
              Zavřít
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function TPVExtractor({ projectId, existingItems = [], onSuccess, onClose, open }: TPVExtractorProps) {
  const [phase, setPhase] = useState<Phase>("searching");
  const [matches, setMatches] = useState<SPMatch[]>([]);
  const [allSpFiles, setAllSpFiles] = useState<SPMatch[]>([]);
  const [foundFileName, setFoundFileName] = useState("");
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [spUploaded, setSpUploaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const autoExtractTriggered = useRef(false);

  const [manualFile, setManualFile] = useState<File | null>(null);
  const [manualLoading, setManualLoading] = useState(false);

  const [sourceDoc, setSourceDoc] = useState<{ itemId?: string; fileName: string; blobUrl?: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{ previewUrl: string | null; webUrl: string | null; downloadUrl: string | null }>({ previewUrl: null, webUrl: null, downloadUrl: null });

  // ─── Multi-select state ─────────────────────────────────────────────
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [lastClickedIdx, setLastClickedIdx] = useState<number | null>(null);

  const sp = useSharePointDocs(projectId);

  const hasExisting = existingItems.filter(i => !i.deleted_at).length > 0;

  // Build lookup of existing items by item_code
  const existingByCode = useMemo(() => {
    const map = new Map<string, TPVItem>();
    for (const item of existingItems) {
      if (item.item_code && !item.deleted_at) {
        map.set(item.item_code, item);
      }
    }
    return map;
  }, [existingItems]);

  // Apply diff statuses to extracted items
  const applyDiff = useCallback((extracted: ExtractedItem[]): ExtractedItem[] => {
    if (!hasExisting) return extracted; // No existing items — all new, no diff needed

    return extracted.map((item) => {
      const code = item.kod_prvku?.trim();
      if (!code) return { ...item, _diffStatus: "new" as const };

      const existing = existingByCode.get(code);
      if (!existing) return { ...item, _diffStatus: "new" as const };

      // Compare fields
      const dbValues: Partial<Record<string, string | number>> = {};
      let hasChanges = false;

      if ((existing.cena ?? 0) !== item.cena) {
        dbValues.cena = existing.cena ?? 0;
        hasChanges = true;
      }
      if ((existing.pocet ?? 1) !== item.pocet) {
        dbValues.pocet = existing.pocet ?? 1;
        hasChanges = true;
      }
      if ((existing.nazev || "") !== item.nazev) {
        dbValues.nazev = existing.nazev || "";
        hasChanges = true;
      }
      if ((existing.popis || "") !== item.popis) {
        dbValues.popis = existing.popis || "";
        hasChanges = true;
      }

      return {
        ...item,
        _diffStatus: hasChanges ? "changed" as const : "unchanged" as const,
        _dbId: existing.id,
        _dbValues: hasChanges ? dbValues : undefined,
      };
    });
  }, [existingByCode, hasExisting]);

  /** Post-process extracted items — filter appliances */
  const postFilter = useCallback((extracted: ExtractedItem[]): ExtractedItem[] => {
    return extracted.filter(item => !isApplianceOnly(item));
  }, []);

  useEffect(() => {
    if (!open) {
      // Only reset UI state, NOT items/sourceDoc — those live in module cache
      setSpUploaded(false);
      setErrorMsg("");
      autoExtractTriggered.current = false;
      setManualFile(null);
      setManualLoading(false);
      setPreviewOpen(false);
      setPreviewLoading(false);
      setPreviewData({ previewUrl: null, webUrl: null, downloadUrl: null });
      setSelectedIndices(new Set());
      setLastClickedIdx(null);
      return;
    }

    // Check module-level cache first
    const cached = getCachedExtraction(projectId);
    if (cached) {
      // Re-apply diff against current existingItems (may have changed)
      setItems(applyDiff(cached.items.map(i => ({ ...i, _diffStatus: undefined, _dbId: undefined, _dbValues: undefined }))));
      setFoundFileName(cached.fileName);
      setSourceDoc(cached.sourceDoc);
      setPhase("done");
      return;
    }

    // Reset extraction state for fresh run
    setMatches([]);
    setFoundFileName("");
    setItems([]);
    setSourceDoc(null);

    // If existing items, ask confirmation first
    if (hasExisting) {
      setPhase("confirm");
    } else {
      searchSharePoint();
    }
  }, [open, projectId]);

  const searchSharePoint = async () => {
    setPhase("searching");
    try {
      const { data, error } = await supabase.functions.invoke("extract-tpv-from-sharepoint", {
        body: { projectId, action: "search" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const autoMatches: SPMatch[] = data.autoMatches || [];
      const allFiles: SPMatch[] = data.allFiles || [];
      setMatches(autoMatches);
      setAllSpFiles(allFiles);

      if (autoMatches.length === 1) {
        setPhase("found");
        setFoundFileName(autoMatches[0].name);
        autoExtractTriggered.current = true;
        extractFromSharePoint(autoMatches[0].itemId, autoMatches[0].name);
      } else if (autoMatches.length > 1) {
        setPhase("multiple");
      } else {
        setPhase(allFiles.length > 0 ? "pick-or-upload" : "not-found");
      }
    } catch (err: any) {
      console.error("SharePoint search error:", err);
      setPhase("not-found");
      setErrorMsg(err.message || "Chyba při hledání dokumentů");
    }
  };

  const extractFromSharePoint = async (fileItemId: string, fileName: string) => {
    setPhase("extracting");
    setFoundFileName(fileName);
    try {
      const { data, error } = await supabase.functions.invoke("extract-tpv-from-sharepoint", {
        body: { projectId, action: "extract", fileItemId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const extracted: ExtractedItem[] = (data.items || []).map((item: any) => ({
        kod_prvku: item.kod_prvku || item.item_name || "",
        nazev: item.nazev || item.kod_prvku || item.item_name || "",
        popis: item.popis || item.popis_full || "",
        cena: Number(item.cena) || 0,
        pocet: Number(item.pocet) || 1,
      }));

      const filtered = postFilter(extracted);
      const srcDoc = { itemId: fileItemId, fileName };
      // Cache raw extracted items (before diff) for reuse
      extractionCache.set(projectId, { items: filtered, fileName, sourceDoc: srcDoc, timestamp: Date.now() });
      setItems(applyDiff(filtered));
      setSourceDoc(srcDoc);
      setPhase("done");
    } catch (err: any) {
      console.error("Extract error:", err);
      setPhase("error");
      setErrorMsg(err.message || "Nepodařilo se extrahovat položky");
      toast({ title: "Chyba extrakce", description: err.message, variant: "destructive" });
    }
  };

  const fileToBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const getMimeType = (fileName: string): string => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".pdf")) return "application/pdf";
    if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
    return "application/octet-stream";
  };

  const handleManualExtract = useCallback(async () => {
    if (!manualFile) return;
    setManualLoading(true);
    setPhase("extracting");
    try {
      const base64Content = await fileToBase64(manualFile);
      const mimeType = getMimeType(manualFile.name);

      const extractionPromise = supabase.functions.invoke("extract-tpv", {
        body: { fileBase64: base64Content, mimeType },
      });

      supabase.functions.invoke("upload-to-sharepoint", {
        body: { projectId, fileBase64: base64Content, fileName: manualFile.name, mimeType: manualFile.type || "application/octet-stream" },
      }).then((res) => {
        if (!res.error && res.data?.success) setSpUploaded(true);
      }).catch(() => {});

      const { data, error } = await extractionPromise;
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const extracted: ExtractedItem[] = (data.items || []).map((item: any) => ({
        kod_prvku: item.kod_prvku || item.item_name || "",
        nazev: item.nazev || item.kod_prvku || item.item_name || "",
        popis: item.popis || item.popis_full || "",
        cena: Number(item.cena) || 0,
        pocet: Number(item.pocet) || 1,
      }));

      const filtered = postFilter(extracted);
      const srcDoc = { fileName: manualFile.name, blobUrl: URL.createObjectURL(manualFile) };
      extractionCache.set(projectId, { items: filtered, fileName: manualFile.name, sourceDoc: srcDoc, timestamp: Date.now() });
      setItems(applyDiff(filtered));
      setFoundFileName(manualFile.name);
      setSourceDoc(srcDoc);
      setPhase("done");
    } catch (err: any) {
      console.error("Manual extract error:", err);
      setPhase("error");
      setErrorMsg(err.message || "Nepodařilo se extrahovat položky");
      toast({ title: "Chyba extrakce", description: err.message, variant: "destructive" });
    } finally {
      setManualLoading(false);
    }
  }, [manualFile, projectId, applyDiff, postFilter]);

  const updateItem = (index: number, field: keyof ExtractedItem, value: string | number) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setSelectedIndices((prev) => {
      const next = new Set<number>();
      for (const idx of prev) {
        if (idx < index) next.add(idx);
        else if (idx > index) next.add(idx - 1);
      }
      return next;
    });
  };

  const removeSelected = () => {
    setItems((prev) => prev.filter((_, i) => !selectedIndices.has(i)));
    setSelectedIndices(new Set());
    setLastClickedIdx(null);
  };

  const addRow = () => {
    setItems((prev) => [...prev, { kod_prvku: "", nazev: "", popis: "", cena: 0, pocet: 1, _diffStatus: "new" }]);
  };

  // ─── Checkbox handlers ──────────────────────────────────────────────
  const handleCheckboxClick = (index: number, shiftKey: boolean) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickedIdx !== null) {
        const [from, to] = lastClickedIdx < index ? [lastClickedIdx, index] : [index, lastClickedIdx];
        for (let i = from; i <= to; i++) next.add(i);
      } else {
        if (next.has(index)) next.delete(index);
        else next.add(index);
      }
      return next;
    });
    setLastClickedIdx(index);
  };

  const toggleSelectAll = () => {
    if (selectedIndices.size === items.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(items.map((_, i) => i)));
    }
  };

  const totalSum = items.reduce((sum, item) => sum + item.cena * item.pocet, 0);

  // Diff stats
  const diffStats = useMemo(() => {
    if (!hasExisting) return null;
    const newCount = items.filter(i => i._diffStatus === "new").length;
    const changedCount = items.filter(i => i._diffStatus === "changed").length;
    const unchangedCount = items.filter(i => i._diffStatus === "unchanged").length;
    return { newCount, changedCount, unchangedCount };
  }, [items, hasExisting]);

  const openSourcePreview = useCallback(async () => {
    if (!sourceDoc) return;
    setPreviewLoading(true);
    try {
      if (sourceDoc.itemId) {
        const data = await sp.getPreview(sourceDoc.itemId);
        setPreviewData({
          previewUrl: data?.previewUrl ?? null,
          webUrl: data?.webUrl ?? null,
          downloadUrl: data?.downloadUrl ?? null,
        });
      } else if (sourceDoc.blobUrl) {
        const isPdf = sourceDoc.fileName.toLowerCase().endsWith(".pdf");
        setPreviewData({
          previewUrl: isPdf ? sourceDoc.blobUrl : null,
          webUrl: null,
          downloadUrl: sourceDoc.blobUrl,
        });
      }
      setPreviewOpen(true);
    } catch (err) {
      console.error("Preview error:", err);
      toast({ title: "Nepodařilo se načíst náhled", variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  }, [sourceDoc, sp]);

  const handleSave = async () => {
    const valid = items.filter((i) => i.kod_prvku.trim());
    if (valid.length === 0) {
      toast({ title: "Žádné položky k uložení", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Split by diff status
      const toInsert = valid.filter(i => !i._diffStatus || i._diffStatus === "new");
      const toUpdate = valid.filter(i => i._diffStatus === "changed" && i._dbId);
      // unchanged are skipped

      // INSERT new items
      if (toInsert.length > 0) {
        const { error } = await supabase.from("tpv_items").insert(
          toInsert.map((item) => ({
            project_id: projectId,
            item_code: item.kod_prvku,
            nazev: item.nazev,
            popis: item.popis || null,
            cena: item.cena,
            pocet: item.pocet,
            status: "Ke zpracování",
          })),
        );
        if (error) throw error;
      }

      // UPDATE changed items (only changed fields)
      for (const item of toUpdate) {
        const updates: Record<string, any> = {};
        const existing = existingByCode.get(item.kod_prvku);
        if (!existing) continue;

        if ((existing.cena ?? 0) !== item.cena) updates.cena = item.cena;
        if ((existing.pocet ?? 1) !== item.pocet) updates.pocet = item.pocet;
        if ((existing.nazev || "") !== item.nazev) updates.nazev = item.nazev;
        if ((existing.popis || "") !== item.popis) updates.popis = item.popis || null;

        if (Object.keys(updates).length > 0) {
          const { error } = await supabase.from("tpv_items").update(updates).eq("id", item._dbId!);
          if (error) throw error;
        }
      }

      const parts: string[] = [];
      if (toInsert.length > 0) parts.push(`${toInsert.length} nových`);
      if (toUpdate.length > 0) parts.push(`${toUpdate.length} aktualizováno`);

      toast({
        title: "Položky uloženy",
        description: parts.join(", ") || `${valid.length} položek přidáno do TPV`,
      });
      // Clear cache after successful save
      extractionCache.delete(projectId);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: "Chyba při ukládání", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleManualFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setManualFile(f); setItems([]); }
  };

  /** Check if a specific cell has changed from DB value */
  const isCellChanged = (item: ExtractedItem, field: string): boolean => {
    return item._diffStatus === "changed" && !!item._dbValues && field in item._dbValues;
  };

  const saveLabel = diffStats
    ? (() => {
        const parts: string[] = [];
        if (diffStats.newCount > 0) parts.push(`${diffStats.newCount} nových`);
        if (diffStats.changedCount > 0) parts.push(`${diffStats.changedCount} aktualizací`);
        return parts.length > 0 ? `Uložit (${parts.join(", ")})` : "Bez změn";
      })()
    : `Uložit do TPV (${items.filter(i => i.kod_prvku.trim()).length})`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            Extrakce cenové nabídky
          </DialogTitle>
        </DialogHeader>

        {/* Phase: Confirm — existing items warning */}
        {phase === "confirm" && (
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50/50">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Projekt již obsahuje {existingItems.filter(i => !i.deleted_at).length} TPV položek
                </p>
                <p className="text-xs text-muted-foreground">
                  Data z cenové nabídky budou porovnána s existujícími položkami. 
                  Stávající status, konstruktér a poznámky zůstanou zachovány — aktualizují se pouze změněné hodnoty (cena, počet, název, popis).
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Zrušit</Button>
              <Button size="sm" onClick={searchSharePoint}>Pokračovat</Button>
            </div>
          </div>
        )}

        {/* Phase: Searching */}
        {phase === "searching" && (
          <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Hledám cenovou nabídku v dokumentech projektu…</span>
          </div>
        )}

        {/* Phase: Found — auto-extracting */}
        {phase === "found" && (
          <div className="flex items-center gap-2 py-4">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm">
              Nalezena cenová nabídka: <strong>{foundFileName}</strong>
            </span>
          </div>
        )}

        {/* Phase: Extracting */}
        {phase === "extracting" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">AI extrahuje položky z {foundFileName || "dokumentu"}…</span>
          </div>
        )}

        {/* Phase: Multiple matches */}
        {phase === "multiple" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Search className="h-4 w-4" />
              Nalezeno {matches.length} cenových nabídek — vyberte jednu:
            </div>
            <div className="space-y-1">
              {matches.map((m) => (
                <button
                  key={m.itemId}
                  onClick={() => extractFromSharePoint(m.itemId, m.name)}
                  className="w-full text-left px-3 py-2 rounded-md border border-input hover:bg-accent transition-colors text-sm flex items-center gap-2"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {m.name}
                  <span className="ml-auto text-xs text-muted-foreground">{(m.size / 1024).toFixed(0)} KB</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Phase: Pick from SharePoint or upload */}
        {phase === "pick-or-upload" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Search className="h-4 w-4" />
              Cenová nabídka nebyla rozpoznána automaticky. Vyberte soubor ze SharePointu nebo nahrajte nový:
            </div>
            <div className="space-y-1 max-h-48 overflow-auto">
              {allSpFiles.map((m) => (
                <button
                  key={m.itemId}
                  onClick={() => extractFromSharePoint(m.itemId, m.name)}
                  className="w-full text-left px-3 py-2 rounded-md border border-input hover:bg-accent transition-colors text-sm flex items-center gap-2"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {m.name}
                  <span className="ml-auto text-xs text-muted-foreground">{(m.size / 1024).toFixed(0)} KB</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2 border-t">
              <span className="text-xs text-muted-foreground">nebo</span>
              <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent cursor-pointer text-sm transition-colors">
                <Upload className="h-4 w-4" />
                {manualFile ? manualFile.name : "Nahrát nový soubor"}
                <input type="file" accept=".pdf,.xlsx,.xls" onChange={handleManualFileChange} className="hidden" />
              </label>
              {manualFile && (
                <Button size="sm" onClick={handleManualExtract} disabled={manualLoading} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  {manualLoading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Extrahuji…</> : "Extrahovat položky"}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Phase: Not found */}
        {phase === "not-found" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              Cenová nabídka nebyla nalezena v SharePointu. Nahrajte soubor ručně:
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent cursor-pointer text-sm transition-colors">
                <Upload className="h-4 w-4" />
                {manualFile ? manualFile.name : "Vybrat soubor"}
                <input type="file" accept=".pdf,.xlsx,.xls" onChange={handleManualFileChange} className="hidden" />
              </label>
              <Button size="sm" onClick={handleManualExtract} disabled={!manualFile || manualLoading} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {manualLoading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Extrahuji…</> : "Extrahovat položky"}
              </Button>
            </div>
          </div>
        )}

        {/* Phase: Error */}
        {phase === "error" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {errorMsg || "Nepodařilo se extrahovat položky"}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={searchSharePoint}>Zkusit znovu</Button>
              <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent cursor-pointer text-sm transition-colors">
                <Upload className="h-4 w-4" />
                {manualFile ? manualFile.name : "Nahrát ručně"}
                <input type="file" accept=".pdf,.xlsx,.xls" onChange={handleManualFileChange} className="hidden" />
              </label>
              {manualFile && (
                <Button size="sm" onClick={handleManualExtract} disabled={manualLoading} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Extrahovat
                </Button>
              )}
            </div>
          </div>
        )}

        {/* SharePoint upload note */}
        {spUploaded && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            Dokument byl uložen do SharePointu
          </div>
        )}

        {/* Phase: Done — review table */}
        {phase === "done" && items.length > 0 && (
          <>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              Extrahováno z: <strong>{foundFileName}</strong>
              {diffStats && (
                <span className="ml-2">
                  — {diffStats.newCount > 0 && <span className="text-green-700">{diffStats.newCount} nových</span>}
                  {diffStats.newCount > 0 && diffStats.changedCount > 0 && ", "}
                  {diffStats.changedCount > 0 && <span className="text-amber-700">{diffStats.changedCount} změněných</span>}
                  {(diffStats.newCount > 0 || diffStats.changedCount > 0) && diffStats.unchangedCount > 0 && ", "}
                  {diffStats.unchangedCount > 0 && <span>{diffStats.unchangedCount} beze změny</span>}
                </span>
              )}
            </div>

            {/* Bulk actions bar */}
            {selectedIndices.size > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border bg-muted/40">
                <span className="text-xs text-muted-foreground">{selectedIndices.size} vybráno</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={removeSelected}>
                  <Trash2 className="h-3 w-3 mr-1" />
                  Odebrat vybrané
                </Button>
              </div>
            )}

            <div className="flex-1 overflow-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px] px-2">
                      <Checkbox
                        checked={items.length > 0 && selectedIndices.size === items.length}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Vybrat vše"
                      />
                    </TableHead>
                    <TableHead className="w-[100px]">Kód</TableHead>
                    <TableHead className="w-[160px]">Název</TableHead>
                    <TableHead>Popis</TableHead>
                    <TableHead className="w-[110px] text-right">Cena/ks</TableHead>
                    <TableHead className="w-[70px] text-right">Počet</TableHead>
                    <TableHead className="w-[110px] text-right">Celkem</TableHead>
                    <TableHead className="w-[40px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => {
                    const isUnchanged = item._diffStatus === "unchanged";
                    const isNew = item._diffStatus === "new";
                    const rowClass = isUnchanged ? "opacity-40" : isNew && hasExisting ? "bg-green-50/40" : "";

                    return (
                      <TableRow key={i} className={`${rowClass} ${selectedIndices.has(i) ? "bg-accent/50" : ""}`}>
                        <TableCell className="px-2">
                          <Checkbox
                            checked={selectedIndices.has(i)}
                            onCheckedChange={() => {}}
                            onClick={(e) => handleCheckboxClick(i, (e as React.MouseEvent).shiftKey)}
                            aria-label={`Vybrat řádek ${i + 1}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.kod_prvku}
                            onChange={(e) => updateItem(i, "kod_prvku", e.target.value)}
                            className="h-7 text-xs"
                            disabled={isUnchanged}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.nazev}
                            onChange={(e) => updateItem(i, "nazev", e.target.value)}
                            className={`h-7 text-xs ${isCellChanged(item, "nazev") ? "border-amber-400 bg-amber-50" : ""}`}
                            disabled={isUnchanged}
                            title={isCellChanged(item, "nazev") ? `Původní: ${item._dbValues?.nazev}` : undefined}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.popis}
                            onChange={(e) => updateItem(i, "popis", e.target.value)}
                            className={`h-7 text-xs ${isCellChanged(item, "popis") ? "border-amber-400 bg-amber-50" : ""}`}
                            disabled={isUnchanged}
                            title={isCellChanged(item, "popis") ? `Původní: ${item._dbValues?.popis}` : undefined}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.cena}
                            onChange={(e) => updateItem(i, "cena", Number(e.target.value))}
                            className={`h-7 text-xs text-right ${isCellChanged(item, "cena") ? "border-amber-400 bg-amber-50" : ""}`}
                            disabled={isUnchanged}
                            title={isCellChanged(item, "cena") ? `Původní: ${item._dbValues?.cena}` : undefined}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.pocet}
                            onChange={(e) => updateItem(i, "pocet", Number(e.target.value))}
                            className={`h-7 text-xs text-right w-16 ${isCellChanged(item, "pocet") ? "border-amber-400 bg-amber-50" : ""}`}
                            disabled={isUnchanged}
                            title={isCellChanged(item, "pocet") ? `Původní: ${item._dbValues?.pocet}` : undefined}
                          />
                        </TableCell>
                        <TableCell className="text-right text-xs font-medium">
                          {formatCurrency(item.cena * item.pocet)}
                        </TableCell>
                        <TableCell>
                          {!isUnchanged && (
                            <button
                              onClick={() => removeItem(i)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/30">
                <Button variant="ghost" size="sm" onClick={addRow}>
                  <Plus className="h-3 w-3 mr-1" /> Přidat řádek
                </Button>
                <span className="text-sm font-semibold">
                  Celkem: {formatCurrency(totalSum)}
                </span>
              </div>
            </div>

            <DialogFooter className="flex items-center justify-between sm:justify-between">
              <div>
                {sourceDoc && (
                  <Button variant="ghost" size="sm" onClick={openSourcePreview} disabled={previewLoading}>
                    {previewLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />}
                    Zobrazit dokument
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onClose}>Zrušit</Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || (diffStats !== null && diffStats.newCount === 0 && diffStats.changedCount === 0)}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                  {saveLabel}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}

        {phase === "done" && items.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Nebyly nalezeny žádné položky v dokumentu.
          </div>
        )}
      </DialogContent>

      <PreviewErrorBoundary onError={() => setPreviewOpen(false)}>
        <DocumentPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          fileName={sourceDoc?.fileName || ""}
          previewUrl={previewData.previewUrl}
          webUrl={previewData.webUrl}
          downloadUrl={previewData.downloadUrl}
          loading={previewLoading}
        />
      </PreviewErrorBoundary>
    </Dialog>
  );
}
