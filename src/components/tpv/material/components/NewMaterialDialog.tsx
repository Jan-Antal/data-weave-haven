/**
 * NewMaterialDialog — create/edit single material entry.
 *
 * Used both for "Nová položka" and edit. If `materialId` is provided,
 * fetches the row and pre-fills the form (edit mode).
 *
 * Workflow notes:
 *   - project_id sa vyberá z aktívnych projektov
 *   - po výbere projektu sa naloaduje zoznam tpv_items pre lookup
 *   - dodavatel je voľný text (DB schéma — môže byť budúca migrácia na FK)
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  useCreateMaterial,
  useMaterial,
  useUpdateMaterial,
} from "../hooks";
import { JEDNOTKA_OPTIONS, MATERIAL_STAV, STAV_LABEL } from "../types";
import type { MaterialStav } from "../types";

interface NewMaterialDialogProps {
  open: boolean;
  onClose: () => void;
  /** Edit mode if provided */
  materialId?: string | null;
  /** Pre-select project if creating */
  initialProjectId?: string;
  /** Pre-select item if creating */
  initialTpvItemId?: string;
}

interface ProjectOption {
  project_id: string;
  project_name: string | null;
  klient: string | null;
}
interface ItemOption {
  id: string;
  item_code: string;
  nazev: string | null;
}

