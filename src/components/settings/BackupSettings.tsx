import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Download, CloudUpload, Loader2 } from "lucide-react";

export function BackupSettings() {
  const [runningSp, setRunningSp] = useState(false);
  const [runningDl, setRunningDl] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const runSharePointBackup = async () => {
    setRunningSp(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("backup-export", {
        body: { mode: "sharepoint", trigger: "manual" },
      });
      if (error) throw error;
      const rows = data?.total_rows ?? 0;
      const tables = data?.tables ?? 0;
      const folder = data?.folder ?? "";
      setLastResult(`✓ ${tables} tabulek, ${rows.toLocaleString("cs")} řádků → ${folder}`);
      toast({ title: "Záloha dokončena", description: `${tables} tabulek na SharePoint` });
    } catch (e: any) {
      setLastResult(`✗ ${e.message || "Chyba"}`);
      toast({ title: "Chyba zálohy", description: e.message, variant: "destructive" });
    }
    setRunningSp(false);
  };

  const downloadZip = async () => {
    setRunningDl(true);
    try {
      const { data, error } = await supabase.functions.invoke("backup-export", {
        body: { mode: "download", trigger: "manual" },
      });
      if (error) throw error;
      const base64 = data?.zip_base64;
      const filename = data?.filename || `backup-${Date.now()}.zip`;
      if (!base64) throw new Error("ZIP data missing");
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "ZIP záloha stažena", description: filename });
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    }
    setRunningDl(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Automatická záloha probíhá každý den ve 3:00 ráno na SharePoint do složky <code className="text-[10px] bg-muted px-1 rounded">/Backups/</code>.
        Denní zálohy se uchovávají 90 dní, měsíční snapshoty 1 rok.
      </p>
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={runSharePointBackup} disabled={runningSp}>
          {runningSp ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5 mr-1.5" />}
          Spustit zálohu nyní
        </Button>
        <Button size="sm" variant="outline" onClick={downloadZip} disabled={runningDl}>
          {runningDl ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
          Stáhnout zálohu (ZIP)
        </Button>
      </div>
      {lastResult && <p className="text-[11px] text-muted-foreground">{lastResult}</p>}
    </div>
  );
}
