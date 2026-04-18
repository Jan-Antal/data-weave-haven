import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useOverheadProjects, useUpsertOverheadProject, useDeleteOverheadProject, type OverheadProject } from "@/hooks/useOverheadProjects";
import { ConfirmDialog } from "./ConfirmDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OverheadProjectsSettings({ open, onOpenChange }: Props) {
  const { data: items = [], isLoading } = useOverheadProjects();
  const upsert = useUpsertOverheadProject();
  const del = useDeleteOverheadProject();
  const [editing, setEditing] = useState<Partial<OverheadProject> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleSave = () => {
    if (!editing?.project_code?.trim() || !editing?.label?.trim()) return;
    upsert.mutate(editing as any, {
      onSuccess: () => setEditing(null),
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Režijní projekty</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Mapování interních režijních kódů z Alvena na popisné názvy. Tyto projekty jsou v Analytics oddělené od běžných projektů.
            </p>
          </DialogHeader>

          <div className="rounded-lg border bg-card max-h-[420px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/5">
                  <TableHead className="font-semibold text-xs">Kód projektu</TableHead>
                  <TableHead className="font-semibold text-xs">Název (label)</TableHead>
                  <TableHead className="font-semibold text-xs">Popis</TableHead>
                  <TableHead className="font-semibold text-xs w-20 text-center">Aktivní</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-xs">Načítání...</TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-xs py-4">Žádné režijní projekty</TableCell></TableRow>
                ) : items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell className="font-mono text-xs">{it.project_code}</TableCell>
                    <TableCell className="text-xs font-medium">{it.label}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{it.description || "—"}</TableCell>
                    <TableCell className="text-center">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${it.is_active ? "bg-green-500/15 text-green-700" : "bg-muted text-muted-foreground"}`}>
                        {it.is_active ? "Áno" : "Ne"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(it)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteId(it.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="mt-2 self-start"
            onClick={() => setEditing({ project_code: "", label: "", description: "", is_active: true, sort_order: (items.length + 1) * 10 })}
          >
            <Plus className="h-3 w-3 mr-1" /> Přidat režijní kód
          </Button>
        </DialogContent>
      </Dialog>

      {/* Edit/Add dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Upravit režijní projekt" : "Přidat režijní projekt"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Kód projektu (z Alvena)</label>
              <Input
                value={editing?.project_code || ""}
                onChange={(e) => setEditing((p) => ({ ...p, project_code: e.target.value }))}
                placeholder="Z-2511-998"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Název</label>
              <Input
                value={editing?.label || ""}
                onChange={(e) => setEditing((p) => ({ ...p, label: e.target.value }))}
                placeholder="Režije Dílna"
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Popis (volitelné)</label>
              <Input
                value={editing?.description || ""}
                onChange={(e) => setEditing((p) => ({ ...p, description: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Aktivní</label>
              <Switch
                checked={editing?.is_active ?? true}
                onCheckedChange={(v) => setEditing((p) => ({ ...p, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Zrušit</Button>
            <Button onClick={handleSave} disabled={!editing?.project_code?.trim() || !editing?.label?.trim()}>Uložit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onConfirm={() => { if (deleteId) { del.mutate(deleteId); setDeleteId(null); } }}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
}
