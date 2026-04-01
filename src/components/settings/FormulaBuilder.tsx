import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── Autocomplete items ─────────────────────────────────────

interface AutocompleteItem {
  label: string;
  type: "var" | "fn";
  insert: string;
}

const AC_ITEMS: AutocompleteItem[] = [
  { label: "scheduled_hours", type: "var", insert: "scheduled_hours" },
  { label: "hodiny_plan", type: "var", insert: "hodiny_plan" },
  { label: "prodejni_cena", type: "var", insert: "prodejni_cena" },
  { label: "eur_czk", type: "var", insert: "eur_czk" },
  { label: "marze", type: "var", insert: "marze" },
  { label: "production_pct", type: "var", insert: "production_pct" },
  { label: "hourly_rate", type: "var", insert: "hourly_rate" },
  { label: "itemCostCzk", type: "var", insert: "itemCostCzk" },
  { label: "past_hours", type: "var", insert: "past_hours" },
  { label: "current_hours", type: "var", insert: "current_hours" },
  { label: "day_idx", type: "var", insert: "day_idx" },
  { label: "tpv_cena", type: "var", insert: "tpv_cena" },
  { label: "pocet", type: "var", insert: "pocet" },
  { label: "percent", type: "var", insert: "percent" },
  { label: "totalCostCzk", type: "var", insert: "totalCostCzk" },
  { label: "FLOOR()", type: "fn", insert: "FLOOR(" },
  { label: "MIN()", type: "fn", insert: "MIN(" },
  { label: "MAX()", type: "fn", insert: "MAX(" },
  { label: "ROUND()", type: "fn", insert: "ROUND(" },
  { label: "ABS()", type: "fn", insert: "ABS(" },
  { label: "IF(,,)", type: "fn", insert: "IF(" },
  { label: "SUM()", type: "fn", insert: "SUM(" },
  { label: "AVG()", type: "fn", insert: "AVG(" },
];

// ─── Variable descriptions ──────────────────────────────────

const VAR_DESCRIPTIONS: Record<string, string> = {
  scheduled_hours: "Naplánované hodiny v danom bundle",
  hodiny_plan: "Celkové plánované hodiny projektu (z project_plan_hours)",
  prodejni_cena: "Predajná cena projektu (v mene projektu)",
  eur_czk: "Kurz EUR/CZK podľa roku vytvorenia projektu",
  marze: "Marža projektu (desatinné, napr. 0.15 = 15%)",
  production_pct: "Podiel výroby z predajnej ceny (desatinné, napr. 0.205)",
  hourly_rate: "Hodinová sadzba výroby v Kč (z production_settings)",
  itemCostCzk: "Nákladová cena položky prepočítaná na CZK",
  past_hours: "SUM hodín zo všetkých týždňov pred aktuálnym",
  current_hours: "SUM hodín z aktuálneho týždňa",
  day_idx: "Index dňa v týždni (0=Pondelok, 4=Piatok)",
  tpv_cena: "Predajná cena TPV položky (v mene projektu)",
  pocet: "Počet kusov TPV položky",
  percent: "Aktuálne % hotovosti zadané vedúcim výroby",
  totalCostCzk: "Súčet nákladových cien všetkých TPV položiek v CZK",
};

// ─── Preset formulas as HTML ────────────────────────────────

function tok(label: string, type: "var" | "fn"): string {
  const cls = type === "var" ? "fb-token-var" : "fb-token-fn";
  return `<span contenteditable="false" draggable="true" data-token="true" data-var="${label}" data-type="${type}" class="${cls}">${label}</span>`;
}

interface PresetDef {
  label: string;
  html: string;
  subVariants?: { key: string; label: string; html: string }[];
}

