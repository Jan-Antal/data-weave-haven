import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePeople, useAddPerson } from "@/hooks/usePeople";
import { Plus } from "lucide-react";

interface PeopleSelectProps {
  role: "PM" | "Konstruktér" | "Kalkulant";
  value: string;
  onValueChange: (value: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PeopleSelect({ role, value, onValueChange, open, onOpenChange }: PeopleSelectProps) {
  const { data: people = [] } = usePeople(role);
  const addPerson = useAddPerson();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const handleAdd = () => {
    if (!newName.trim()) return;
    addPerson.mutate({ name: newName.trim(), role }, {
      onSuccess: (data) => {
        setAddOpen(false);
        setNewName("");
        onValueChange(data.name);
      },
    });
  };

  return (
    <>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v === "__add__") {
            setAddOpen(true);
            return;
          }
          onValueChange(v);
        }}
        open={open}
        onOpenChange={onOpenChange}
      >
        <SelectTrigger className="h-7 text-xs w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {people.map((p) => (
            <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
          ))}
          <SelectItem value="__add__" className="text-accent font-medium">
            <span className="flex items-center gap-1"><Plus className="h-3 w-3" /> Přidat osobu</span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nová osoba ({role})</DialogTitle></DialogHeader>
          <div>
            <Label>Jméno</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Zrušit</Button>
            <Button onClick={handleAdd} disabled={!newName.trim()}>Přidat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
