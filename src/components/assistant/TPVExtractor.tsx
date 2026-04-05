import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Upload, Trash2, Plus, Loader2, FileText, CheckCircle2, Search, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/currency";


interface ExtractedItem {
  item_name: string;
  nazev: string;
  popis_short: string;
  popis_full: string;
  cena: number;
  pocet: number;
}

type PopisMode = "short" | "full";

interface SPMatch {
  itemId: string;
  name: string;
  size: number;
}

type Phase = "searching" | "found" | "multiple" | "not-found" | "extracting" | "done" | "error" | "pick-or-upload";

interface TPVExtractorProps {
  projectId: string;
  onSuccess: () => void;
  onClose: () => void;
  open: boolean;
}

export function TPVExtractor({ projectId, onSuccess, onClose, open }: TPVExtractorProps) {
  const [phase, setPhase] = useState<Phase>("searching");
  const [matches, setMatches] = useState<SPMatch[]>([]);
  const [allSpFiles, setAllSpFiles] = useState<SPMatch[]>([]);
  const [foundFileName, setFoundFileName] = useState("");
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [popisMode, setPopisMode] = useState<PopisMode>("short");
  const [spUploaded, setSpUploaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const autoExtractTriggered = useRef(false);

  // Manual upload fallback
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [manualLoading, setManualLoading] = useState(false);

  // Search SharePoint on open
  useEffect(() => {
    if (!open) {
      // Reset state when closing
      setPhase("searching");
      setMatches([]);
      setFoundFileName("");
      setItems([]);
      setSpUploaded(false);
      setErrorMsg("");
      autoExtractTriggered.current = false;
      setManualFile(null);
      setManualLoading(false);
      return;
    }

    searchSharePoint();
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
        // No auto-match — offer pick from SP or upload
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

      const extracted = (data.items || []).map((item: any) => ({
        item_name: item.item_name || "",
        nazev: item.nazev || "",
        popis_short: item.popis_short || item.popis || "",
        popis_full: item.popis_full || item.popis || "",
        cena: Number(item.cena) || 0,
        pocet: Number(item.pocet) || 1,
      }));

      setItems(extracted);
      setPhase("done");
    } catch (err: any) {
      console.error("Extract error:", err);
      setPhase("error");
      setErrorMsg(err.message || "Nepodařilo se extrahovat položky");
      toast({
        title: "Chyba extrakce",
        description: err.message || "Nepodařilo se extrahovat položky",
        variant: "destructive",
      });
    }
  };

  // Manual file upload fallback
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

      // Upload to SharePoint in background
      supabase.functions.invoke("upload-to-sharepoint", {
        body: {
          projectId,
          fileBase64: base64Content,
          fileName: manualFile.name,
          mimeType: manualFile.type || "application/octet-stream",
        },
      }).then((res) => {
        if (!res.error && res.data?.success) setSpUploaded(true);
        else console.warn("SP upload failed:", res.error || res.data?.error);
      }).catch((err) => console.warn("SP upload error:", err));

      const { data, error } = await extractionPromise;
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const extracted = (data.items || []).map((item: any) => ({
        item_name: item.item_name || "",
        nazev: item.nazev || "",
        popis_short: item.popis_short || item.popis || "",
        popis_full: item.popis_full || item.popis || "",
        cena: Number(item.cena) || 0,
        pocet: Number(item.pocet) || 1,
      }));

      setItems(extracted);
      setFoundFileName(manualFile.name);
      setPhase("done");
    } catch (err: any) {
      console.error("Manual extract error:", err);
      setPhase("error");
      setErrorMsg(err.message || "Nepodařilo se extrahovat položky");
      toast({
        title: "Chyba extrakce",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setManualLoading(false);
    }
  }, [manualFile, projectId]);

  const updateItem = (index: number, field: keyof ExtractedItem, value: string | number) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setItems((prev) => [...prev, { item_name: "", nazev: "", popis_short: "", popis_full: "", cena: 0, pocet: 1 }]);
  };

  const totalSum = items.reduce((sum, item) => sum + item.cena * item.pocet, 0);

  const handleSave = async () => {
    const valid = items.filter((i) => i.item_name.trim());
    if (valid.length === 0) {
      toast({ title: "Žádné položky k uložení", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("tpv_items").insert(
        valid.map((item) => ({
          project_id: projectId,
          item_name: item.item_name,
          item_type: item.nazev || item.item_name,
          nazev_prvku: popisMode === "full" ? item.popis_full : item.popis_short || null,
          cena: item.cena,
          pocet: item.pocet,
          status: "Ke zpracování",
        })),
      );
      if (error) throw error;
      toast({
        title: "Položky uloženy",
        description: `${valid.length} položek přidáno do TPV`,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({
        title: "Chyba při ukládání",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleManualFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setManualFile(f);
      setItems([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            Extrakce cenové nabídky
          </DialogTitle>
        </DialogHeader>

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
                  <span className="ml-auto text-xs text-muted-foreground">
                    {(m.size / 1024).toFixed(0)} KB
                  </span>
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
                  <span className="ml-auto text-xs text-muted-foreground">
                    {(m.size / 1024).toFixed(0)} KB
                  </span>
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
                  {manualLoading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Extrahuji…</> : "Extrahovat"}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Phase: Not found — no SP files at all */}
        {phase === "not-found" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              V SharePointu nebyly nalezeny žádné dokumenty projektu
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent cursor-pointer text-sm transition-colors">
                <Upload className="h-4 w-4" />
                {manualFile ? manualFile.name : "Nahrát soubor"}
                <input type="file" accept=".pdf,.xlsx,.xls" onChange={handleManualFileChange} className="hidden" />
              </label>
              <Button size="sm" onClick={handleManualExtract} disabled={!manualFile || manualLoading} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {manualLoading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Extrahuji…</> : "Extrahovat položky"}
              </Button>
            </div>
          </div>
        )}

        {/* Phase: Error — allow retry or manual */}
        {phase === "error" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {errorMsg || "Nepodařilo se extrahovat položky"}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={searchSharePoint}>
                Zkusit znovu
              </Button>
              <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent cursor-pointer text-sm transition-colors">
                <Upload className="h-4 w-4" />
                {manualFile ? manualFile.name : "Nahrát ručně"}
                <input
                  type="file"
                  accept=".pdf,.xlsx,.xls"
                  onChange={handleManualFileChange}
                  className="hidden"
                />
              </label>
              {manualFile && (
                <Button
                  size="sm"
                  onClick={handleManualExtract}
                  disabled={manualLoading}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
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
            </div>
            <div className="flex-1 overflow-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
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
                  {items.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Input
                          value={item.item_name}
                          onChange={(e) => updateItem(i, "item_name", e.target.value)}
                          className="h-7 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={item.nazev}
                          onChange={(e) => updateItem(i, "nazev", e.target.value)}
                          className="h-7 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={popisMode === "full" ? item.popis_full : item.popis_short}
                          onChange={(e) => updateItem(i, popisMode === "full" ? "popis_full" : "popis_short", e.target.value)}
                          className="h-7 text-xs"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.cena}
                          onChange={(e) => updateItem(i, "cena", Number(e.target.value))}
                          className="h-7 text-xs text-right"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.pocet}
                          onChange={(e) => updateItem(i, "pocet", Number(e.target.value))}
                          className="h-7 text-xs text-right w-16"
                        />
                      </TableCell>
                      <TableCell className="text-right text-xs font-medium">
                        {formatCurrency(item.cena * item.pocet)}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => removeItem(i)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
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

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Zrušit
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                Uložit do TPV ({items.filter((i) => i.item_name.trim()).length})
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === "done" && items.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Nebyly nalezeny žádné položky v dokumentu.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