const PRESETS: Record<string, PresetDef> = {
  scheduled_czk: {
    label: "scheduled_czk",
    html: "",
    subVariants: [
      {
        key: "tpv",
        label: "TPV položky",
        html: `${tok("FLOOR(", "fn")} ${tok("tpv_cena", "var")} × ${tok("pocet", "var")} × ${tok("eur_czk", "var")} )`,
      },
      {
        key: "hist",
        label: "HIST bundles",
        html: `${tok("FLOOR(", "fn")} ${tok("scheduled_hours", "var")} ÷ ${tok("hodiny_plan", "var")} × ${tok("prodejni_cena", "var")} × ${tok("eur_czk", "var")} )`,
      },
    ],
  },
  scheduled_hours: {
    label: "scheduled_hours",
    html: `${tok("FLOOR(", "fn")} ${tok("itemCostCzk", "var")} × ( 1 - ${tok("marze", "var")} ) × ${tok("production_pct", "var")} ÷ ${tok("hourly_rate", "var")} )`,
  },
  weekly_goal_pct: {
    label: "weekly_goal_pct",
    html: `${tok("MIN(", "fn")} ${tok("FLOOR(", "fn")} ( ${tok("past_hours", "var")} + ${tok("current_hours", "var")} × ( ${tok("day_idx", "var")} + 1 ) ÷ 5 ) ÷ ${tok("hodiny_plan", "var")} × 100 ) , 100 )`,
  },
  hodiny_plan_projekt: {
    label: "hodiny_plan (projekt)",
    html: `${tok("FLOOR(", "fn")} ${tok("prodejni_cena", "var")} × ${tok("eur_czk", "var")} × ( 1 - ${tok("marze", "var")} ) × ${tok("production_pct", "var")} ÷ ${tok("hourly_rate", "var")} )`,
  },
  hodiny_plan_tpv: {
    label: "hodiny_plan (TPV item)",
    html: `${tok("FLOOR(", "fn")} ${tok("tpv_cena", "var")} × ${tok("pocet", "var")} × ${tok("eur_czk", "var")} × ( 1 - ${tok("marze", "var")} ) × ${tok("production_pct", "var")} ÷ ${tok("hourly_rate", "var")} )`,
  },
  is_on_track: {
    label: "is_on_track",
    html: `${tok("percent", "var")} >= ${tok("weekly_goal_pct", "var")}`,
  },
};

// ─── Default variable values ────────────────────────────────

const DEFAULT_VALUES: Record<string, number> = {
  scheduled_hours: 34.5,
  hodiny_plan: 1375,
  prodejni_cena: 1833885,
  eur_czk: 25,
  marze: 0.15,
  production_pct: 0.205,
  hourly_rate: 280,
  itemCostCzk: 922081,
  past_hours: 62,
  current_hours: 192,
  day_idx: 3,
  tpv_cena: 36720,
  pocet: 2,
  percent: 60,
  totalCostCzk: 922081,
  weekly_goal_pct: 45,
};

// ─── Evaluate ───────────────────────────────────────────────

