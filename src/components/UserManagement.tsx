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
import { Plus, Trash2, ArrowRightLeft, Link2, Lock, Eye, EyeOff } from "lucide-react";
import type { AppRole } from "@/hooks/useAuth";
import { PasswordChecklist } from "@/components/PasswordChecklist";
import { usePasswordValidation } from "@/hooks/usePasswordValidation";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  role: AppRole | null;
  person_id: string | null;
}

interface PersonOption {
  id: string;
  name: string;
}

const ROLE_LABELS: Record<AppRole, string> = {
  owner: "Owner",
  admin: "Admin",
  pm: "PM",
  konstrukter: "Konstruktér",
  viewer: "Viewer",
};

// Roles assignable via dropdown (owner excluded — can only be set via transfer)
const ASSIGNABLE_ROLES: AppRole[] = ["admin", "pm", "konstrukter", "viewer"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserManagement({ open, onOpenChange }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ full_name: "", email: "", role: "viewer" as AppRole });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string>("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [copyingLinkId, setCopyingLinkId] = useState<string | null>(null);
  const [sendingAuthEmailId, setSendingAuthEmailId] = useState<string | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<{ id: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const handleCopyInviteLink = async (userId: string) => {
    setCopyingLinkId(userId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-invite-link", {
        body: { user_id: userId, origin_url: window.location.origin },
      });
      if (error || data?.error) {
        toast({ title: "Chyba", description: data?.error || error?.message, variant: "destructive" });
      } else if (data?.link) {
        await navigator.clipboard.writeText(data.link);
        toast({ title: "Odkaz zkopírován do schránky" });
      }
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    } finally {
      setCopyingLinkId(null);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }, { data: peopleData }] = await Promise.all([
      supabase.from("profiles").select("*").order("full_name"),
      supabase.from("user_roles").select("*"),
      supabase.from("people").select("id, name").eq("is_active", true).order("name"),
    ]);

    if (peopleData) {
      const uniqueMap = new Map<string, PersonOption>();
      peopleData.forEach((p: any) => {
        if (!uniqueMap.has(p.name)) uniqueMap.set(p.name, { id: p.id, name: p.name });
      });
      setPeople(Array.from(uniqueMap.values()).sort((a, b) => a.name.localeCompare(b.name, "cs")));
    }

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
          person_id: p.person_id ?? null,
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchUsers();
  }, [open]);

  const handleAddUser = async () => {
    const errors: Record<string, string> = {};
    if (!newUser.full_name.trim()) errors.full_name = "Jméno je povinné";
    if (!newUser.email.trim()) errors.email = "Email je povinný";
    if (!newUser.role) errors.role = "Role je povinná";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setSubmitError("");

    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email: newUser.email.trim(),
          full_name: newUser.full_name.trim(),
          role: newUser.role,
          origin_url: window.location.origin,
        },
      });

      if (error) {
        setSubmitError(error.message || "Chyba při vytváření uživatele");
      } else if (data?.error) {
        setSubmitError(data.error);
      } else {
        // Auto-copy the invite link returned from create-user
        if (data?.link) {
          await navigator.clipboard.writeText(data.link);
          toast({ title: `Uživatel vytvořen. Odkaz zkopírován do schránky.`, description: `Odešlete odkaz uživateli ${newUser.email.trim()}` });
        } else {
          toast({ title: `Uživatel vytvořen: ${newUser.email.trim()}` });
        }
        setAddOpen(false);
        setNewUser({ full_name: "", email: "", role: "viewer" });
        setFieldErrors({});
        fetchUsers();
      }
    } catch (e: any) {
      setSubmitError(e.message || "Neočekávaná chyba");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePerson = async (userId: string, personId: string | null) => {
    const { error } = await supabase.from("profiles").update({ person_id: personId } as any).eq("id", userId);
    if (error) {
      toast({ title: "Chyba", variant: "destructive" });
    } else {
      toast({ title: "Osoba přiřazena" });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, person_id: personId } : u));
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

  const handleSendAccessEmail = async (userId: string) => {
    setSendingAuthEmailId(userId);

    try {
      const { data, error } = await supabase.functions.invoke("generate-invite-link", {
        body: {
          user_id: userId,
          origin_url: window.location.origin,
          mode: "send_email",
        },
      });

      if (error || data?.error) {
        toast({ title: "Chyba", description: data?.error || error?.message, variant: "destructive" });
        return;
      }

      if (data?.link) {
        await navigator.clipboard.writeText(data.link);
        toast({ title: "Odkaz zkopírován do schránky", description: `Odešlete odkaz uživateli ${data.email}` });
      } else {
        toast({ title: "Odkaz vygenerován" });
      }
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    } finally {
      setSendingAuthEmailId(null);
    }
  };

  const handleTransferOwnership = async () => {
    if (!transferTarget) return;
    setTransferSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-user", {
        body: { transfer_ownership_to: transferTarget },
      });
      if (error || data?.error) {
        toast({ title: "Chyba", description: data?.error || error?.message, variant: "destructive" });
      } else {
        toast({ title: "Vlastnictví předáno" });
        setTransferOpen(false);
        setTransferTarget("");
        fetchUsers();
      }
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordTarget) return;
    setPasswordSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("update-user", {
        body: { user_id: passwordTarget.id, password: newPassword },
      });
      if (error || data?.error) {
        toast({ title: "Chyba", description: data?.error || error?.message, variant: "destructive" });
      } else {
        toast({ title: "Heslo změněno" });
        setPasswordTarget(null);
        setNewPassword("");
        setShowNewPassword(false);
      }
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const isOwner = (u: UserRow) => u.role === "owner";
  const nonOwnerUsers = users.filter((u) => u.role !== "owner");

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} modal={true}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
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
                  <TableHead className="min-w-[160px]">Email</TableHead>
                  <TableHead className="w-[130px]">Role</TableHead>
                  <TableHead className="w-[160px]">Osoba</TableHead>
                  <TableHead className="w-[70px] text-center">Aktivní</TableHead>
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
                        {isOwner(u) ? (
                          <span className="inline-flex items-center h-8 px-3 text-xs font-semibold text-primary">Owner</span>
                        ) : (
                          <Select value={u.role ?? ""} onValueChange={(v) => handleUpdateRole(u.id, v as AppRole)}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ASSIGNABLE_ROLES.map((r) => (
                                <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={u.person_id ?? "__none__"}
                          onValueChange={(v) => handleUpdatePerson(u.id, v === "__none__" ? null : v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Nepřiřazeno —</SelectItem>
                            {people.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        {isOwner(u) ? (
                          <Switch checked={true} disabled />
                        ) : (
                          <Switch checked={u.is_active} onCheckedChange={(v) => handleToggleActive(u.id, v)} />
                        )}
                      </TableCell>
                        <TableCell className="flex gap-1">
                        <button
                          onClick={() => handleCopyInviteLink(u.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="Kopírovat odkaz pozvánky"
                          disabled={copyingLinkId === u.id}
                        >
                          <Link2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => { setPasswordTarget({ id: u.id, name: u.full_name || u.email }); setNewPassword(""); setShowNewPassword(false); }}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="Změnit heslo"
                        >
                          <Lock className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleSendAccessEmail(u.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          title="Znovu odeslat přístupový email"
                          disabled={sendingAuthEmailId === u.id}
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        {isOwner(u) ? (
                          <button
                            onClick={() => { setTransferOpen(true); setTransferTarget(""); }}
                            className="text-muted-foreground hover:text-primary transition-colors"
                            title="Předat vlastnictví"
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setDeleteTarget(u.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
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
      <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) { setFieldErrors({}); setSubmitError(""); } }}>
        <DialogContent className="max-w-md">
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
              <Label>Role</Label>
              <Select value={newUser.role} onValueChange={(v) => { setNewUser((s) => ({ ...s, role: v as AppRole })); setFieldErrors((f) => ({ ...f, role: "" })); }}>
                <SelectTrigger className={fieldErrors.role ? "border-destructive" : ""}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
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
              {submitting ? "Odesílám..." : "Odeslat pozvánku"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Transfer Ownership Dialog */}
      <Dialog open={transferOpen} onOpenChange={(v) => { if (!v) { setTransferOpen(false); setTransferTarget(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Předat vlastnictví</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Vyberte uživatele, kterému chcete předat roli Owner. Vaše role bude změněna na Admin.
          </p>
          <div>
            <Label>Nový Owner</Label>
            <Select value={transferTarget} onValueChange={setTransferTarget}>
              <SelectTrigger>
                <SelectValue placeholder="Vyberte uživatele..." />
              </SelectTrigger>
              <SelectContent>
                {nonOwnerUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => { setTransferOpen(false); setTransferTarget(""); }}>Zrušit</Button>
            <Button onClick={handleTransferOwnership} disabled={transferSubmitting || !transferTarget}>
              {transferSubmitting ? "Předávám..." : "Předat vlastnictví"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Change Password Dialog */}
      <PasswordChangeDialog
        target={passwordTarget}
        onOpenChange={(open) => { if (!open) { setPasswordTarget(null); setNewPassword(""); setShowNewPassword(false); } }}
        password={newPassword}
        onPasswordChange={setNewPassword}
        showPassword={showNewPassword}
        onToggleShow={() => setShowNewPassword(!showNewPassword)}
        onSubmit={handleChangePassword}
        submitting={passwordSubmitting}
      />

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

function PasswordChangeDialog({
  target,
  onOpenChange,
  password,
  onPasswordChange,
  showPassword,
  onToggleShow,
  onSubmit,
  submitting,
}: {
  target: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  password: string;
  onPasswordChange: (v: string) => void;
  showPassword: boolean;
  onToggleShow: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const validation = usePasswordValidation(password);

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Změnit heslo</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Nastavit nové heslo pro <strong>{target?.name}</strong>
        </p>
        <div className="space-y-2">
          <Label htmlFor="admin-new-password">Nové heslo</Label>
          <div className="relative">
            <Input
              id="admin-new-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="Alespoň 8 znaků"
              autoFocus
              className="pr-10"
            />
            <button
              type="button"
              onClick={onToggleShow}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <PasswordChecklist password={password} />
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zrušit</Button>
          <Button onClick={onSubmit} disabled={submitting || !validation.isValid}>
            {submitting ? "Ukládám..." : "Změnit heslo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
