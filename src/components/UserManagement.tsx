import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "./ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import type { AppRole } from "@/hooks/useAuth";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  role: AppRole | null;
}

const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  pm: "PM",
  konstrukter: "Konstruktér",
  viewer: "Viewer",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserManagement({ open, onOpenChange }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ full_name: "", email: "", password: "", role: "viewer" as AppRole });

  const fetchUsers = async () => {
    setLoading(true);
    const { data: profiles } = await supabase.from("profiles").select("*").order("full_name");
    const { data: roles } = await supabase.from("user_roles").select("*");

    if (profiles) {
      const roleMap = new Map<string, AppRole>();
      roles?.forEach((r: any) => roleMap.set(r.user_id, r.role));
      setUsers(
        profiles.map((p: any) => ({
          id: p.id,
          email: p.email,
          full_name: p.full_name,
          is_active: p.is_active,
          role: roleMap.get(p.id) ?? null,
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchUsers();
  }, [open]);

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.full_name) return;

    const { data, error } = await supabase.functions.invoke("create-user", {
      body: {
        email: newUser.email,
        password: newUser.password,
        full_name: newUser.full_name,
        role: newUser.role,
      },
    });

    if (error || data?.error) {
      toast({ title: "Chyba", description: data?.error || error?.message, variant: "destructive" });
    } else {
      toast({ title: "Uživatel vytvořen" });
      setAddOpen(false);
      setNewUser({ full_name: "", email: "", password: "", role: "viewer" });
      fetchUsers();
    }
  };

  const handleUpdateRole = async (userId: string, role: AppRole) => {
    const { data, error } = await supabase.functions.invoke("update-user", {
      body: { user_id: userId, role },
    });
    if (error || data?.error) {
      toast({ title: "Chyba", variant: "destructive" });
    } else {
      toast({ title: "Role změněna" });
      fetchUsers();
    }
  };

  const handleToggleActive = async (userId: string, is_active: boolean) => {
    const { data, error } = await supabase.functions.invoke("update-user", {
      body: { user_id: userId, is_active },
    });
    if (error || data?.error) {
      toast({ title: "Chyba", variant: "destructive" });
    } else {
      toast({ title: is_active ? "Uživatel aktivován" : "Uživatel deaktivován" });
      fetchUsers();
    }
  };

  const handleDelete = async (userId: string) => {
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { user_id: userId },
    });
    if (error || data?.error) {
      toast({ title: "Chyba", variant: "destructive" });
    } else {
      toast({ title: "Uživatel smazán" });
      setDeleteTarget(null);
      fetchUsers();
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden" style={{ zIndex: 9999 }}>
          <div className="px-5 pt-5 pb-3 border-b">
            <DialogHeader>
              <DialogTitle>Správa uživatelů</DialogTitle>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px]">Jméno</TableHead>
                  <TableHead className="min-w-[180px]">Email</TableHead>
                  <TableHead className="w-[140px]">Role</TableHead>
                  <TableHead className="w-[80px] text-center">Aktivní</TableHead>
                  <TableHead className="w-[48px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Načítání...</TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Žádní uživatelé</TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="text-sm">{u.full_name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Select value={u.role ?? ""} onValueChange={(v) => handleUpdateRole(u.id, v as AppRole)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
                              <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch checked={u.is_active} onCheckedChange={(v) => handleToggleActive(u.id, v)} />
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => setDeleteTarget(u.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="px-5 py-3 border-t">
            <Button variant="outline" size="sm" className="text-sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Přidat uživatele
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent style={{ zIndex: 10000 }}>
          <DialogHeader>
            <DialogTitle>Nový uživatel</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Celé jméno</Label>
              <Input value={newUser.full_name} onChange={(e) => setNewUser((s) => ({ ...s, full_name: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={newUser.email} onChange={(e) => setNewUser((s) => ({ ...s, email: e.target.value }))} />
            </div>
            <div>
              <Label>Heslo</Label>
              <Input type="password" value={newUser.password} onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser((s) => ({ ...s, role: v as AppRole }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setAddOpen(false)}>Zrušit</Button>
            <Button onClick={handleAddUser} disabled={!newUser.email || !newUser.password || !newUser.full_name}>Vytvořit</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        title="Smazat uživatele?"
        description="Uživatel bude trvale smazán."
      />
    </>
  );
}
