/**
 * NewSubcontractDialog — 5-step wizard for creating new subcontract.
 *
 * Steps:
 *   1. Potreba — what's needed (project, item, operation, qty, deadline)
 *   2. Spôsob — RFQ flow vs direct assignment
 *   3. Dodávatelia — pick supplier(s)
 *      - Direct mode: 1 supplier (single picker)
 *      - RFQ mode: N suppliers (multi picker)
 *   4. Ponuky — quote comparison (only RFQ mode, after suppliers respond)
 *      Shown later in subcontract detail, NOT in this wizard.
 *   5. Potvrdenie — review + create
 *
 * For "Direct" mode: wizard skips step 4. Goes 1→2→3→5.
 * For "RFQ" mode: wizard goes 1→2→3→5 (creates subcontract + sends RFQs).
 * Step 4 (quote compare) is opened later from subcontract detail.
 */

import { useState } from "react";
import { ArrowRight, ArrowLeft, Check, Send, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

import { SupplierPicker, SuppliersMultiPicker } from "./SupplierPicker";
import {
  useActiveProjects,
  useTpvItemsForProject,
  useCreateSubcontract,
  useCreateRFQRequests,
} from "../hooks";
import type { Mena } from "../../shared/types";
import { MENA } from "../../shared/types";

// ============================================================
// FORM STATE
// ============================================================

type WizardMode = "rfq" | "direct";

interface FormState {
  // Step 1
  project_id: string;
  tpv_item_id: string | null;
  nazov: string;
  popis: string;
  mnozstvo: string; // string in form; parsed on submit
  jednotka: string;
  potreba_do: string; // ISO date — used for poznámka/info, not stored as column yet
  cena_predpokladana: string;
  mena: Mena;

  // Step 2
  mode: WizardMode | null;

  // Step 3
  selected_supplier: string | null; // direct mode
  selected_suppliers: string[]; // RFQ mode
  rfq_poznamka: string;
}

const initialForm: FormState = {
  project_id: "",
  tpv_item_id: null,
  nazov: "",
  popis: "",
  mnozstvo: "",
  jednotka: "ks",
  potreba_do: "",
  cena_predpokladana: "",
  mena: "CZK",
  mode: null,
  selected_supplier: null,
  selected_suppliers: [],
  rfq_poznamka: "",
};

// ============================================================
// COMPONENT
// ============================================================

interface NewSubcontractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill project_id (e.g. when opened from a specific project context). */
  defaultProjectId?: string;
  onCreated?: () => void;
}

