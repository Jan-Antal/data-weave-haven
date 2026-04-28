/**
 * Supplier CRM — Kontakty pane.
 * Multiple contacts per supplier with primary flag.
 */

import { useState } from "react";
import { Plus, Trash2, Edit2, Star, Loader2, Phone, Mail, X, Save } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  useSupplierContacts,
  useCreateSupplierContact,
  useUpdateSupplierContact,
  useDeleteSupplierContact,
} from "../hooks";
import type {
  TpvSupplierContactRow,
  CreateSupplierContactInput,
} from "../types";
import type { SubcontractPermissions } from "../../subdodavky/types";

interface ContactsPaneProps {
  supplierId: string;
  permissions: SubcontractPermissions;
}

export function ContactsPane({ supplierId, permissions }: ContactsPaneProps) {
  const { data: contacts = [], isLoading } = useSupplierContacts(supplierId);
  const [editingContact, setEditingContact] =
    useState<TpvSupplierContactRow | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Načítavam kontakty…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {contacts.length} {contacts.length === 1 ? "kontakt" : "kontaktov"}
        </p>
        {permissions.canManageSupplier && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Pridať kontakt
          </Button>
        )}
      </div>

      {contacts.length === 0 ? (
        <div className="border rounded-lg p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Žiadne kontakty pre tohto dodávateľa.
          </p>
          {permissions.canManageSupplier && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Pridať prvý kontakt
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {contacts.map((c) => (
            <ContactRow
              key={c.id}
              contact={c}
              canEdit={permissions.canManageSupplier}
              onEdit={() => setEditingContact(c)}
            />
          ))}
        </div>
      )}

      {creating && (
        <ContactFormDialog
          mode="create"
          supplierId={supplierId}
          onClose={() => setCreating(false)}
        />
      )}

      {editingContact && (
        <ContactFormDialog
          mode="edit"
          supplierId={supplierId}
          contact={editingContact}
          onClose={() => setEditingContact(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// CONTACT ROW
// ============================================================

function ContactRow({
  contact,
  canEdit,
  onEdit,
}: {
  contact: TpvSupplierContactRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const initials = contact.meno
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const del = useDeleteSupplierContact(contact.supplier_id);

  return (
    <div className="grid grid-cols-[40px_1fr_auto] gap-3 px-4 py-3 items-center">
      <div className="w-9 h-9 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-bold text-xs">
        {initials || "?"}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{contact.meno}</span>
          {contact.is_primary && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wide bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
              <Star className="h-2.5 w-2.5" />
              Primárny
            </span>
          )}
        </div>
        {contact.pozice && (
          <div className="text-xs text-muted-foreground mt-0.5">
            {contact.pozice}
          </div>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
          {contact.telefon && (
            <a
              href={`tel:${contact.telefon}`}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Phone className="h-3 w-3" />
              {contact.telefon}
            </a>
          )}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Mail className="h-3 w-3" />
              {contact.email}
            </a>
          )}
        </div>
        {contact.poznamka && (
          <div className="text-xs text-muted-foreground mt-1.5 italic line-clamp-2">
            {contact.poznamka}
          </div>
        )}
      </div>
      {canEdit && (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => {
              if (confirm(`Odstrániť kontakt ${contact.meno}?`)) {
                del.mutate(contact.id);
              }
            }}
            disabled={del.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CONTACT FORM DIALOG (create + edit)
// ============================================================

function ContactFormDialog({
  mode,
  supplierId,
  contact,
  onClose,
}: {
  mode: "create" | "edit";
  supplierId: string;
  contact?: TpvSupplierContactRow;
  onClose: () => void;
}) {
  const [meno, setMeno] = useState(contact?.meno ?? "");
  const [pozice, setPozice] = useState(contact?.pozice ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [telefon, setTelefon] = useState(contact?.telefon ?? "");
  const [isPrimary, setIsPrimary] = useState(contact?.is_primary ?? false);
  const [poznamka, setPoznamka] = useState(contact?.poznamka ?? "");

  const create = useCreateSupplierContact();
  const update = useUpdateSupplierContact(supplierId);

  const isPending = create.isPending || update.isPending;

  const submit = () => {
    if (!meno.trim()) return;

    const payload = {
      meno: meno.trim(),
      pozice: pozice.trim() || undefined,
      email: email.trim() || undefined,
      telefon: telefon.trim() || undefined,
      is_primary: isPrimary,
      poznamka: poznamka.trim() || undefined,
    };

    if (mode === "create") {
      create.mutate(
        { supplier_id: supplierId, ...payload } as CreateSupplierContactInput,
        { onSuccess: () => onClose() }
      );
    } else if (contact) {
      update.mutate(
        { id: contact.id, patch: payload },
        { onSuccess: () => onClose() }
      );
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Pridať kontakt" : "Upraviť kontakt"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>
              Meno <span className="text-red-500">*</span>
            </Label>
            <Input
              value={meno}
              onChange={(e) => setMeno(e.target.value)}
              placeholder="Pavel Novák"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Pozícia / rola</Label>
            <Input
              value={pozice}
              onChange={(e) => setPozice(e.target.value)}
              placeholder="Majiteľ, Dispečerka, Fakturácia…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Telefón</Label>
              <Input
                value={telefon}
                onChange={(e) => setTelefon(e.target.value)}
                placeholder="+420 …"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Poznámka</Label>
            <Textarea
              value={poznamka}
              onChange={(e) => setPoznamka(e.target.value)}
              className="min-h-[60px]"
              placeholder="Voliteľná poznámka — preferovaný čas hovoru, zodpovednosti…"
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              className="h-4 w-4"
            />
            <span>Označiť ako primárny kontakt</span>
            <span className="text-xs text-muted-foreground">
              (predvolený pre RFQ a komunikáciu)
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            <X className="h-4 w-4 mr-1" />
            Zrušiť
          </Button>
          <Button onClick={submit} disabled={!meno.trim() || isPending}>
            <Save className="h-4 w-4 mr-1" />
            {isPending ? "Ukladám…" : mode === "create" ? "Pridať" : "Uložiť"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
