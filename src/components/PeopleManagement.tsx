import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePeople, useAddPerson } from "@/hooks/usePeople";
import { Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const roles = ["PM", "Konstruktér", "Kalkulant"] as const;

function RoleColumn({ role }: { role: string }) {
  const { data: people = [] } = usePeople(role);
  const addPerson = useAddPerson();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  const handleAdd = () => {
    if (!newName.trim()) return;
    addPerson.mutate({ name: newName.trim(), role }, {
      onSuccess: () => { setNewName(""); setAdding(false); },
    });
  };

  const handleRemove = async (id: string) => {
    const { error } = await supabase.from("people").update({ is_active: false }).eq("id", id);
    if (error) {
      toast({ title: "Chyba", variant: "destructive" });
    } else {
      qc.invalidateQueries({ queryKey: ["people"] });
    }
  };

  return (
    <div className="flex-1 min-w-[180px]">
      <h3 className="font-semibold text-sm mb-3 text-foreground">{role}</h3>
      <div className="space-y-1">
        {people.map((p) => (
          <div key={p.id} className="flex items-center justify-between group px-2 py-1.5 rounded hover:bg-muted/50 text-sm">
            <span>{p.name}</span>
            <button
              onClick={() => handleRemove(p.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      {adding ? (
        <div className="mt-2 flex gap-1">
          <Input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setNewName(""); } }}
            placeholder="Jméno..."
            className="h-7 text-xs"
          />
          <Button size="sm" className="h-7 px-2" onClick={handleAdd} disabled={!newName.trim()}>
            OK
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="mt-2 text-xs w-full justify-start" onClick={() => setAdding(true)}>
          <Plus className="h-3 w-3 mr-1" /> Přidat
        </Button>
      )}
    </div>
  );
}

interface PeopleManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PeopleManagement({ open, onOpenChange }: PeopleManagementProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" style={{ zIndex: 9999 }}>
        <DialogHeader>
          <DialogTitle>Správa osob</DialogTitle>
        </DialogHeader>
        <div className="flex gap-6">
          {roles.map((role) => (
            <RoleColumn key={role} role={role} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
