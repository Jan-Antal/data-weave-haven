/**
 * NewMaterialDialog — quick create of a new material.
 *
 * Minimum required: project_id + nazov.
 * After save, parent can immediately open MaterialDetailDialog
 * for the new id to fill in links/samples.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useCreateMaterial } from "../hooks";
import {
  KATEGORIA_OPTIONS,
  KATEGORIA_LABEL,
  JEDNOTKA_OPTIONS,
  PREFIX_OPTIONS,
  type MaterialPrefix,
} from "../types";

interface NewMaterialDialogProps {
  open: boolean;
  onClose: () => void;
  initialProjectId?: string;
  /** Called with the new material's id after successful create. */
  onCreated?: (newId: string) => void;
}

export function NewMaterialDialog({
  open,
  onClose,
  initialProjectId,
  onCreated,
}: NewMaterialDialogProps) {
  const [projectId, setProjectId] = useState<string>(initialProjectId ?? "");
  const [internalCode, setInternalCode] = useState("");
  const [prefix, setPrefix] = useState<MaterialPrefix | "">("");
  const [nazov, setNazov] = useState("");
  const [specifikacia, setSpecifikacia] = useState("");
  const [hrana, setHrana] = useState("");
  const [kategoria, setKategoria] = useState("");
  const [jednotka, setJednotka] = useState("");
  const [dodavaArkhe, setDodavaArkhe] = useState(false);
  const [nutnoVzorovat, setNutnoVzorovat] = useState(true);
  const [poznamky, setPoznamky] = useState("");

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setProjectId(initialProjectId ?? "");
    setInternalCode("");
    setPrefix("");
    setNazov("");
    setSpecifikacia("");
    setHrana("");
    setKategoria("");
    setJednotka("");
    setDodavaArkhe(false);
    setNutnoVzorovat(true);
    setPoznamky("");
  }, [open, initialProjectId]);

  const projectsQ = useQuery({
    queryKey: ["projects-active-for-material"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("project_id, project_name, klient")
        .eq("is_active", true)
        .order("project_name");
      if (error) throw error;
      return (data as Array<{
        project_id: string;
        project_name: string | null;
        klient: string | null;
      }>) ?? [];
    },
    enabled: open,
    staleTime: 60_000,
  });

  const create = useCreateMaterial();

  const valid = useMemo(
    () => !!projectId && nazov.trim().length > 0,
    [projectId, nazov]
  );

  async function handleSubmit() {
    if (!valid || create.isPending) return;
    const created = await create.mutateAsync({
      project_id: projectId,
      internal_code: internalCode || null,
      prefix: (prefix || null) as MaterialPrefix | null,
      nazov: nazov.trim(),
      specifikacia: specifikacia || null,
      hrana: hrana || null,
      kategoria: kategoria || null,
      jednotka: jednotka || null,
      dodava_arkhe: dodavaArkhe,
      nutno_vzorovat: nutnoVzorovat,
      poznamky: poznamky || null,
      stav: "confirmed",
    });
    onClose();
    onCreated?.(created.id);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !create.isPending && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nový materiál</DialogTitle>
          <DialogDescription>
            Pridaj nový materiál ručne. Po uložení môžeš naviazať na prvky a
            pridať vzorovanie.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">Projekt *</Label>
            <Select value={projectId} onValueChange={setProjectId}>
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

          <div>
            <Label className="text-xs">Interný kód</Label>
            <Input
              value={internalCode}
              onChange={(e) => setInternalCode(e.target.value)}
              placeholder="napr. M01"
              className="font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Prefix</Label>
            <Select
              value={prefix}
              onValueChange={(v) => setPrefix(v as MaterialPrefix)}
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
              placeholder="napr. LTD tl. 18 mm"
            />
          </div>

          <div className="col-span-2">
            <Label className="text-xs">Špecifikácia</Label>
            <Input
              value={specifikacia}
              onChange={(e) => setSpecifikacia(e.target.value)}
              placeholder="napr. Egger U708 ST9 Světle šedá"
            />
          </div>

          <div>
            <Label className="text-xs">Kategória</Label>
            <Select value={kategoria} onValueChange={setKategoria}>
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
            <Label className="text-xs">Jednotka</Label>
            <Select value={jednotka} onValueChange={setJednotka}>
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

          <div className="col-span-2">
            <Label className="text-xs">Hrana / detail</Label>
            <Input
              value={hrana}
              onChange={(e) => setHrana(e.target.value)}
              placeholder="napr. hrana 1 mm dle dekoru desky"
            />
          </div>

          <div className="col-span-2 flex items-center gap-6 py-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={dodavaArkhe}
                onCheckedChange={(v) => setDodavaArkhe(!!v)}
              />
              Dodáva ARKHE — len montujeme
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={nutnoVzorovat}
                onCheckedChange={(v) => setNutnoVzorovat(!!v)}
              />
              Nutno vzorovať
            </label>
          </div>

          <div className="col-span-2">
            <Label className="text-xs">Poznámky</Label>
            <Textarea
              value={poznamky}
              onChange={(e) => setPoznamky(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={create.isPending}
          >
            Zrušiť
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!valid || create.isPending}
          >
            {create.isPending ? "Pridávam..." : "Pridať materiál"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
