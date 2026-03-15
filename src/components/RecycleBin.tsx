import { useState } from "react";
import { logActivity } from "@/lib/activityLog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { differenceInDays, format } from "date-fns";
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
      if (table === "tpv_items") {
        const { data, error } = await (supabase
          .from("tpv_items")
          .select("*") as any)
          .not("deleted_at", "is", null)
          .order("deleted_at", { ascending: false });
        if (error) throw error;
        const projectIds = [...new Set((data as any[]).map((r: any) => r.project_id))];
        let projectMap: Record<string, string> = {};
        if (projectIds.length > 0) {
          const { data: projects } = await supabase
            .from("projects")
            .select("project_id, project_name")
            .in("project_id", projectIds);
          if (projects) {
            for (const p of projects) {
              projectMap[p.project_id] = p.project_name;
            }
          }
        }
        return (data as any[]).map((r: any) => ({
          ...r,
          _project_name: projectMap[r.project_id] || r.project_id,
        }));
      }
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

function getExpiryInfo(deletedAt: string) {
  const daysLeft = 30 - differenceInDays(new Date(), new Date(deletedAt));
  if (daysLeft <= 1) return { text: "⚠ Vymaže se zítra", className: "text-destructive font-medium" };
  if (daysLeft <= 7) return { text: `⚠ Vymaže se za ${daysLeft} dní`, className: "text-amber-600 font-medium" };
  return { text: `Vymaže se za ${daysLeft} dní`, className: "text-muted-foreground" };
}

function RecordRow({
  record,
  table,
  nameField,
  idField,
  canPermanentDelete,
  isTPV,
}: {
  record: any;
  table: string;
  nameField: string;
  idField?: string;
  canPermanentDelete: boolean;
  isTPV?: boolean;
}) {
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deletedAt = record.deleted_at ? format(new Date(record.deleted_at), "dd-MMM-yy HH:mm") : "";
  const expiry = record.deleted_at ? getExpiryInfo(record.deleted_at) : null;

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

  // Build display name
  let displayName: React.ReactNode;
  if (isTPV) {
    displayName = (
      <>
        <span className="font-bold">{record.item_name}</span>
        {record.item_type && <span className="text-muted-foreground"> — {record.item_type}</span>}
      </>
    );
  } else {
    displayName = idField ? `${record[idField]} — ${record[nameField]}` : record[nameField];
  }

  return (
    <div className="flex items-start gap-3 py-3 px-3 border-b last:border-b-0">
      {/* Left: info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{displayName}</p>
        {isTPV && record._project_name && (
          <p className="text-xs text-muted-foreground mt-0.5">Projekt: {record._project_name}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-muted-foreground">Smazáno: {deletedAt}</span>
          {expiry && <span className={`text-xs ${expiry.className}`}>{expiry.text}</span>}
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1 shrink-0 pt-1">
        {!confirmDelete ? (
          <>
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={handleRestore}>
              <RotateCcw className="h-3 w-3 mr-1" /> Obnovit
            </Button>
            {canPermanentDelete && (
              <Button size="sm" className="h-9 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3 w-3 mr-1" /> Trvale smazat
              </Button>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-destructive whitespace-nowrap">Opravdu smazat?</span>
            <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setConfirmDelete(false)}>Zrušit</Button>
            <Button size="sm" className="h-9 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={handlePermanentDelete}>Potvrdit</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function RecordList({
  table,
  nameField,
  idField,
  emptyText,
  canPermanentDelete,
  isTPV,
}: {
  table: string;
  nameField: string;
  idField?: string;
  emptyText: string;
  canPermanentDelete: boolean;
  isTPV?: boolean;
}) {
  const { data: records = [], isLoading } = useDeletedRecords(table);

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Načítání...</p>;
  if (records.length === 0) return <p className="text-sm text-muted-foreground p-4">{emptyText}</p>;

  return (
    <div className="border rounded-lg max-h-[400px] overflow-y-auto">
      {records.map((r) => (
        <RecordRow key={r.id} record={r} table={table} nameField={nameField} idField={idField} canPermanentDelete={canPermanentDelete} isTPV={isTPV} />
      ))}
    </div>
  );
}

export function RecycleBin({ open, onOpenChange }: RecycleBinProps) {
  const { canPermanentDelete, isKonstrukter, isAdmin, isTestUser } = useAuth();

  const defaultTab = isKonstrukter ? "tpv" : "projects";
  const canPermDeleteProjectsStages = isAdmin && !isTestUser;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Koš</DialogTitle>
          <p className="text-xs text-muted-foreground">Položky se automaticky mažou po 30 dnech</p>
        </DialogHeader>
        {isTestUser && <TestModeBanner />}
        <div className={isTestUser ? "pointer-events-none opacity-80" : ""}>
          <Tabs defaultValue={defaultTab} className="space-y-3">
            <TabsList className="w-full flex">
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
              <RecordList table="tpv_items" nameField="item_name" emptyText="Žádné smazané TPV položky" canPermanentDelete={canPermanentDelete && !isTestUser} isTPV />
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