export function NewMaterialDialog({
  open,
  onClose,
  materialId,
  initialProjectId,
  initialTpvItemId,
}: NewMaterialDialogProps) {
  const isEdit = !!materialId;
  const detailQ = useMaterial(materialId ?? null);

  // ----- form state -----
  const [projectId, setProjectId] = useState<string>(initialProjectId ?? "");
  const [tpvItemId, setTpvItemId] = useState<string>(initialTpvItemId ?? "");
  const [nazov, setNazov] = useState("");
  const [mnozstvo, setMnozstvo] = useState<string>("");
  const [jednotka, setJednotka] = useState<string>("ks");
  const [dodavatel, setDodavatel] = useState("");
  const [stav, setStav] = useState<MaterialStav>("nezadany");
  const [poznamka, setPoznamka] = useState("");

  // pre-fill from detail when in edit mode
  useEffect(() => {
    if (!isEdit || !detailQ.data) return;
    const m = detailQ.data;
    setProjectId(m.project_id);
    setTpvItemId(m.tpv_item_id);
    setNazov(m.nazov);
    setMnozstvo(m.mnozstvo == null ? "" : String(m.mnozstvo));
    setJednotka(m.jednotka ?? "ks");
    setDodavatel(m.dodavatel ?? "");
    setStav(m.stav);
    setPoznamka(m.poznamka ?? "");
  }, [isEdit, detailQ.data]);

  // ----- projects + items dropdowns -----
  const projectsQ = useQuery({
    queryKey: ["tpv", "material", "projects-active"],
    queryFn: async (): Promise<ProjectOption[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select("project_id, project_name, klient, is_active")
        .eq("is_active", true)
        .order("project_name");
      if (error) throw error;
      return (
        (data as ProjectOption[]) ?? []
      ).map((p) => ({
        project_id: p.project_id,
        project_name: p.project_name,
        klient: p.klient,
      }));
    },
    enabled: open,
    staleTime: 60_000,
  });

  const itemsQ = useQuery({
    queryKey: ["tpv", "material", "items", projectId],
    queryFn: async (): Promise<ItemOption[]> => {
      if (!projectId) return [];
      const { data, error } = await supabase
        .from("tpv_items")
        .select("id, item_code, nazev")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("item_code");
      if (error) throw error;
      return (data as ItemOption[]) ?? [];
    },
    enabled: open && !!projectId,
    staleTime: 30_000,
  });

  // reset item when project changes (only in create mode)
  useEffect(() => {
    if (isEdit) return;
    setTpvItemId(initialTpvItemId ?? "");
  }, [projectId, isEdit, initialTpvItemId]);

  // ----- mutations -----
  const createM = useCreateMaterial();
  const updateM = useUpdateMaterial();
  const submitting = createM.isPending || updateM.isPending;

  // ----- validation -----
  const valid = useMemo(() => {
    if (!projectId.trim()) return false;
    if (!tpvItemId.trim()) return false;
    if (!nazov.trim()) return false;
    if (mnozstvo.trim()) {
      const n = Number(mnozstvo.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) return false;
    }
    return true;
  }, [projectId, tpvItemId, nazov, mnozstvo]);

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  async function handleSubmit() {
    const mn = mnozstvo.trim()
      ? Number(mnozstvo.replace(",", "."))
      : null;
    if (isEdit && materialId) {
      await updateM.mutateAsync({
        id: materialId,
        nazov: nazov.trim(),
        mnozstvo: mn,
        jednotka: jednotka || null,
        dodavatel: dodavatel.trim() || null,
        stav,
        poznamka: poznamka.trim() || null,
      });
    } else {
      await createM.mutateAsync({
        project_id: projectId,
        tpv_item_id: tpvItemId,
        nazov: nazov.trim(),
        mnozstvo: mn,
        jednotka: jednotka || null,
        dodavatel: dodavatel.trim() || null,
        stav,
        poznamka: poznamka.trim() || null,
      });
    }
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Upraviť materiál" : "Nová položka materiálu"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Zmena parametrov položky. Audit log zaznamená všetky úpravy."
              : "Pridaj materiál naviazaný na konkrétny TPV prvok."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {/* project */}
          <div className="col-span-2">
            <Label className="text-xs">Projekt *</Label>
            <Select
              value={projectId}
              onValueChange={setProjectId}
              disabled={isEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder="Vyber projekt..." />
              </SelectTrigger>
              <SelectContent>
                {projectsQ.data?.map((p) => (
                  <SelectItem key={p.project_id} value={p.project_id}>
                    {p.project_name ?? p.project_id}
                    {p.klient ? ` — ${p.klient}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* item */}
          <div className="col-span-2">
            <Label className="text-xs">TPV prvok *</Label>
            <Select
              value={tpvItemId}
              onValueChange={setTpvItemId}
              disabled={isEdit || !projectId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !projectId
                      ? "Najprv vyber projekt"
                      : itemsQ.data?.length
                        ? "Vyber prvok..."
                        : "Žiadne prvky"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {itemsQ.data?.map((it) => (
                  <SelectItem key={it.id} value={it.id}>
                    {it.item_code}
                    {it.nazev ? ` — ${it.nazev}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* nazov */}
          <div className="col-span-2">
            <Label className="text-xs">Názov materiálu *</Label>
            <Input
              value={nazov}
              onChange={(e) => setNazov(e.target.value)}
              placeholder="napr. MDF doska 18mm bielá"
            />
          </div>

          {/* mnozstvo + jednotka */}
          <div>
            <Label className="text-xs">Množstvo</Label>
            <Input
              value={mnozstvo}
              onChange={(e) => setMnozstvo(e.target.value)}
              inputMode="decimal"
              placeholder="napr. 12"
            />
          </div>
          <div>
            <Label className="text-xs">Jednotka</Label>
            <Select value={jednotka} onValueChange={setJednotka}>
              <SelectTrigger>
                <SelectValue />
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

          {/* dodavatel */}
          <div className="col-span-2">
            <Label className="text-xs">Dodávateľ</Label>
            <Input
              value={dodavatel}
              onChange={(e) => setDodavatel(e.target.value)}
              placeholder="voľný text — napr. Demos, Egger, ..."
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Pole je momentálne text. Budúca migrácia ho prepojí na CRM.
            </p>
          </div>

          {/* stav */}
          <div className="col-span-2">
            <Label className="text-xs">Stav</Label>
            <Select
              value={stav}
              onValueChange={(v) => setStav(v as MaterialStav)}
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

          {/* poznamka */}
          <div className="col-span-2">
            <Label className="text-xs">Poznámka</Label>
            <Textarea
              value={poznamka}
              onChange={(e) => setPoznamka(e.target.value)}
              rows={2}
              placeholder="napr. matný lak, špecifické rozmery..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Zrušiť
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || submitting}>
            {submitting ? "Ukladám..." : isEdit ? "Uložiť" : "Pridať"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
