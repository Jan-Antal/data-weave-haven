/**
 * AddSupplierDialog — vytvorí nového dodávateľa.
 *
 * Po úspešnom uložení sa dialog zatvorí a parent dostane id nového
 * dodávateľa cez onCreated — typicky hneď otvorí SupplierCRMDialog
 * aby user mohol doplniť detaily, kontakty, cenník, atď.
 *
 * Povinné: nazov.
 * Voliteľné: kontakt (meno/pozícia/email/tel), firma (IČO/DIČ/web/adresa),
 *   kategórie (multi-tag), rating (1-5), poznámka.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Star, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { useCreateSupplier } from "./hooks";

interface AddSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new supplier id after successful create. */
  onCreated?: (newSupplierId: string) => void;
}

export function AddSupplierDialog({
  open,
  onOpenChange,
  onCreated,
}: AddSupplierDialogProps) {
  // form state
  const [nazov, setNazov] = useState("");
  const [ico, setIco] = useState("");
  const [dic, setDic] = useState("");
  const [kontaktMeno, setKontaktMeno] = useState("");
  const [kontaktPozice, setKontaktPozice] = useState("");
  const [kontaktEmail, setKontaktEmail] = useState("");
  const [kontaktTelefon, setKontaktTelefon] = useState("");
  const [web, setWeb] = useState("");
  const [adresa, setAdresa] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [kategorie, setKategorie] = useState<string[]>([]);
  const [kategorieDraft, setKategorieDraft] = useState("");

  const nazovInputRef = useRef<HTMLInputElement>(null);

  // reset on open + autofocus
  useEffect(() => {
    if (!open) return;
    setNazov("");
    setIco("");
    setDic("");
    setKontaktMeno("");
    setKontaktPozice("");
    setKontaktEmail("");
    setKontaktTelefon("");
    setWeb("");
    setAdresa("");
    setRating(null);
    setNotes("");
    setKategorie([]);
    setKategorieDraft("");
    setTimeout(() => nazovInputRef.current?.focus(), 50);
  }, [open]);

  const create = useCreateSupplier();
  const submitting = create.isPending;

  const valid = useMemo(() => nazov.trim().length > 0, [nazov]);

  // ----- categories: split on Enter or comma -----
  function commitCategoryDraft() {
    const raw = kategorieDraft.trim();
    if (!raw) return;
    const parts = raw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setKategorie((prev) => {
      const existing = new Set(prev.map((p) => p.toLowerCase()));
      const next = [...prev];
      for (const p of parts) {
        if (!existing.has(p.toLowerCase())) {
          next.push(p);
          existing.add(p.toLowerCase());
        }
      }
      return next;
    });
    setKategorieDraft("");
  }
  function removeCategory(k: string) {
    setKategorie((prev) => prev.filter((x) => x !== k));
  }

  // ----- submit -----
  async function handleSubmit() {
    if (!valid || submitting) return;
    const created = await create.mutateAsync({
      nazov: nazov.trim(),
      ico: ico,
      dic: dic,
      kontakt_meno: kontaktMeno,
      kontakt_pozice: kontaktPozice,
      kontakt_email: kontaktEmail,
      kontakt_telefon: kontaktTelefon,
      web,
      adresa,
      kategorie,
      rating,
      notes,
    });
    onOpenChange(false);
    onCreated?.(created.id);
  }

  function handleClose() {
    if (submitting) return;
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nový dodávateľ</DialogTitle>
          <DialogDescription>
            Pridaj nového dodávateľa. Po uložení môžeš hneď doplniť kontakty,
            cenník a úlohy v CRM dialógu.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {/* Názov */}
          <div className="col-span-2">
            <Label className="text-xs">Názov *</Label>
            <Input
              ref={nazovInputRef}
              value={nazov}
              onChange={(e) => setNazov(e.target.value)}
              placeholder="napr. Demos Stolárstvo s.r.o."
            />
          </div>

          {/* IČO + DIČ */}
          <div>
            <Label className="text-xs">IČO</Label>
            <Input
              value={ico}
              onChange={(e) => setIco(e.target.value)}
              placeholder="napr. 12345678"
            />
          </div>
          <div>
            <Label className="text-xs">DIČ</Label>
            <Input
              value={dic}
              onChange={(e) => setDic(e.target.value)}
              placeholder="napr. CZ12345678"
            />
          </div>

          {/* Kontakt */}
          <div>
            <Label className="text-xs">Kontaktná osoba</Label>
            <Input
              value={kontaktMeno}
              onChange={(e) => setKontaktMeno(e.target.value)}
              placeholder="meno a priezvisko"
            />
          </div>
          <div>
            <Label className="text-xs">Pozícia</Label>
            <Input
              value={kontaktPozice}
              onChange={(e) => setKontaktPozice(e.target.value)}
              placeholder="napr. obchodný riaditeľ"
            />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={kontaktEmail}
              onChange={(e) => setKontaktEmail(e.target.value)}
              placeholder="info@firma.cz"
            />
          </div>
          <div>
            <Label className="text-xs">Telefón</Label>
            <Input
              value={kontaktTelefon}
              onChange={(e) => setKontaktTelefon(e.target.value)}
              placeholder="+420 ..."
            />
          </div>

          {/* Web + adresa */}
          <div>
            <Label className="text-xs">Web</Label>
            <Input
              value={web}
              onChange={(e) => setWeb(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <Label className="text-xs">Adresa</Label>
            <Input
              value={adresa}
              onChange={(e) => setAdresa(e.target.value)}
              placeholder="ulica, mesto"
            />
          </div>

          {/* Kategórie */}
          <div className="col-span-2">
            <Label className="text-xs">Kategórie</Label>
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1.5 min-h-9">
              {kategorie.map((k) => (
                <Badge
                  key={k}
                  variant="secondary"
                  className="gap-1 pr-1"
                >
                  {k}
                  <button
                    type="button"
                    className="hover:text-destructive"
                    onClick={() => removeCategory(k)}
                    aria-label={`Odstrániť kategóriu ${k}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <input
                value={kategorieDraft}
                onChange={(e) => setKategorieDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    commitCategoryDraft();
                  } else if (
                    e.key === "Backspace" &&
                    kategorieDraft === "" &&
                    kategorie.length > 0
                  ) {
                    setKategorie((prev) => prev.slice(0, -1));
                  }
                }}
                onBlur={commitCategoryDraft}
                placeholder={
                  kategorie.length === 0
                    ? "napr. Lakovanie, Sklo, CNC — Enter alebo čiarka"
                    : "pridať..."
                }
                className="flex-1 min-w-[140px] bg-transparent text-sm outline-none"
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Stlač Enter alebo čiarku po napísaní kategórie.
            </p>
          </div>

          {/* Rating */}
          <div className="col-span-2">
            <Label className="text-xs">Rating</Label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(rating === n ? null : n)}
                  className={cn(
                    "p-1 rounded hover:bg-muted/40 transition-colors",
                    rating != null && n <= rating
                      ? "text-amber-400"
                      : "text-muted-foreground/40"
                  )}
                  aria-label={`Rating ${n}`}
                >
                  <Star
                    className={cn(
                      "h-5 w-5",
                      rating != null && n <= rating ? "fill-current" : ""
                    )}
                  />
                </button>
              ))}
              {rating != null && (
                <button
                  type="button"
                  onClick={() => setRating(null)}
                  className="ml-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  vyčistiť
                </button>
              )}
            </div>
          </div>

          {/* Poznámka */}
          <div className="col-span-2">
            <Label className="text-xs">Poznámka</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="ľubovoľné interné poznámky"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Zrušiť
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || submitting}>
            {submitting ? "Pridávam..." : "Pridať dodávateľa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
