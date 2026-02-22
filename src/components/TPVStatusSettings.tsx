import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTPVStatusOptions, useAddTPVStatusOption, useUpdateTPVStatusOption, useDeleteTPVStatusOption } from "@/hooks/useTPVStatusOptions";
import { ConfirmDialog } from "./ConfirmDialog";
import { Trash2, Plus } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TPVStatusSettings({ open, onOpenChange }: Props) {
  const { data: options = [], isLoading } = useTPVStatusOptions();
  const addOption = useAddTPVStatusOption();
  const updateOption = useUpdateTPVStatusOption();
  const deleteOption = useDeleteTPVStatusOption();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleStartEdit = (id: string, label: string) => {
    setEditingId(id);
    setEditValue(label);
  };

  const handleSaveEdit = (id: string) => {
    if (editValue.trim()) {
      updateOption.mutate({ id, label: editValue.trim() });
    }
    setEditingId(null);
  };

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    addOption.mutate({ label: newLabel.trim(), sort_order: options.length + 1 });
    setNewLabel("");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Správa TPV statusů</DialogTitle>
          </DialogHeader>
          <div className="rounded border overflow-auto max-h-[50vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground">Načítání...</TableCell></TableRow>
                ) : options.map((opt) => (
                  <TableRow key={opt.id}>
                    <TableCell>
                      {editingId === opt.id ? (
                        <Input
                          className="h-7 text-xs"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => handleSaveEdit(opt.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveEdit(opt.id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <span
                          className="text-xs cursor-pointer hover:underline"
                          onClick={() => handleStartEdit(opt.id, opt.label)}
                        >
                          {opt.label}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDeleteId(opt.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex gap-2">
            <Input
              className="h-8 text-xs"
              placeholder="Nový status..."
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button size="sm" onClick={handleAdd} disabled={!newLabel.trim()}>
              <Plus className="h-3 w-3 mr-1" /> Přidat
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onConfirm={() => {
          if (deleteId) deleteOption.mutate(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
        description="Smazat tento status?"
      />
    </>
  );
}
