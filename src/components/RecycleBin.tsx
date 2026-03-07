import { useState } from "react";
import { logActivity } from "@/lib/activityLog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { RotateCcw, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { TestModeBanner } from "./TestModeBanner";

interface RecycleBinProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function useDeletedRecords(table: string) {
  return useQuery({
    queryKey: ["deleted", table],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from(table as any)
        .select("*") as any)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

function RecordRow({ record, table, nameField, idField, canPermanentDelete }: { record: any; table: string; nameField: string; idField?: string; canPermanentDelete: boolean }) {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const displayName = idField ? `${record[idField]} — ${record[nameField]}` : record[nameField];
  const deletedAt = record.deleted_at ? format(new Date(record.deleted_at), "dd-MMM-yy HH:mm") : "";

  const handleRestore = async () => {
    const { error } = await supabase.from(table as any).update({ deleted_at: null } as any).eq("id", record.id);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Obnoveno" });
      if (table === "projects" && record.project_id) {
        logActivity({ projectId: record.project_id, actionType: "project_restored", detail: record.project_name || record.project_id });
      }
      qc.invalidateQueries({ queryKey: ["deleted", table] });
      qc.invalidateQueries({ queryKey: [table === "projects" ? "projects" : table === "project_stages" ? "project_stages" : "tpv_items"] });
    }
  };

  const handlePermanentDelete = async () => {
    const { error } = await supabase.from(table as any).delete().eq("id", record.id);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Trvale smazáno" });
      qc.invalidateQueries({ queryKey: ["deleted", table] });
    }
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 border-b last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{displayName}</p>
        <p className="text-xs text-muted-foreground">Smazáno: {deletedAt}</p>
      </div>
      <div className="flex items-center gap-1 ml-2 shrink-0">
        {!confirmDelete ? (
          <>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleRestore}>
              <RotateCcw className="h-3 w-3 mr-1" /> Obnovit
            </Button>
            {canPermanentDelete && (
              <Button size="sm" className="h-7 text-xs bg-[#EA592A] hover:bg-[#EA592A]/90 text-white" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3 w-3 mr-1" /> Trvale smazat
              </Button>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#EA592A]">Opravdu smazat?</span>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setConfirmDelete(false)}>Zrušit</Button>
            <Button size="sm" className="h-7 text-xs bg-[#EA592A] hover:bg-[#EA592A]/90 text-white" onClick={handlePermanentDelete}>Potvrdit</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function RecordList({ table, nameField, idField, emptyText, canPermanentDelete }: { table: string; nameField: string; idField?: string; emptyText: string; canPermanentDelete: boolean }) {
  const { data: records = [], isLoading } = useDeletedRecords(table);

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Načítání...</p>;
  if (records.length === 0) return <p className="text-sm text-muted-foreground p-4">{emptyText}</p>;

  return (
    <div className="border rounded-lg max-h-[400px] overflow-y-auto">
      {records.map((r) => (
        <RecordRow key={r.id} record={r} table={table} nameField={nameField} idField={idField} canPermanentDelete={canPermanentDelete} />
      ))}
    </div>
  );
}

export function RecycleBin({ open, onOpenChange }: RecycleBinProps) {
  const { canPermanentDelete, isKonstrukter, isPM, isAdmin, isTestUser } = useAuth();

  // Konstruktér only sees TPV items
  const defaultTab = isKonstrukter ? "tpv" : "projects";

  // PM can see projects/stages but cannot permanently delete them — only Admin/Owner can
  const canPermDeleteProjectsStages = isAdmin && !isTestUser;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>Koš</DialogTitle>
        </DialogHeader>
        {isTestUser && <TestModeBanner />}
        <div className={isTestUser ? "pointer-events-none opacity-80" : ""}>
          <Tabs defaultValue={defaultTab} className="space-y-3">
            <TabsList className="w-full">
              {!isKonstrukter && <TabsTrigger value="projects" className="flex-1">Projekty</TabsTrigger>}
              {!isKonstrukter && <TabsTrigger value="stages" className="flex-1">Etapy</TabsTrigger>}
              <TabsTrigger value="tpv" className="flex-1">TPV položky</TabsTrigger>
            </TabsList>
            {!isKonstrukter && (
              <TabsContent value="projects">
                <RecordList table="projects" nameField="project_name" idField="project_id" emptyText="Žádné smazané projekty" canPermanentDelete={canPermDeleteProjectsStages} />
              </TabsContent>
            )}
            {!isKonstrukter && (
              <TabsContent value="stages">
                <RecordList table="project_stages" nameField="stage_name" emptyText="Žádné smazané etapy" canPermanentDelete={canPermDeleteProjectsStages} />
              </TabsContent>
            )}
            <TabsContent value="tpv">
              <RecordList table="tpv_items" nameField="item_name" emptyText="Žádné smazané TPV položky" canPermanentDelete={canPermanentDelete && !isTestUser} />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
