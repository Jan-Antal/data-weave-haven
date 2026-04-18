import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "@/hooks/use-toast";
import { SectionToolbar } from "@/components/shell/SectionToolbar";

const ROLE_OPTIONS = ["PM", "Konstruktér", "Kalkulant", "Architekt"] as const;

interface ExternalRow {
  id: string;
  name: string;
  role: string;
  firma: string | null;
  is_active: boolean;
  is_external: boolean;
}

function useExternals() {
  return useQuery({
    queryKey: ["people", "externals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("people")
        .select("id, name, role, firma, is_active, is_external")
        .eq("is_external", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as any as ExternalRow[];
    },
  });
}

export function OsobyExternisti() {
  const qc = useQueryClient();
  const { data: rows = [] } = useExternals();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newRow, setNewRow] = useState({ name: "", firma: "", role: "PM" });
  const [deleteFor, setDeleteFor] = useState<{ id: string; name: string } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.name.toLowerCase().includes(q) ||
      (r.firma ?? "").toLowerCase().includes(q) ||
      r.role.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const updateField = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ExternalRow> }) => {
      const { error } = await supabase.from("people").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["people"] }),
    onError: (e: any) => toast({ title: "Chyba", description: e.message, variant: "destructive" }),
  });

  const addExternal = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("people")
        .insert({
          name: newRow.name.trim(),
          role: newRow.role,
          firma: newRow.firma.trim() || null,
          is_external: true,
          is_active: true,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["people"] });
      setAddOpen(false);
      setNewRow({ name: "", firma: "", role: "PM" });
      toast({ title: "Externista přidán" });
    },
    onError: (e: any) => toast({ title: "Chyba", description: e.message, variant: "destructive" }),
  });

  const deleteExternal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("people").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["people"] });
      toast({ title: "Externista smazán" });
    },
  });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-card">
      <SectionToolbar
        left={
          <span className="text-xs text-muted-foreground">
            {rows.length} externistů
          </span>
        }
        right={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hledat externistu nebo firmu…"
                className="pl-8 h-8 w-[260px] text-xs"
              />
            </div>
            <Button size="sm" className="h-8" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Přidat externistu
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead className="w-[220px]">Jméno</TableHead>
              <TableHead className="w-[200px]">Firma</TableHead>
              <TableHead className="w-[140px]">Role</TableHead>
              <TableHead className="w-[100px]">Aktivní</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Input
                    defaultValue={r.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== r.name) updateField.mutate({ id: r.id, patch: { name: v } });
                    }}
                    className="h-8 text-sm"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    defaultValue={r.firma ?? ""}
                    placeholder="—"
                    onBlur={(e) => {
                      const v = e.target.value.trim() || null;
                      if (v !== (r.firma ?? null)) updateField.mutate({ id: r.id, patch: { firma: v as any } });
                    }}
                    className="h-8 text-sm"
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={r.role}
                    onValueChange={(v) => updateField.mutate({ id: r.id, patch: { role: v } })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={r.is_active}
                    onCheckedChange={(v) => updateField.mutate({ id: r.id, patch: { is_active: v } })}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteFor({ id: r.id, name: r.name })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  Žádní externisté nenalezeni.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Přidat externistu</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Jméno</Label>
              <Input value={newRow.name} onChange={(e) => setNewRow({ ...newRow, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Firma</Label>
              <Input value={newRow.firma} onChange={(e) => setNewRow({ ...newRow, firma: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={newRow.role} onValueChange={(v) => setNewRow({ ...newRow, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Zrušit</Button>
            <Button onClick={() => addExternal.mutate()} disabled={!newRow.name.trim() || addExternal.isPending}>
              Přidat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteFor}
        onConfirm={() => { if (deleteFor) deleteExternal.mutate(deleteFor.id); setDeleteFor(null); }}
        onCancel={() => setDeleteFor(null)}
        title="Smazat externistu?"
        description={deleteFor ? `Opravdu smazat "${deleteFor.name}"?` : ""}
      />
    </div>
  );
}