function evaluateFromEditor(
  editorEl: HTMLDivElement | null,
  vars: Record<string, number>
): { formula: string; result: number | string } {
  if (!editorEl) return { formula: "", result: "—" };

  let formula = "";
  let expr = "";

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent || "";
      formula += t;
      expr += t.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.dataset.token === "true") {
        const v = el.dataset.var || "";
        formula += v;
        if (el.dataset.type === "fn") {
          const fnMap: Record<string, string> = {
            "FLOOR(": "Math.floor(",
            "MIN(": "Math.min(",
            "MAX(": "Math.max(",
            "ROUND(": "Math.round(",
            "ABS(": "Math.abs(",
            "IF(": "(",
            "SUM(": "(",
            "AVG(": "(",
          };
          expr += fnMap[v] ?? v;
        } else {
          expr += vars[v] ?? 0;
        }
      } else {
        node.childNodes.forEach(walk);
      }
    }
  };

  editorEl.childNodes.forEach(walk);

  expr = expr.replace(/>=/g, ">=").replace(/<=/g, "<=");

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${expr});`);
    const r = fn();
    if (typeof r === "boolean") return { formula, result: r ? "true ✓" : "false ✗" };
    return { formula, result: typeof r === "number" && !isNaN(r) ? r : "—" };
  } catch {
    return { formula, result: "Chyba syntaxe" };
  }
}

function getUsedVars(editorEl: HTMLDivElement | null): string[] {
  if (!editorEl) return [];
  const spans = editorEl.querySelectorAll('span[data-type="var"]');
  const set = new Set<string>();
  spans.forEach((s) => {
    const v = (s as HTMLElement).dataset.var;
    if (v) set.add(v);
  });
  return [...set];
}

// ─── Helper: get HTML for a preset key + sub-variant ────────

function getPresetHtml(presetKey: string, presets: Record<string, PresetDef>, subKey?: string): string {
  const preset = presets[presetKey];
  if (!preset) return "";
  if (preset.subVariants) {
    const variant = preset.subVariants.find((v) => v.key === subKey) ?? preset.subVariants[0];
    return variant.html;
  }
  return preset.html;
}

// ─── Component ──────────────────────────────────────────────

interface FormulaBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ConfirmAction = "close" | "switch-tab" | "restore-default";

export function FormulaBuilder({ open, onOpenChange }: FormulaBuilderProps) {
  const { toast } = useToast();

  const [activePreset, setActivePreset] = useState("scheduled_czk");
  const [activeSubVariant, setActiveSubVariant] = useState("tpv");
  const [varValues, setVarValues] = useState<Record<string, number>>({ ...DEFAULT_VALUES });
  const [usedVars, setUsedVars] = useState<string[]>([]);
  const [formulaResult, setFormulaResult] = useState<{ formula: string; result: number | string }>({ formula: "", result: "—" });

  // Dirty state
  const [isDirty, setIsDirty] = useState(false);

  // Saved formulas (in-memory only)
  const [savedFormulas, setSavedFormulas] = useState<Record<string, PresetDef>>(() => {
    // Deep clone PRESETS
    const clone: Record<string, PresetDef> = {};
    for (const [k, v] of Object.entries(PRESETS)) {
      clone[k] = {
        ...v,
        subVariants: v.subVariants ? v.subVariants.map((sv) => ({ ...sv })) : undefined,
      };
    }
    return clone;
  });

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>("close");
  const [pendingTabKey, setPendingTabKey] = useState<string | null>(null);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmDesc, setConfirmDesc] = useState("");
  const [confirmOk, setConfirmOk] = useState("");
  const [confirmCancel, setConfirmCancel] = useState("");

  // Autocomplete state
  const [acVisible, setAcVisible] = useState(false);
  const [acFilter, setAcFilter] = useState("");
  const [acIndex, setAcIndex] = useState(0);
  const [acPos, setAcPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [searchStart, setSearchStart] = useState<{ node: Node; offset: number } | null>(null);

  // Drag state
  const [dragOverPos, setDragOverPos] = useState<{ left: number; top: number; height: number } | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const acRef = useRef<HTMLDivElement>(null);

  const recalc = useCallback(() => {
    const el = editorRef.current;
    setUsedVars(getUsedVars(el));
    setFormulaResult(evaluateFromEditor(el, varValues));
  }, [varValues]);

  // Show a confirm dialog
  const showConfirm = useCallback((action: ConfirmAction, title: string, desc: string, ok: string, cancel: string, tabKey?: string) => {
    setConfirmAction(action);
    setConfirmTitle(title);
    setConfirmDesc(desc);
    setConfirmOk(ok);
    setConfirmCancel(cancel);
    setPendingTabKey(tabKey ?? null);
    setConfirmOpen(true);
  }, []);

  // Load preset from a source (savedFormulas or PRESETS)
  const loadFromSource = useCallback((key: string, source: Record<string, PresetDef>, subKey?: string) => {
    setActivePreset(key);
    const preset = source[key];
    if (preset?.subVariants) {
      const sk = subKey ?? preset.subVariants[0].key;
      setActiveSubVariant(sk);
    }
    if (editorRef.current) {
      editorRef.current.innerHTML = getPresetHtml(key, source, subKey ?? source[key]?.subVariants?.[0]?.key);
    }
    setAcVisible(false);
    setAcFilter("");
    setIsDirty(false);
    setTimeout(() => recalc(), 0);
  }, [recalc]);

  // Load preset (from savedFormulas)
  const loadPreset = useCallback((key: string, subKey?: string) => {
    loadFromSource(key, savedFormulas, subKey);
  }, [loadFromSource, savedFormulas]);

  // Try switching tab — check dirty first
  const tryLoadPreset = useCallback((key: string) => {
    if (isDirty) {
      showConfirm("switch-tab", "Máte neuložené zmeny", "Máte neuložené zmeny v aktuálnom vzorci. Zahodiť zmeny?", "Zahodiť", "Zostať", key);
    } else {
      loadPreset(key);
    }
  }, [isDirty, loadPreset, showConfirm]);

  // Load sub-variant
  const loadSubVariant = useCallback((subKey: string) => {
    setActiveSubVariant(subKey);
    if (editorRef.current) {
      editorRef.current.innerHTML = getPresetHtml(activePreset, savedFormulas, subKey);
    }
    setAcVisible(false);
    setAcFilter("");
    setIsDirty(false);
    setTimeout(() => recalc(), 0);
  }, [activePreset, recalc, savedFormulas]);

  // Save current editor content to savedFormulas
  const handleSave = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    setSavedFormulas((prev) => {
      const updated = { ...prev };
      const preset = { ...updated[activePreset] };
      if (preset.subVariants) {
        preset.subVariants = preset.subVariants.map((sv) =>
          sv.key === activeSubVariant ? { ...sv, html } : { ...sv }
        );
      } else {
        preset.html = html;
      }
      updated[activePreset] = preset;
      return updated;
    });
    setIsDirty(false);
    toast({ title: "Vzorec uložený", description: "Zmeny boli uložené (len v pamäti)." });
  }, [activePreset, activeSubVariant, toast]);

  // Restore to original PRESETS default
  const handleRestoreDefault = useCallback(() => {
    showConfirm(
      "restore-default",
      "Obnoviť predvolený vzorec",
      "Naozaj obnoviť predvolený vzorec? Vaše uložené zmeny pre tento vzorec budú stratené.",
      "Obnoviť",
      "Zrušiť"
    );
  }, [showConfirm]);

  // Try close — check dirty
  const tryClose = useCallback(() => {
    if (isDirty) {
      showConfirm("close", "Máte neuložené zmeny", "Chcete zahodiť zmeny a zavrieť?", "Zahodiť zmeny", "Pokračovať v úpravách");
    } else {
      onOpenChange(false);
    }
  }, [isDirty, onOpenChange, showConfirm]);

  // Handle confirm action
  const handleConfirmOk = useCallback(() => {
    setConfirmOpen(false);
    if (confirmAction === "close") {
      setIsDirty(false);
      onOpenChange(false);
    } else if (confirmAction === "switch-tab" && pendingTabKey) {
      setIsDirty(false);
      loadPreset(pendingTabKey);
    } else if (confirmAction === "restore-default") {
      // Reset savedFormulas for this preset to original PRESETS
      setSavedFormulas((prev) => {
        const updated = { ...prev };
        const original = PRESETS[activePreset];
        updated[activePreset] = {
          ...original,
          subVariants: original.subVariants ? original.subVariants.map((sv) => ({ ...sv })) : undefined,
        };
        return updated;
      });
      // Load from original PRESETS
      loadFromSource(activePreset, PRESETS, PRESETS[activePreset]?.subVariants?.[0]?.key);
      toast({ title: "Vzorec obnovený", description: "Predvolený vzorec bol obnovený." });
    }
  }, [confirmAction, pendingTabKey, loadPreset, loadFromSource, activePreset, onOpenChange, toast]);

  // Init on open
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        loadPreset(activePreset);
      }, 50);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Recalc when varValues change
  useEffect(() => {
    recalc();
  }, [varValues, recalc]);

  // Filtered AC items
  const acItems = useMemo(() => {
    if (!acFilter) return AC_ITEMS.slice(0, 8);
    const lower = acFilter.toLowerCase();
    return AC_ITEMS.filter((i) => i.label.toLowerCase().includes(lower)).slice(0, 8);
  }, [acFilter]);

  // Clamp acIndex
  useEffect(() => {
    if (acIndex >= acItems.length) setAcIndex(Math.max(0, acItems.length - 1));
  }, [acItems, acIndex]);

  // Get cursor position for dropdown
  const getCursorPos = useCallback((): { top: number; left: number } => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { top: 0, left: 0 };
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const editorRect = editorRef.current?.getBoundingClientRect();
    if (!editorRect) return { top: 0, left: 0 };
    return {
      top: rect.bottom - editorRect.top + 4,
      left: rect.left - editorRect.left,
    };
  }, []);

  // Insert token at cursor
  const insertToken = useCallback((item: AutocompleteItem) => {
    const el = editorRef.current;
    if (!el) return;

    if (searchStart) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = document.createRange();
        try {
          range.setStart(searchStart.node, searchStart.offset);
          range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
          range.deleteContents();
        } catch {
          // fallback
        }
      }
    }

    const span = document.createElement("span");
    span.contentEditable = "false";
    span.draggable = true;
    span.dataset.token = "true";
    span.dataset.var = item.insert;
    span.dataset.type = item.type;
    span.className = item.type === "var" ? "fb-token-var" : "fb-token-fn";
    span.textContent = item.insert;

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.collapse(false);
      range.insertNode(span);
      const after = document.createTextNode("\u200B");
      span.after(after);
      range.setStartAfter(after);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      el.appendChild(span);
      el.appendChild(document.createTextNode("\u200B"));
    }

    setAcVisible(false);
    setAcFilter("");
    setSearchStart(null);
    setIsDirty(true);
    setTimeout(() => recalc(), 0);
  }, [recalc, searchStart]);

  const handleInput = useCallback(() => {
    setIsDirty(true);
    setTimeout(() => recalc(), 0);
  }, [recalc]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (acVisible) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAcIndex((i) => Math.min(i + 1, acItems.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAcIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (acItems[acIndex]) insertToken(acItems[acIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAcVisible(false);
        setAcFilter("");
        setSearchStart(null);
        return;
      }
    }

    if (e.key.length === 1 && /[a-zA-Z_]/.test(e.key)) {
      if (!acVisible) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          setSearchStart({ node: range.startContainer, offset: range.startOffset });
        }
      }
      setTimeout(() => {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && searchStart) {
          try {
            const range = document.createRange();
            range.setStart(searchStart.node, searchStart.offset);
            range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
            const typed = range.toString();
            setAcFilter(typed + e.key);
          } catch {
            setAcFilter(e.key);
          }
        } else {
          setAcFilter(e.key);
        }
        setAcPos(getCursorPos());
        setAcVisible(true);
        setAcIndex(0);
      }, 0);
    } else if (acVisible && e.key === "Backspace") {
      setTimeout(() => {
        if (searchStart) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            try {
              const range = document.createRange();
              range.setStart(searchStart.node, searchStart.offset);
              range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
              const typed = range.toString();
              if (typed.length === 0) {
                setAcVisible(false);
                setAcFilter("");
                setSearchStart(null);
              } else {
                setAcFilter(typed);
              }
            } catch {
              setAcVisible(false);
              setSearchStart(null);
            }
          }
        }
      }, 0);
    } else if (acVisible && e.key.length === 1 && !/[a-zA-Z_]/.test(e.key)) {
      setAcVisible(false);
      setAcFilter("");
      setSearchStart(null);
    }
  }, [acVisible, acItems, acIndex, insertToken, getCursorPos, searchStart]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent) => {
    const target = e.target as HTMLElement;
    if (target.dataset.token === "true") {
      e.dataTransfer.setData("text/plain", "token-drag");
      e.dataTransfer.effectAllowed = "move";
      target.style.opacity = "0.4";
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const editorRect = editorRef.current?.getBoundingClientRect();
    if (editorRect) {
      setDragOverPos({
        left: e.clientX - editorRect.left,
        top: e.clientY - editorRect.top - 4,
        height: 24,
      });
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOverPos(null);
    const el = editorRef.current;
    if (!el) return;

    const draggedToken = el.querySelector('[style*="opacity: 0.4"]') as HTMLElement | null;
    if (!draggedToken) return;
    draggedToken.style.opacity = "1";

    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (range) {
      draggedToken.remove();
      range.insertNode(draggedToken);
      if (!draggedToken.nextSibling || (draggedToken.nextSibling as Text).textContent !== "\u200B") {
        draggedToken.after(document.createTextNode("\u200B"));
      }
    }

    setIsDirty(true);
    setTimeout(() => recalc(), 0);
  }, [recalc]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = "1";
    setDragOverPos(null);
  }, []);

  const currentPreset = PRESETS[activePreset];

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) tryClose(); }}>
        <DialogContent className="max-w-[780px] max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              Výpočetní logika
              {isDirty && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  Neuložené zmeny
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-background">
            {/* Warning banner */}
            <Alert className="border-warning/30 bg-warning/10">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-xs text-warning">
                Experimentálny režim — zmeny vzorcov sa zatiaľ nepremietajú do výpočtov. Slúži len na overenie logiky.
              </AlertDescription>
            </Alert>

            {/* Preset tabs */}
            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Vzorec</Label>
              <Tabs value={activePreset} onValueChange={(v) => tryLoadPreset(v)}>
                <TabsList className="w-auto flex-wrap h-auto gap-1 p-1">
                  {Object.entries(PRESETS).map(([key, p]) => (
                    <TabsTrigger key={key} value={key} className="text-xs font-medium">
                      {p.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {/* Sub-variant selector for scheduled_czk */}
            {currentPreset?.subVariants && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground mr-1">Varianta:</Label>
                {currentPreset.subVariants.map((sv) => (
                  <Button
                    key={sv.key}
                    variant={activeSubVariant === sv.key ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-3"
                    onClick={() => loadSubVariant(sv.key)}
                  >
                    {sv.label}
                  </Button>
                ))}
              </div>
            )}

            {/* Formula editor */}
            <div className="relative">
              <Label className="text-xs text-muted-foreground mb-1.5 block">Editor vzorca</Label>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                className="fb-editor outline-none w-full rounded-lg border border-input bg-card text-card-foreground"
                style={{
                  padding: "10px 12px",
                  minHeight: 52,
                  fontFamily: "monospace",
                  fontSize: 13,
                  lineHeight: "1.8",
                  cursor: "text",
                }}
              />

              {/* Drag insertion line */}
              {dragOverPos && (
                <div
                  className="absolute pointer-events-none bg-accent"
                  style={{
                    left: dragOverPos.left,
                    top: dragOverPos.top,
                    width: 2,
                    height: dragOverPos.height,
                    borderRadius: 1,
                    zIndex: 10,
                  }}
                />
              )}

              {/* Autocomplete dropdown */}
              {acVisible && acItems.length > 0 && (
                <div
                  ref={acRef}
                  className="absolute bg-popover border border-border rounded-lg shadow-md z-50 max-h-[260px] overflow-y-auto min-w-[220px]"
                  style={{
                    top: acPos.top + 40,
                    left: Math.max(0, Math.min(acPos.left, 500)),
                  }}
                >
                  {acItems.map((item, idx) => (
                    <button
                      key={item.label}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertToken(item);
                      }}
                      className={cn(
                        "w-full text-left flex items-center gap-2 px-3 py-2 text-sm transition-colors",
                        idx === acIndex ? "bg-muted" : "hover:bg-muted/50"
                      )}
                      style={{ fontFamily: "monospace", fontSize: 13 }}
                    >
                      <span
                        className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                          item.type === "var" ? "fb-token-var" : "fb-token-fn"
                        )}
                      >
                        {item.type === "var" ? "var" : "fn"}
                      </span>
                      <span className="text-popover-foreground">{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Variable values */}
            {usedVars.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Hodnoty premenných</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                  {usedVars.map((v) => (
                    <div key={v}>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-primary truncate min-w-0 flex-1" style={{ fontFamily: "monospace" }}>{v}</span>
                        <Input
                          type="number"
                          value={varValues[v] ?? 0}
                          onChange={(e) => {
                            setVarValues((prev) => ({ ...prev, [v]: Number(e.target.value) || 0 }));
                            setIsDirty(true);
                          }}
                          className="h-8 w-28 text-xs"
                        />
                      </div>
                      {VAR_DESCRIPTIONS[v] && (
                        <p className="text-xs text-muted-foreground mt-0.5 ml-0.5 leading-tight">{VAR_DESCRIPTIONS[v]}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live result */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <Label className="text-xs text-muted-foreground mb-1.5 block">Výsledok</Label>
              <p className="text-xs text-muted-foreground break-all leading-relaxed" style={{ fontFamily: "monospace" }}>{formulaResult.formula || "—"}</p>
              <p className="mt-2 text-2xl font-semibold text-accent" style={{ fontFamily: "monospace" }}>
                = {typeof formulaResult.result === "number" ? formulaResult.result.toLocaleString("cs-CZ") : formulaResult.result}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-border flex items-center justify-between bg-background">
            <Button variant="outline" size="sm" onClick={handleRestoreDefault}>
              Obnoviť predvolený
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={tryClose}>
                Zavrieť
              </Button>
              <Button size="sm" className="bg-accent hover:bg-accent/90 text-accent-foreground" onClick={handleSave}>
                Uložiť
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation AlertDialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{confirmCancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmOk}>{confirmOk}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
