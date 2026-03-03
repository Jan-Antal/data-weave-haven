import { useState, useRef, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { ConfirmDialog } from "./ConfirmDialog";
import { useAllPeopleIncludingInactive, useAddPerson } from "@/hooks/usePeople";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const roles = ["PM", "Konstruktér", "Kalkulant"] as const;
type Role = (typeof roles)[number];

interface GroupedPerson {
  name: string;
  roles: Map<string, string>; // role -> id (only active roles)
}

function groupPeople(people: { id: string; name: string; role: string; is_active: boolean }[]): GroupedPerson[] {
  const map = new Map<string, GroupedPerson>();
  for (const p of people) {
    const existing = map.get(p.name);
    if (existing) {
      if (p.is_active) existing.roles.set(p.role, p.id);
    } else {
      const roles = new Map<string, string>();
      if (p.is_active) roles.set(p.role, p.id);
      map.set(p.name, { name: p.name, roles });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

interface PeopleManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PeopleManagement({ open, onOpenChange }: PeopleManagementProps) {
  const { data: allPeople = [] } = useAllPeopleIncludingInactive();
  const addPerson = useAddPerson();
  const { isAdmin, isPM, isKonstrukter } = useAuth();
  const canDelete = isAdmin || isPM;
  const canRename = isAdmin || isPM;
  const canToggleAllRoles = isAdmin || isPM;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const newInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const grouped = useMemo(() => groupPeople(allPeople), [allPeople]);

  const filtered = useMemo(() => {
    if (!search) return grouped;
    const s = search.toLowerCase();
    return grouped.filter((p) => p.name.toLowerCase().includes(s));
  }, [grouped, search]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setAddingNew(false);
      setEditingName(null);
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (addingNew) setTimeout(() => newInputRef.current?.focus(), 20);
  }, [addingNew]);

  useEffect(() => {
    if (editingName) setTimeout(() => editInputRef.current?.focus(), 20);
  }, [editingName]);

  const handleToggleRole = async (name: string, role: Role, has: boolean) => {
    if (has) {
      // Unchecking: set is_active = false on this role row
      const row = allPeople.find((p) => p.name === name && p.role === role && p.is_active);
      if (row) {
        await supabase.from("people").update({ is_active: false }).eq("id", row.id);
        qc.invalidateQueries({ queryKey: ["people"] });
      }
    } else {
      // Checking: reactivate existing inactive row or create new
      const inactiveRow = allPeople.find((p) => p.name === name && p.role === role && !p.is_active);
      if (inactiveRow) {
        await supabase.from("people").update({ is_active: true }).eq("id", inactiveRow.id);
        qc.invalidateQueries({ queryKey: ["people"] });
      } else {
        addPerson.mutate({ name, role });
      }
    }
  };

  const handleDelete = async (name: string) => {
    const rows = allPeople.filter((p) => p.name === name);
    for (const row of rows) {
      await supabase.from("people").delete().eq("id", row.id);
    }
    qc.invalidateQueries({ queryKey: ["people"] });
    setDeleteTarget(null);
  };

  const handleRename = async (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) { setEditingName(null); return; }
    const rows = allPeople.filter((p) => p.name === oldName);
    for (const row of rows) {
      await supabase.from("people").update({ name: trimmed }).eq("id", row.id);
    }
    qc.invalidateQueries({ queryKey: ["people"] });
    setEditingName(null);
  };

  const handleAddNew = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    addPerson.mutate({ name: trimmed, role: "PM" }, {
      onSuccess: () => { setNewName(""); setAddingNew(false); },
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          <div className="px-5 pt-5 pb-3 space-y-3 border-b">
            <DialogHeader>
              <DialogTitle>Správa osob</DialogTitle>
            </DialogHeader>
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Hledat osobu..."
              className="h-8 text-sm"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Jméno</TableHead>
                  {roles.map((r) => (
                    <TableHead key={r} className="w-[100px] text-center">{r}</TableHead>
                  ))}
                  {canDelete && <TableHead className="w-[48px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((person) => (
                  <TableRow key={person.name}>
                    <TableCell className="py-2 px-4">
                      {canRename && editingName === person.name ? (
                        <Input
                          ref={editInputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(person.name, editValue);
                            if (e.key === "Escape") setEditingName(null);
                          }}
                          onBlur={() => handleRename(person.name, editValue)}
                          className="h-7 text-sm px-2"
                        />
                      ) : (
                        <span
                          className={`text-sm ${canRename ? "cursor-pointer hover:underline" : ""}`}
                          onClick={() => { if (canRename) { setEditingName(person.name); setEditValue(person.name); } }}
                        >
                          {person.name}
                        </span>
                      )}
                    </TableCell>
                    {roles.map((role) => {
                      const has = person.roles.has(role);
                      const canToggle = canToggleAllRoles || (isKonstrukter && role === "Konstruktér");
                      return (
                        <TableCell key={role} className="py-2 px-4 text-center">
                          <Checkbox
                            checked={has}
                            onCheckedChange={() => canToggle && handleToggleRole(person.name, role, has)}
                            disabled={!canToggle}
                          />
                        </TableCell>
                      );
                    })}
                    {canDelete && (
                      <TableCell className="py-2 px-2">
                        <button
                          onClick={() => setDeleteTarget(person.name)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {addingNew && (
                  <TableRow>
                    <TableCell className="py-2 px-4" colSpan={5}>
                      <div className="flex gap-2">
                        <Input
                          ref={newInputRef}
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddNew();
                            if (e.key === "Escape") { setAddingNew(false); setNewName(""); }
                          }}
                          placeholder="Jméno nové osoby..."
                          className="h-7 text-sm max-w-[250px]"
                        />
                        <Button size="sm" className="h-7 px-3" onClick={handleAddNew} disabled={!newName.trim()}>
                          Přidat
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {filtered.length === 0 && !addingNew && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-sm">
                      Žádné výsledky
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="px-5 py-3 border-t">
            {!addingNew && (
              <Button variant="outline" size="sm" className="text-sm" onClick={() => setAddingNew(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Přidat osobu
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        title="Smazat osobu?"
        description={`Opravdu chcete smazat osobu "${deleteTarget}"? Bude odebrána ze všech skupin.`}
      />
    </>
  );
}
