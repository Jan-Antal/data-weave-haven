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
import { Plus, Trash2, KeyRound } from "lucide-react";
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState("");

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

  const handleAddUser = async () => {
    const errors: Record<string, string> = {};
    if (!newUser.full_name.trim()) errors.full_name = "Jméno je povinné";
    if (!newUser.email.trim()) errors.email = "Email je povinný";
    if (!newUser.password.trim()) errors.password = "Heslo je povinné";
    if (!newUser.role) errors.role = "Role je povinná";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: newUser.email.trim(),
          password: newUser.password,
          full_name: newUser.full_name.trim(),
          role: newUser.role,
        },
      });

      if (error) {
        setSubmitError(error.message || "Chyba při vytváření uživatele");
      } else if (data?.error) {
        setSubmitError(data.error);
      } else {
        toast({ title: "Uživatel vytvořen" });
        setAddOpen(false);
        setNewUser({ full_name: "", email: "", password: "", role: "viewer" });
        setFieldErrors({});
        fetchUsers();
      }
    } catch (e: any) {
      setSubmitError(e.message || "Neočekávaná chyba");
    } finally {
      setSubmitting(false);
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

  const handleResetPassword = async () => {
    if (!resetTarget || !resetPassword.trim()) {
      setResetError("Heslo je povinné");
      return;
    }
    setResetSubmitting(true);
    setResetError("");
    try {
      const { data, error } = await supabase.functions.invoke("update-user", {
        body: { user_id: resetTarget, password: resetPassword },
      });
      if (error || data?.error) {
        setResetError(data?.error || error?.message || "Chyba při změně hesla");
      } else {
        toast({ title: "Heslo bylo změněno" });
        setResetTarget(null);
        setResetPassword("");
      }
    } catch (e: any) {
      setResetError(e.message || "Neočekávaná chyba");
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
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
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Načítání...</TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">Žádní uživatelé</TableCell>
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
                      <TableCell className="flex gap-1">
                        <button
                          onClick={() => { setResetTarget(u.id); setResetPassword(""); setResetError(""); }}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="Reset hesla"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
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
        <DialogContent className="z-[99999]" style={{ zIndex: 99999 }}>
          <DialogHeader>
            <DialogTitle>Nový uživatel</DialogTitle>
          </DialogHeader>
          {submitError && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
              {submitError}
            </div>
          )}
          <div className="grid gap-3">
            <div>
              <Label>Celé jméno</Label>
              <Input value={newUser.full_name} onChange={(e) => { setNewUser((s) => ({ ...s, full_name: e.target.value })); setFieldErrors((f) => ({ ...f, full_name: "" })); }} className={fieldErrors.full_name ? "border-destructive" : ""} />
              {fieldErrors.full_name && <p className="text-xs text-destructive mt-1">{fieldErrors.full_name}</p>}
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={newUser.email} onChange={(e) => { setNewUser((s) => ({ ...s, email: e.target.value })); setFieldErrors((f) => ({ ...f, email: "" })); }} className={fieldErrors.email ? "border-destructive" : ""} />
              {fieldErrors.email && <p className="text-xs text-destructive mt-1">{fieldErrors.email}</p>}
            </div>
            <div>
              <Label>Heslo</Label>
              <Input type="password" value={newUser.password} onChange={(e) => { setNewUser((s) => ({ ...s, password: e.target.value })); setFieldErrors((f) => ({ ...f, password: "" })); }} className={fieldErrors.password ? "border-destructive" : ""} />
              {fieldErrors.password && <p className="text-xs text-destructive mt-1">{fieldErrors.password}</p>}
            </div>
            <div>
              <Label>Role</Label>
              <Select value={newUser.role} onValueChange={(v) => { setNewUser((s) => ({ ...s, role: v as AppRole })); setFieldErrors((f) => ({ ...f, role: "" })); }}>
                <SelectTrigger className={fieldErrors.role ? "border-destructive" : ""}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.role && <p className="text-xs text-destructive mt-1">{fieldErrors.role}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => { setAddOpen(false); setFieldErrors({}); setSubmitError(""); }}>Zrušit</Button>
            <Button onClick={handleAddUser} disabled={submitting}>
              {submitting ? "Vytvářím..." : "Vytvořit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetTarget !== null} onOpenChange={(v) => { if (!v) { setResetTarget(null); setResetPassword(""); setResetError(""); } }}>
        <DialogContent className="z-[99999] max-w-sm" style={{ zIndex: 99999 }}>
          <DialogHeader>
            <DialogTitle>Reset hesla</DialogTitle>
          </DialogHeader>
          {resetError && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded px-3 py-2">
              {resetError}
            </div>
          )}
          <div>
            <Label>Nové heslo</Label>
            <Input
              type="text"
              value={resetPassword}
              onChange={(e) => { setResetPassword(e.target.value); setResetError(""); }}
              placeholder="Zadejte nové heslo..."
            />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => { setResetTarget(null); setResetPassword(""); setResetError(""); }}>Zrušit</Button>
            <Button onClick={handleResetPassword} disabled={resetSubmitting || !resetPassword.trim()}>
              {resetSubmitting ? "Ukládám..." : "Uložit nové heslo"}
            </Button>
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
