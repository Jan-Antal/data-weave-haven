import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Upload, Trash2, Plus, Loader2, FileText, CheckCircle2 } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import * as XLSX from "xlsx";

interface ExtractedItem {
  item_name: string;
  popis: string;
  cena: number;
  pocet: number;
}

interface TPVExtractorProps {
  projectId: string;
  onSuccess: () => void;
  onClose: () => void;
  open: boolean;
}

export function TPVExtractor({ projectId, onSuccess, onClose, open }: TPVExtractorProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [spUploaded, setSpUploaded] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setItems([]);
    }
  };

  const fileToBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const excelToCSV = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_csv(ws));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(f);
    });

  const handleExtract = useCallback(async () => {
    if (!file) return;
    setLoading(true);
    setSpUploaded(false);
    try {
      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      let content: string;
      let fileType: string;

      const base64Content = await fileToBase64(file);

      if (isPdf) {
        content = base64Content;
        fileType = "pdf";
      } else {
        content = await excelToCSV(file);
        fileType = "excel";
      }

      // Start extraction
      const extractionPromise = supabase.functions.invoke("extract-tpv", {
        body: { content, fileType },
      });

      // Upload to SharePoint in background (don't block extraction)
      supabase.functions.invoke("upload-to-sharepoint", {
        body: {
          projectId,
          fileBase64: base64Content,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
        },
      }).then((res) => {
        if (!res.error && res.data?.success) {
          setSpUploaded(true);
        } else {
          console.warn("SharePoint upload failed:", res.error || res.data?.error);
        }
      }).catch((err) => {
        console.warn("SharePoint upload error:", err);
      });

      const { data, error } = await extractionPromise;

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const extracted = (data.items || []).map((item: any) => ({
        item_name: item.item_name || "",
        popis: item.popis || "",
        cena: Number(item.cena) || 0,
        pocet: Number(item.pocet) || 1,
      }));

      setItems(extracted);
      toast({
        title: "Extrakce dokončena",
        description: `Nalezeno ${extracted.length} položek`,
      });
    } catch (err: any) {
      console.error("Extract error:", err);
      toast({
        title: "Chyba extrakce",
        description: err.message || "Nepodařilo se extrahovat položky",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [file, projectId]);

  const updateItem = (index: number, field: keyof ExtractedItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setItems((prev) => [...prev, { item_name: "", popis: "", cena: 0, pocet: 1 }]);
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
          item_type: item.popis || "Material",
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5" style={{ color: "#e8692a" }} />
            Nahrát cenovou nabídku
          </DialogTitle>
        </DialogHeader>

        {/* File upload */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent cursor-pointer text-sm transition-colors">
            <Upload className="h-4 w-4" />
            {file ? file.name : "Vybrat soubor"}
            <input
              type="file"
              accept=".pdf,.xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
          <Button
            size="sm"
            onClick={handleExtract}
            disabled={!file || loading}
            style={{ backgroundColor: "#e8692a" }}
            className="text-white hover:opacity-90"
          >
            {loading ? (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Extrahuji…
              </>
            ) : (
              "Extrahovat položky"
            )}
          </Button>
        </div>

        {/* SharePoint upload note */}
        {spUploaded && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            Dokument byl uložen do SharePointu
          </div>
        )}

        {/* Items table */}
        {items.length > 0 && (
          <div className="flex-1 overflow-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Název</TableHead>
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
                        value={item.popis}
                        onChange={(e) => updateItem(i, "popis", e.target.value)}
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
        )}

        {items.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Zrušit
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              style={{ backgroundColor: "#e8692a" }}
              className="text-white hover:opacity-90"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : null}
              Uložit do TPV ({items.filter((i) => i.item_name.trim()).length})
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
