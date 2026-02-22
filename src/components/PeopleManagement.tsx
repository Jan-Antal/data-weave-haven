import { useState, useRef, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "./ConfirmDialog";
import { useAllPeople, useAddPerson } from "@/hooks/usePeople";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const roles = ["PM", "Konstruktér", "Kalkulant"] as const;
type Role = (typeof roles)[number];

interface GroupedPerson {
  name: string;
  roles: { role: string; id: string }[];
}

function groupPeople(people: { id: string; name: string; role: string }[]): GroupedPerson[] {
  const map = new Map<string, GroupedPerson>();
  for (const p of people) {
    const existing = map.get(p.name);
    if (existing) {
      existing.roles.push({ role: p.role, id: p.id });
    } else {
      map.set(p.name, { name: p.name, roles: [{ role: p.role, id: p.id }] });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

function PersonRow({
  person,
  onToggleRole,
  onDelete,
  onRename,
}: {
  person: GroupedPerson;
  onToggleRole: (name: string, role: Role, has: boolean) => void;
  onDelete: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(person.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setEditValue(person.name);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [editing, person.name]);

  const confirmEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== person.name) {
      onRename(person.name, trimmed);
    }
    setEditing(false);
  };

  const personRoles = person.roles.map((r) => r.role);

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 group text-sm">
      <div className="flex-1 min-w-0">
        {editing ? (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmEdit();
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={confirmEdit}
            className="h-6 text-xs px-1"
          />
        ) : (
          <span
            className="cursor-pointer hover:underline truncate block"
            onClick={() => setEditing(true)}
          >
            {person.name}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {roles.map((r) => (
          personRoles.includes(r) ? (
            <Badge key={r} variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
              {r}
            </Badge>
          ) : null
        ))}
      </div>
      <button
        onClick={() => onDelete(person.name)}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive flex-shrink-0"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function RoleColumn({
  role,
  people,
  activeFilter,
  onFilterClick,
  onToggle,
}: {
  role: Role;
  people: GroupedPerson[];
  activeFilter: Role | null;
  onFilterClick: (role: Role) => void;
  onToggle: (name: string, role: Role, has: boolean) => void;
}) {
  const isFilterActive = activeFilter === role;

  return (
    <div className="flex-1 min-w-0">
      <button
        onClick={() => onFilterClick(role)}
        className={cn(
          "font-semibold text-xs mb-2 px-2 py-1 rounded w-full text-left transition-colors",
          isFilterActive
            ? "bg-primary text-primary-foreground"
            : "hover:bg-muted/60 text-foreground"
        )}
      >
        {role}
      </button>
      <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
        {people.map((p) => {
          const has = p.roles.some((r) => r.role === role);
          return (
            <label
              key={p.name}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40 cursor-pointer text-xs"
            >
              <Checkbox
                checked={has}
                onCheckedChange={() => onToggle(p.name, role, has)}
                className="h-3.5 w-3.5"
              />
              <span className="truncate">{p.name}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

interface PeopleManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PeopleManagement({ open, onOpenChange }: PeopleManagementProps) {
  const { data: allPeople = [] } = useAllPeople();
  const addPerson = useAddPerson();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const newInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const grouped = useMemo(() => groupPeople(allPeople), [allPeople]);

  const filteredLeft = useMemo(() => {
    let list = grouped;
    if (roleFilter) {
      list = list.filter((p) => p.roles.some((r) => r.role === roleFilter));
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(s));
    }
    return list;
  }, [grouped, search, roleFilter]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setRoleFilter(null);
      setAddingNew(false);
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (addingNew) setTimeout(() => newInputRef.current?.focus(), 20);
  }, [addingNew]);

  const handleToggleRole = async (name: string, role: Role, has: boolean) => {
    if (has) {
      // Remove: find the row for this name+role and deactivate
      const row = allPeople.find((p) => p.name === name && p.role === role);
      if (row) {
        await supabase.from("people").update({ is_active: false }).eq("id", row.id);
        qc.invalidateQueries({ queryKey: ["people"] });
      }
    } else {
      // Add: insert new row
      addPerson.mutate({ name, role });
    }
  };

  const handleDelete = async (name: string) => {
    const rows = allPeople.filter((p) => p.name === name);
    for (const row of rows) {
      await supabase.from("people").update({ is_active: false }).eq("id", row.id);
    }
    qc.invalidateQueries({ queryKey: ["people"] });
    setDeleteTarget(null);
  };

  const handleRename = async (oldName: string, newName: string) => {
    const rows = allPeople.filter((p) => p.name === oldName);
    for (const row of rows) {
      await supabase.from("people").update({ name: newName }).eq("id", row.id);
    }
    qc.invalidateQueries({ queryKey: ["people"] });
  };

  const handleAddNew = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    // Add as PM by default (user can toggle roles after)
    addPerson.mutate({ name: trimmed, role: "PM" }, {
      onSuccess: () => { setNewName(""); setAddingNew(false); },
    });
  };

  const handleFilterClick = (role: Role) => {
    setRoleFilter((prev) => (prev === role ? null : role));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] p-0 overflow-hidden" style={{ zIndex: 9999 }}>
          <div className="flex h-full">
            {/* LEFT PANEL */}
            <div className="flex-[2] border-r flex flex-col min-w-0">
              <div className="px-4 pt-4 pb-2 border-b space-y-2">
                <DialogHeader>
                  <DialogTitle className="text-base">Osoby</DialogTitle>
                </DialogHeader>
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Hledat osobu..."
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex-1 overflow-y-auto px-2 py-1">
                {filteredLeft.map((person) => (
                  <PersonRow
                    key={person.name}
                    person={person}
                    onToggleRole={handleToggleRole}
                    onDelete={(name) => setDeleteTarget(name)}
                    onRename={handleRename}
                  />
                ))}
                {filteredLeft.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-4">Žádné výsledky</div>
                )}
              </div>
              <div className="px-3 py-2 border-t">
                {addingNew ? (
                  <div className="flex gap-1">
                    <Input
                      ref={newInputRef}
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddNew();
                        if (e.key === "Escape") { setAddingNew(false); setNewName(""); }
                      }}
                      placeholder="Jméno nové osoby..."
                      className="h-7 text-xs"
                    />
                    <Button size="sm" className="h-7 px-3" onClick={handleAddNew} disabled={!newName.trim()}>
                      OK
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" className="text-xs w-full justify-start" onClick={() => setAddingNew(true)}>
                    <Plus className="h-3 w-3 mr-1" /> Přidat osobu
                  </Button>
                )}
              </div>
            </div>

            {/* RIGHT PANEL */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-4 pt-4 pb-2 border-b">
                <h3 className="font-semibold text-sm text-foreground">Skupiny</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Kliknutím na hlavičku filtrujte seznam</p>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2 flex gap-3">
                {roles.map((role) => (
                  <RoleColumn
                    key={role}
                    role={role}
                    people={grouped}
                    activeFilter={roleFilter}
                    onFilterClick={handleFilterClick}
                    onToggle={handleToggleRole}
                  />
                ))}
              </div>
            </div>
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