export function NewSubcontractDialog({
  open,
  onOpenChange,
  defaultProjectId,
  onCreated,
}: NewSubcontractDialogProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [form, setForm] = useState<FormState>({
    ...initialForm,
    project_id: defaultProjectId ?? "",
  });

  const { data: projects = [] } = useActiveProjects();
  const { data: tpvItems = [] } = useTpvItemsForProject(form.project_id);

  const createSubcontract = useCreateSubcontract();
  const createRFQ = useCreateRFQRequests();

  const reset = () => {
    setStep(1);
    setForm({ ...initialForm, project_id: defaultProjectId ?? "" });
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Validation per step
  const canAdvance = (() => {
    if (step === 1) {
      return !!form.project_id && form.nazov.trim().length > 0;
    }
    if (step === 2) {
      return form.mode !== null;
    }
    if (step === 3) {
      if (form.mode === "direct") return !!form.selected_supplier;
      if (form.mode === "rfq") return form.selected_suppliers.length > 0;
      return false;
    }
    return true;
  })();

  const submit = async () => {
    const payload = {
      project_id: form.project_id,
      tpv_item_id: form.tpv_item_id,
      nazov: form.nazov.trim(),
      popis: form.popis.trim() || undefined,
      mnozstvo: form.mnozstvo ? Number(form.mnozstvo) : undefined,
      jednotka: form.jednotka || undefined,
      cena_predpokladana: form.cena_predpokladana
        ? Number(form.cena_predpokladana)
        : undefined,
      mena: form.mena,
      poznamka: form.potreba_do
        ? `Potreba do: ${form.potreba_do}`
        : undefined,
      ...(form.mode === "direct" && form.selected_supplier
        ? { dodavatel_id: form.selected_supplier }
        : {}),
    };

    try {
      const created = await createSubcontract.mutateAsync(payload);

      // RFQ mode → also send RFQs
      if (form.mode === "rfq" && form.selected_suppliers.length > 0) {
        await createRFQ.mutateAsync({
          subcontract_id: created.id,
          supplier_ids: form.selected_suppliers,
          poznamka: form.rfq_poznamka.trim() || undefined,
        });
      }

      onCreated?.();
      close();
    } catch {
      // Toast handled by hooks
    }
  };

  const isSubmitting =
    createSubcontract.isPending || createRFQ.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : close())}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="text-lg">Nová subdodávka</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {form.mode === "rfq"
              ? "Cez dopyt (RFQ) — porovnáš ponuky pred výberom"
              : form.mode === "direct"
              ? "Rýchle zadanie — priamo zvolený dodávateľ"
              : "Vytvor nový záznam alebo dopytaj viac dodávateľov"}
          </p>
        </DialogHeader>

        {/* Stepper */}
        <Stepper currentStep={step} mode={form.mode} />

        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
          {step === 1 && (
            <Step1Need
              form={form}
              update={update}
              projects={projects}
              tpvItems={tpvItems}
            />
          )}
          {step === 2 && <Step2Mode form={form} update={update} />}
          {step === 3 && <Step3Suppliers form={form} update={update} />}
          {step === 4 && <Step4Review form={form} projects={projects} />}
        </div>

        <DialogFooter className="px-6 py-3 border-t bg-muted/30 shrink-0 flex-row justify-between sm:justify-between">
          <Button variant="ghost" onClick={close}>
            Zrušiť
          </Button>
          <div className="flex gap-2">
            {step > 1 && (
              <Button
                variant="outline"
                onClick={() => setStep((s) => (s - 1) as typeof step)}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Späť
              </Button>
            )}
            {step < 4 ? (
              <Button
                onClick={() => setStep((s) => (s + 1) as typeof step)}
                disabled={!canAdvance}
              >
                Ďalej
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={submit} disabled={isSubmitting}>
                {isSubmitting ? (
                  "Ukladám…"
                ) : form.mode === "rfq" ? (
                  <>
                    <Send className="h-4 w-4 mr-1" />
                    Vytvoriť a rozposlať RFQ
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Vytvoriť subdodávku
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// STEPPER
// ============================================================

function Stepper({
  currentStep,
  mode,
}: {
  currentStep: number;
  mode: WizardMode | null;
}) {
  const steps = [
    { num: 1, label: "Potreba" },
    { num: 2, label: "Spôsob" },
    { num: 3, label: "Dodávatelia" },
    { num: 4, label: "Potvrdenie" },
  ];

  return (
    <div className="flex items-center gap-2 px-6 py-3 bg-muted/30 border-b text-xs">
      {steps.map((s, idx) => {
        const isActive = currentStep === s.num;
        const isDone = currentStep > s.num;
        return (
          <div key={s.num} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                  isActive && "bg-foreground text-background",
                  isDone && "bg-green-600 text-white",
                  !isActive && !isDone && "bg-muted text-muted-foreground"
                )}
              >
                {isDone ? <Check className="h-3 w-3" /> : s.num}
              </div>
              <span
                className={cn(
                  "font-medium",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {s.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <span className="text-muted-foreground/50">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// STEP 1 — Potreba
// ============================================================

function Step1Need({
  form,
  update,
  projects,
  tpvItems,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  projects: { project_id: string; project_name: string | null }[];
  tpvItems: { id: string; item_code: string; nazev: string | null }[];
}) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground mb-1">
        <strong className="text-foreground">Krok 1 z 4</strong> — Čo potrebuješ
        vyrobiť/objednať subdodávateľsky?
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>
            Projekt <span className="text-red-500">*</span>
          </Label>
          <Select
            value={form.project_id}
            onValueChange={(v) => update("project_id", v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Vybrať projekt…" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.project_id} value={p.project_id}>
                  {p.project_id}
                  {p.project_name && ` — ${p.project_name}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>
            Prvok <span className="text-muted-foreground text-xs">(optional)</span>
          </Label>
          <Select
            value={form.tpv_item_id ?? "__none__"}
            onValueChange={(v) =>
              update("tpv_item_id", v === "__none__" ? null : v)
            }
            disabled={!form.project_id}
          >
            <SelectTrigger>
              <SelectValue placeholder="Vybrať prvok z TPV listu…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— Bez prvku —</SelectItem>
              {tpvItems.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.item_code}{item.nazev && ` — ${item.nazev}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label>
            Operácia / popis <span className="text-red-500">*</span>
          </Label>
          <Input
            value={form.nazov}
            onChange={(e) => update("nazov", e.target.value)}
            placeholder="napr. Lakovanie dvierok, CNC frézovanie, Sklo tabuľové…"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Množstvo</Label>
          <Input
            type="number"
            value={form.mnozstvo}
            onChange={(e) => update("mnozstvo", e.target.value)}
            placeholder="5"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Jednotka</Label>
          <Input
            value={form.jednotka}
            onChange={(e) => update("jednotka", e.target.value)}
            placeholder="ks, m², sada…"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Potreba najneskôr do</Label>
          <Input
            type="date"
            value={form.potreba_do}
            onChange={(e) => update("potreba_do", e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Plánovaná cena (budget)</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={form.cena_predpokladana}
              onChange={(e) => update("cena_predpokladana", e.target.value)}
              placeholder="12 500"
              className="flex-1"
            />
            <Select
              value={form.mena}
              onValueChange={(v) => update("mena", v as Mena)}
            >
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MENA.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5 col-span-2">
          <Label>Špecifikácia / poznámka</Label>
          <Textarea
            value={form.popis}
            onChange={(e) => update("popis", e.target.value)}
            placeholder="Farba, rozmer, atest, RAL kód…"
            className="min-h-[70px]"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// STEP 2 — Spôsob zadania
// ============================================================

function Step2Mode({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        <strong className="text-foreground">Krok 2 z 4</strong> — Akým spôsobom
        chceš subdodávku zadať?
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ModeCard
          selected={form.mode === "rfq"}
          onClick={() => update("mode", "rfq")}
          icon={<Send className="h-5 w-5" />}
          title="Cez dopyt (RFQ)"
          description="Nevieš ešte koho. Rozošleš dopyt viacerým, porovnáš ponuky, vyberieš víťaza."
        />
        <ModeCard
          selected={form.mode === "direct"}
          onClick={() => update("mode", "direct")}
          icon={<Zap className="h-5 w-5" />}
          title="Rýchle zadanie"
          description="Už vieš ktorý dodávateľ. Vytvoríš priamo subdodávku bez RFQ procesu."
        />
      </div>
    </div>
  );
}

function ModeCard({
  selected,
  onClick,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left p-4 border-2 rounded-lg transition-all",
        selected
          ? "border-foreground bg-muted/40 ring-2 ring-foreground/10"
          : "border-border hover:border-muted-foreground/40"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "shrink-0 w-9 h-9 rounded-full flex items-center justify-center",
            selected ? "bg-foreground text-background" : "bg-muted"
          )}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {description}
          </div>
        </div>
        <div
          className={cn(
            "shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center",
            selected
              ? "border-foreground bg-foreground text-background"
              : "border-muted-foreground/40"
          )}
        >
          {selected && <Check className="h-3 w-3" />}
        </div>
      </div>
    </button>
  );
}

// ============================================================
// STEP 3 — Dodávatelia
// ============================================================

function Step3Suppliers({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        <strong className="text-foreground">Krok 3 z 4</strong> —{" "}
        {form.mode === "rfq"
          ? "Vyber dodávateľov, ktorým rozpošleme RFQ."
          : "Vyber dodávateľa pre priame zadanie."}
      </div>

      {form.mode === "direct" ? (
        <div className="space-y-1.5">
          <Label>
            Dodávateľ <span className="text-red-500">*</span>
          </Label>
          <SupplierPicker
            value={form.selected_supplier}
            onChange={(id) => update("selected_supplier", id)}
            placeholder="Vybrať dodávateľa pre priame zadanie…"
          />
          <p className="text-xs text-muted-foreground">
            Subdodávka bude vytvorená so stavom <strong>Vybraný dodávateľ</strong>{" "}
            a môžeš ju rovno objednať.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>
              Dodávatelia pre RFQ{" "}
              <span className="text-red-500">*</span>{" "}
              <span className="text-muted-foreground text-xs font-normal">
                (vyber 2 a viac pre porovnanie)
              </span>
            </Label>
            <SuppliersMultiPicker
              values={form.selected_suppliers}
              onChange={(ids) => update("selected_suppliers", ids)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Poznámka pre dodávateľov (voliteľné)</Label>
            <Textarea
              value={form.rfq_poznamka}
              onChange={(e) => update("rfq_poznamka", e.target.value)}
              placeholder="Špeciálne požiadavky, urgentnosť, dodacie podmienky…"
              className="min-h-[70px]"
            />
          </div>

          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-xs text-blue-900">
            <strong>Po odoslaní:</strong> Pre každého vybraného dodávateľa
            vznikne RFQ záznam (stav <em>Čaká na odpoveď</em>). Akonáhle ti
            dodávatelia pošlú ponuky, doplníš ich v detaile subdodávky a vyberieš
            víťaza. Stav subdodávky bude <strong>Dopyt rozposlaný</strong>.
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// STEP 4 — Potvrdenie
// ============================================================

function Step4Review({
  form,
  projects,
}: {
  form: FormState;
  projects: { project_id: string; project_name: string | null }[];
}) {
  const project = projects.find((p) => p.project_id === form.project_id);

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        <strong className="text-foreground">Krok 4 z 4</strong> — Skontroluj
        zadanie pred uložením.
      </div>

      <div className="rounded-lg border divide-y">
        <ReviewRow label="Projekt">
          <span className="font-mono text-xs">{form.project_id}</span>
          {project?.project_name && (
            <span className="ml-2">{project.project_name}</span>
          )}
        </ReviewRow>
        <ReviewRow label="Operácia">{form.nazov}</ReviewRow>
        {form.popis && (
          <ReviewRow label="Špecifikácia">
            <span className="whitespace-pre-wrap">{form.popis}</span>
          </ReviewRow>
        )}
        {(form.mnozstvo || form.jednotka) && (
          <ReviewRow label="Množstvo">
            {form.mnozstvo} {form.jednotka}
          </ReviewRow>
        )}
        {form.cena_predpokladana && (
          <ReviewRow label="Plánovaná cena">
            {form.cena_predpokladana} {form.mena}
          </ReviewRow>
        )}
        {form.potreba_do && (
          <ReviewRow label="Potreba do">{form.potreba_do}</ReviewRow>
        )}
        <ReviewRow label="Spôsob zadania">
          {form.mode === "rfq" ? (
            <span className="inline-flex items-center gap-1.5 text-blue-700">
              <Send className="h-3.5 w-3.5" />
              RFQ — rozpošle sa {form.selected_suppliers.length} dodávateľom
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-purple-700">
              <Zap className="h-3.5 w-3.5" />
              Rýchle zadanie — vybraný 1 dodávateľ
            </span>
          )}
        </ReviewRow>
      </div>
    </div>
  );
}

function ReviewRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
