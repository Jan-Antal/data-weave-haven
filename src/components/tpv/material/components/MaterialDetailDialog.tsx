/**
 * MaterialDetailDialog — full edit dialog for a material.
 *
 * Three tabs:
 *   1. Detaily        — edit fields (nazov, specifikacia, cena, dodavatel, stav...)
 *   2. Prvky          — manage links to tpv_items (which prvkov use this material)
 *   3. Vzorovanie     — manage samples + alternatives
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  CheckCircle2,
  Layers,
  Package,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import {
  useMaterial,
  useUpdateMaterial,
  useUpsertLink,
  useRemoveLink,
  useSamples,
  useCreateSample,
  useUpdateSample,
  useDeleteSample,
  useApproveSample,
} from "../hooks";
import {
  MATERIAL_STAV,
  STAV_LABEL,
  KATEGORIA_OPTIONS,
  KATEGORIA_LABEL,
  JEDNOTKA_OPTIONS,
  PREFIX_OPTIONS,
  SAMPLE_STAV,
  SAMPLE_STAV_LABEL,
  type MaterialStav,
  type MaterialPrefix,
  type SampleStav,
} from "../types";
import { MaterialStatusBadge } from "./MaterialStatusBadge";

interface MaterialDetailDialogProps {
  open: boolean;
  onClose: () => void;
  materialId: string | null;
  canWrite: boolean;
}

export function MaterialDetailDialog({
  open,
  onClose,
  materialId,
  canWrite,
}: MaterialDetailDialogProps) {
  const detailQ = useMaterial(materialId);
  const material = detailQ.data;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {material?.internal_code && (
              <Badge variant="outline" className="font-mono">
                {material.internal_code}
              </Badge>
            )}
            <span>{material?.nazov ?? "Materiál"}</span>
            {material && (
              <MaterialStatusBadge stav={material.stav} size="sm" />
            )}
          </DialogTitle>
          <DialogDescription>
            {material?.specifikacia ?? "Detaily materiálu, naviazanie na prvky a vzorovanie."}
          </DialogDescription>
        </DialogHeader>

        {!material ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            {detailQ.isLoading ? "Načítavam..." : "Materiál sa nenašiel."}
          </div>
        ) : (
          <Tabs defaultValue="detail" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="detail" className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Detaily
              </TabsTrigger>
              <TabsTrigger value="links" className="gap-1.5">
                <Box className="h-3.5 w-3.5" />
                Prvky ({material.links.length})
              </TabsTrigger>
              <TabsTrigger value="samples" className="gap-1.5">
                <Star className="h-3.5 w-3.5" />
                Vzorovanie
              </TabsTrigger>
            </TabsList>

            <TabsContent value="detail" className="mt-4">
              <DetailPane
                material={material}
                canWrite={canWrite}
                onClose={onClose}
              />
            </TabsContent>

            <TabsContent value="links" className="mt-4">
              <LinksPane material={material} canWrite={canWrite} />
            </TabsContent>

            <TabsContent value="samples" className="mt-4">
              <SamplesPane materialId={material.id} canWrite={canWrite} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Detail pane — basic fields
// ============================================================

interface DetailPaneProps {
  material: NonNullable<ReturnType<typeof useMaterial>["data"]>;
  canWrite: boolean;
  onClose: () => void;
}

function DetailPane({ material, canWrite, onClose }: DetailPaneProps) {
  const update = useUpdateMaterial();

  const [internalCode, setInternalCode] = useState(material.internal_code ?? "");
  const [prefix, setPrefix] = useState<MaterialPrefix | "">(
    material.prefix ?? ""
  );
  const [nazov, setNazov] = useState(material.nazov);
  const [specifikacia, setSpecifikacia] = useState(material.specifikacia ?? "");
  const [hrana, setHrana] = useState(material.hrana ?? "");
  const [kategoria, setKategoria] = useState(material.kategoria ?? "");
  const [dodavaArkhe, setDodavaArkhe] = useState(material.dodava_arkhe);
  const [nutnoVzorovat, setNutnoVzorovat] = useState(material.nutno_vzorovat);
  const [poznamky, setPoznamky] = useState(material.poznamky ?? "");
  const [jednotka, setJednotka] = useState(material.jednotka ?? "");
  const [cenaJ, setCenaJ] = useState(
    material.cena_jednotkova == null ? "" : String(material.cena_jednotkova)
  );
  const [produktRef, setProduktRef] = useState(material.produkt_ref ?? "");
  const [stav, setStav] = useState<MaterialStav>(material.stav);
  const [dodavatelId, setDodavatelId] = useState<string>(
    material.dodavatel_id ?? ""
  );

  // Suppliers for picker
  const suppliersQ = useQuery({
    queryKey: ["tpv-suppliers-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tpv_supplier")
        .select("id, nazov")
        .eq("is_active", true)
        .order("nazov");
      if (error) throw error;
      return (data as Array<{ id: string; nazov: string | null }>) ?? [];
    },
    staleTime: 60_000,
  });

  async function handleSave() {
    const cena = cenaJ.trim()
      ? Number(cenaJ.replace(",", "."))
      : null;
    await update.mutateAsync({
      id: material.id,
      internal_code: internalCode,
      prefix: (prefix || null) as MaterialPrefix | null,
      nazov,
      specifikacia,
      hrana,
      kategoria,
      dodava_arkhe: dodavaArkhe,
      nutno_vzorovat: nutnoVzorovat,
      poznamky,
      jednotka,
      cena_jednotkova: cena,
      produkt_ref: produktRef,
      stav,
      dodavatel_id: dodavatelId || null,
    });
  }

  const sumLinkQty = useMemo(
    () =>
      material.links.reduce(
        (acc, l) => acc + (l.mnozstvo_per_item ?? 0),
        0
      ),
    [material.links]
  );

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Internal code + prefix */}
      <div>
        <Label className="text-xs">Interný kód</Label>
        <Input
          value={internalCode}
          onChange={(e) => setInternalCode(e.target.value)}
          placeholder="napr. M01"
          disabled={!canWrite}
          className="font-mono"
        />
      </div>
      <div>
        <Label className="text-xs">Prefix</Label>
        <Select
          value={prefix}
          onValueChange={(v) => setPrefix(v as MaterialPrefix)}
          disabled={!canWrite}
        >
          <SelectTrigger>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {PREFIX_OPTIONS.map((p) => (
              <SelectItem key={p} value={p}>
                {p === "M" ? "M — materiál" : "U — úchytka/kovanie"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="col-span-2">
        <Label className="text-xs">Názov *</Label>
        <Input
          value={nazov}
          onChange={(e) => setNazov(e.target.value)}
          disabled={!canWrite}
        />
      </div>

      <div className="col-span-2">
        <Label className="text-xs">Špecifikácia</Label>
        <Input
          value={specifikacia}
          onChange={(e) => setSpecifikacia(e.target.value)}
          placeholder="napr. Egger U708 ST9 Světle šedá"
          disabled={!canWrite}
        />
      </div>

      <div>
        <Label className="text-xs">Kategória</Label>
        <Select
          value={kategoria}
          onValueChange={setKategoria}
          disabled={!canWrite}
        >
          <SelectTrigger>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {KATEGORIA_OPTIONS.map((k) => (
              <SelectItem key={k} value={k}>
                {KATEGORIA_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Hrana</Label>
        <Input
          value={hrana}
          onChange={(e) => setHrana(e.target.value)}
          placeholder="napr. hrana 1 mm dle dekoru desky"
          disabled={!canWrite}
        />
      </div>

      <div>
        <Label className="text-xs">Jednotka</Label>
        <Select
          value={jednotka}
          onValueChange={setJednotka}
          disabled={!canWrite}
        >
          <SelectTrigger>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {JEDNOTKA_OPTIONS.map((j) => (
              <SelectItem key={j} value={j}>
                {j}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Cena jednotková</Label>
        <Input
          value={cenaJ}
          onChange={(e) => setCenaJ(e.target.value)}
          inputMode="decimal"
          placeholder="napr. 250"
          disabled={!canWrite}
        />
      </div>

      <div className="col-span-2">
        <Label className="text-xs">Produkt (po vzorovaní)</Label>
        <Input
          value={produktRef}
          onChange={(e) => setProduktRef(e.target.value)}
          placeholder="napr. Egger W1000 ST9"
          disabled={!canWrite}
        />
      </div>

      <div>
        <Label className="text-xs">Dodávateľ</Label>
        <Select
          value={dodavatelId}
          onValueChange={setDodavatelId}
          disabled={!canWrite}
        >
          <SelectTrigger>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">— nezvolený —</SelectItem>
            {suppliersQ.data?.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.nazov ?? s.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Stav</Label>
        <Select
          value={stav}
          onValueChange={(v) => setStav(v as MaterialStav)}
          disabled={!canWrite}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MATERIAL_STAV.map((s) => (
              <SelectItem key={s} value={s}>
                {STAV_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="col-span-2 flex items-center gap-6 py-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={dodavaArkhe}
            onCheckedChange={(v) => setDodavaArkhe(!!v)}
            disabled={!canWrite}
          />
          Dodáva ARKHE (architekt) — len montujeme
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={nutnoVzorovat}
            onCheckedChange={(v) => setNutnoVzorovat(!!v)}
            disabled={!canWrite}
          />
          Nutno vzorovať
        </label>
      </div>

      <div className="col-span-2">
        <Label className="text-xs">Poznámky</Label>
        <Textarea
          value={poznamky}
          onChange={(e) => setPoznamky(e.target.value)}
          rows={3}
          disabled={!canWrite}
        />
      </div>

      {/* Stats */}
      <div className="col-span-2 rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-muted-foreground">Naviazaných prvkov:</span>{" "}
            <span className="font-mono font-semibold">
              {material.links.length}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Sumárne množstvo:</span>{" "}
            <span className="font-mono font-semibold">
              {sumLinkQty || "—"}
              {jednotka && sumLinkQty ? ` ${jednotka}` : ""}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Cena celkom:</span>{" "}
            <span className="font-mono font-semibold">
              {material.cena_celkova
                ? `${material.cena_celkova.toLocaleString("sk-SK")} ${material.mena}`
                : "—"}
            </span>
          </div>
        </div>
        {material.ai_extracted && (
          <div className="mt-2 text-cyan-300">
            ✨ AI auto-import
            {material.ai_confidence != null
              ? ` (confidence ${(material.ai_confidence * 100).toFixed(0)} %)`
              : ""}
            {material.ai_source_doc ? ` z ${material.ai_source_doc}` : ""}
          </div>
        )}
      </div>

      <div className="col-span-2 flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>
          Zavrieť
        </Button>
        {canWrite && (
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? "Ukladám..." : "Uložiť"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Links pane — material ↔ tpv_items
// ============================================================

interface LinksPaneProps {
  material: NonNullable<ReturnType<typeof useMaterial>["data"]>;
  canWrite: boolean;
}

function LinksPane({ material, canWrite }: LinksPaneProps) {
  const upsertLink = useUpsertLink();
  const removeLink = useRemoveLink();

  // tpv_items in this project for picker
  const itemsQ = useQuery({
    queryKey: ["tpv-items-for-link", material.project_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tpv_items")
        .select("id, item_code, nazev, popis")
        .eq("project_id", material.project_id)
        .is("deleted_at", null)
        .order("item_code");
      if (error) throw error;
      return (data as Array<{
        id: string;
        item_code: string;
        nazev: string | null;
        popis: string | null;
      }>) ?? [];
    },
    enabled: !!material.project_id,
    staleTime: 30_000,
  });

  // local edit state — track which item is being added
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerItemId, setPickerItemId] = useState<string>("");
  const [pickerQty, setPickerQty] = useState<string>("");
  const [pickerJednotka, setPickerJednotka] = useState(material.jednotka ?? "");
  const [pickerNotes, setPickerNotes] = useState("");

  const linkedItemIds = useMemo(
    () => new Set(material.links.map((l) => l.tpv_item_id)),
    [material.links]
  );
  const unlinkedItems = useMemo(
    () => (itemsQ.data ?? []).filter((i) => !linkedItemIds.has(i.id)),
    [itemsQ.data, linkedItemIds]
  );

  async function handleAdd() {
    if (!pickerItemId) return;
    const qty = pickerQty.trim()
      ? Number(pickerQty.replace(",", "."))
      : null;
    await upsertLink.mutateAsync({
      material_id: material.id,
      tpv_item_id: pickerItemId,
      mnozstvo_per_item: qty,
      jednotka: pickerJednotka || null,
      notes: pickerNotes || null,
    });
    setPickerItemId("");
    setPickerQty("");
    setPickerNotes("");
    setPickerOpen(false);
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Materiál môže byť použitý na viacerých prvkoch. Sumárne množstvo na
        objednanie sa počíta ako súčet cez všetky naviazania.
      </div>

      {material.links.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 bg-muted/10 p-6 text-center text-sm text-muted-foreground">
          Materiál ešte nie je naviazaný na žiaden prvok.
        </div>
      ) : (
        <div className="rounded-md border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-muted-foreground text-[11px] uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Prvok</th>
                <th className="px-3 py-2 text-right">Množstvo</th>
                <th className="px-3 py-2 text-left">Poznámka</th>
                {canWrite && <th className="px-2 py-2 w-px" />}
              </tr>
            </thead>
            <tbody>
              {material.links.map((link) => (
                <LinkRow
                  key={link.id}
                  link={link}
                  canWrite={canWrite}
                  onUpdate={async (qty) => {
                    await upsertLink.mutateAsync({
                      material_id: material.id,
                      tpv_item_id: link.tpv_item_id,
                      mnozstvo_per_item: qty,
                    });
                  }}
                  onRemove={() => removeLink.mutate(link.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canWrite && (
        <div>
          {!pickerOpen ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPickerOpen(true)}
              disabled={unlinkedItems.length === 0}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Naviazať na prvok
              {unlinkedItems.length === 0 ? " (všetky už naviazané)" : ""}
            </Button>
          ) : (
            <div className="rounded-md border border-border/60 p-3 space-y-2 bg-muted/10">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Prvok</Label>
                  <Select
                    value={pickerItemId}
                    onValueChange={setPickerItemId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Vyber prvok..." />
                    </SelectTrigger>
                    <SelectContent>
                      {unlinkedItems.map((it) => (
                        <SelectItem key={it.id} value={it.id}>
                          {it.item_code}
                          {it.nazev ? ` — ${it.nazev}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Množstvo na prvok</Label>
                  <Input
                    value={pickerQty}
                    onChange={(e) => setPickerQty(e.target.value)}
                    inputMode="decimal"
                    placeholder="napr. 2.5"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Poznámka (voliteľné)</Label>
                <Input
                  value={pickerNotes}
                  onChange={(e) => setPickerNotes(e.target.value)}
                  placeholder="napr. použité na čelách dvířok"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPickerOpen(false)}
                >
                  Zrušiť
                </Button>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={!pickerItemId || upsertLink.isPending}
                >
                  Naviazať
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface LinkRowProps {
  link: NonNullable<ReturnType<typeof useMaterial>["data"]>["links"][number];
  canWrite: boolean;
  onUpdate: (qty: number | null) => Promise<void>;
  onRemove: () => void;
}

function LinkRow({ link, canWrite, onUpdate, onRemove }: LinkRowProps) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(
    link.mnozstvo_per_item == null ? "" : String(link.mnozstvo_per_item)
  );

  async function commit() {
    const n = qty.trim() ? Number(qty.replace(",", ".")) : null;
    await onUpdate(n);
    setEditing(false);
  }

  return (
    <tr className="border-t border-border/40 hover:bg-accent/20">
      <td className="px-3 py-2">
        <div className="font-mono text-xs">{link.tpv_item.item_code}</div>
        <div>{link.tpv_item.nazev ?? "—"}</div>
      </td>
      <td className="px-3 py-2 text-right">
        {canWrite && editing ? (
          <Input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            inputMode="decimal"
            autoFocus
            className="h-7 w-24 ml-auto text-right font-mono"
          />
        ) : (
          <button
            type="button"
            onClick={() => canWrite && setEditing(true)}
            className={cn(
              "font-mono",
              canWrite && "hover:underline cursor-pointer"
            )}
            disabled={!canWrite}
          >
            {link.mnozstvo_per_item ?? "—"}
            {link.jednotka ? ` ${link.jednotka}` : ""}
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {link.notes ?? "—"}
        {link.occurrences != null && (
          <span className="ml-2 opacity-70">({link.occurrences}×)</span>
        )}
      </td>
      {canWrite && (
        <td className="px-2 py-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive"
            onClick={onRemove}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </td>
      )}
    </tr>
  );
}

// ============================================================
// Samples pane — vzorovanie
// ============================================================

interface SamplesPaneProps {
  materialId: string;
  canWrite: boolean;
}

function SamplesPane({ materialId, canWrite }: SamplesPaneProps) {
  const samplesQ = useSamples(materialId);
  const samples = samplesQ.data ?? [];

  const create = useCreateSample();
  const update = useUpdateSample();
  const del = useDeleteSample();
  const approve = useApproveSample();

  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSpec, setNewSpec] = useState("");
  const [newNotes, setNewNotes] = useState("");

  async function handleCreate() {
    if (!newName.trim()) return;
    await create.mutateAsync({
      material_id: materialId,
      nazov_vzorky: newName,
      specifikacia: newSpec,
      poznamka: newNotes,
    });
    setNewName("");
    setNewSpec("");
    setNewNotes("");
    setNewOpen(false);
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        Pridaj vzorky/alternatívy. Schválením jednej vzorky sa ostatné
        automaticky zamietnu a do materiálu sa zapíše finálny produkt.
      </div>

      {samplesQ.isLoading ? (
        <div className="py-8 text-center text-muted-foreground text-sm">
          Načítavam vzorky...
        </div>
      ) : samples.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 bg-muted/10 p-6 text-center text-sm text-muted-foreground">
          Žiadne vzorky.
        </div>
      ) : (
        <div className="space-y-2">
          {samples.map((s) => (
            <SampleCard
              key={s.id}
              sample={s}
              canWrite={canWrite}
              onUpdateStav={(stav) =>
                update.mutate({ id: s.id, stav })
              }
              onApprove={() => approve.mutate(s.id)}
              onDelete={() => del.mutate(s.id)}
            />
          ))}
        </div>
      )}

      {canWrite && (
        <div>
          {!newOpen ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setNewOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Pridať vzorku
            </Button>
          ) : (
            <div className="rounded-md border border-border/60 p-3 space-y-2 bg-muted/10">
              <div>
                <Label className="text-xs">Názov vzorky *</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="napr. Egger U708 — alt. 1"
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-xs">Špecifikácia</Label>
                <Input
                  value={newSpec}
                  onChange={(e) => setNewSpec(e.target.value)}
                  placeholder="napr. ST9 Světle šedá, 18 mm"
                />
              </div>
              <div>
                <Label className="text-xs">Poznámka</Label>
                <Textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setNewOpen(false)}
                >
                  Zrušiť
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={!newName.trim() || create.isPending}
                >
                  Pridať
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface SampleCardProps {
  sample: NonNullable<ReturnType<typeof useSamples>["data"]>[number];
  canWrite: boolean;
  onUpdateStav: (stav: SampleStav) => void;
  onApprove: () => void;
  onDelete: () => void;
}

function SampleCard({
  sample,
  canWrite,
  onUpdateStav,
  onApprove,
  onDelete,
}: SampleCardProps) {
  const tone =
    sample.stav === "schvalene"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : sample.stav === "zamietnute"
        ? "border-red-500/40 bg-red-500/5 opacity-60"
        : sample.stav === "dorucene"
          ? "border-sky-500/40 bg-sky-500/5"
          : "border-border/60 bg-card/40";

  return (
    <div className={cn("rounded-md border p-3", tone)}>
      <div className="flex items-start gap-3">
        <Badge variant="outline" className="font-mono">
          #{sample.poradie}
        </Badge>
        <div className="flex-1 min-w-0">
          <div className="font-medium">{sample.nazov_vzorky}</div>
          {sample.specifikacia && (
            <div className="text-xs text-muted-foreground">
              {sample.specifikacia}
            </div>
          )}
          {sample.poznamka && (
            <div className="text-xs mt-1">{sample.poznamka}</div>
          )}
          {sample.zamietnutie_dovod && (
            <div className="text-xs text-red-300 mt-1">
              Zamietnuté: {sample.zamietnutie_dovod}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge
            variant="outline"
            className={
              sample.stav === "schvalene"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : sample.stav === "zamietnute"
                  ? "border-red-500/40 bg-red-500/10 text-red-300"
                  : "text-xs"
            }
          >
            {SAMPLE_STAV_LABEL[sample.stav]}
          </Badge>
          {canWrite &&
            sample.stav !== "schvalene" &&
            sample.stav !== "zamietnute" && (
              <div className="flex items-center gap-1">
                <Select
                  value={sample.stav}
                  onValueChange={(v) => onUpdateStav(v as SampleStav)}
                >
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SAMPLE_STAV.map((s) => (
                      <SelectItem key={s} value={s}>
                        {SAMPLE_STAV_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  className="h-7 bg-emerald-600 hover:bg-emerald-500"
                  onClick={onApprove}
                  title="Schváliť túto vzorku — ostatné sa zamietnu, materiál sa aktualizuje"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          {canWrite && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
