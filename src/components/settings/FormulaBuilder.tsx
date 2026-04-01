import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Autocomplete items ─────────────────────────────────────

interface AutocompleteItem {
  label: string;
  type: "var" | "fn";
  insert: string; // what gets stored in data-var
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
  { label: "FLOOR()", type: "fn", insert: "FLOOR(" },
  { label: "MIN()", type: "fn", insert: "MIN(" },
  { label: "MAX()", type: "fn", insert: "MAX(" },
  { label: "ROUND()", type: "fn", insert: "ROUND(" },
  { label: "ABS()", type: "fn", insert: "ABS(" },
  { label: "IF(,,)", type: "fn", insert: "IF(" },
  { label: "SUM()", type: "fn", insert: "SUM(" },
  { label: "AVG()", type: "fn", insert: "AVG(" },
];

// ─── Preset formulas as HTML ────────────────────────────────

function tok(label: string, type: "var" | "fn"): string {
  const cls = type === "var"
    ? "fb-token-var"
    : "fb-token-fn";
  return `<span contenteditable="false" draggable="true" data-token="true" data-var="${label}" data-type="${type}" class="${cls}">${label}</span>`;
}

const PRESETS: Record<string, { label: string; html: string }> = {
  scheduled_czk: {
    label: "scheduled_czk",
    html: `${tok("FLOOR(", "fn")} ${tok("scheduled_hours", "var")} ÷ ${tok("hodiny_plan", "var")} × ${tok("prodejni_cena", "var")} × ${tok("eur_czk", "var")} )`,
  },
  scheduled_hours: {
    label: "scheduled_hours",
    html: `${tok("FLOOR(", "fn")} ${tok("itemCostCzk", "var")} × ( 1 - ${tok("marze", "var")} ) × ${tok("production_pct", "var")} ÷ ${tok("hourly_rate", "var")} )`,
  },
  weekly_goal_pct: {
    label: "weekly_goal_pct",
    html: `${tok("MIN(", "fn")} ${tok("FLOOR(", "fn")} ( ${tok("past_hours", "var")} + ${tok("current_hours", "var")} × ( ${tok("day_idx", "var")} + 1 ) ÷ 5 ) ÷ ${tok("hodiny_plan", "var")} × 100 ) , 100 )`,
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
          // Map function names
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

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${expr});`);
    const r = fn();
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

// ─── Component ──────────────────────────────────────────────

interface FormulaBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FormulaBuilder({ open, onOpenChange }: FormulaBuilderProps) {
  const [activePreset, setActivePreset] = useState("scheduled_czk");
  const [varValues, setVarValues] = useState<Record<string, number>>({ ...DEFAULT_VALUES });
  const [usedVars, setUsedVars] = useState<string[]>([]);
  const [formulaResult, setFormulaResult] = useState<{ formula: string; result: number | string }>({ formula: "", result: "—" });

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

  // Load preset
  const loadPreset = useCallback((key: string) => {
    setActivePreset(key);
    if (editorRef.current) {
      editorRef.current.innerHTML = PRESETS[key].html;
    }
    setAcVisible(false);
    setAcFilter("");
    setTimeout(() => recalc(), 0);
  }, [recalc]);

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

    // Remove the typed search text first
    if (searchStart) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = document.createRange();
        try {
          range.setStart(searchStart.node, searchStart.offset);
          range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
          range.deleteContents();
        } catch {
          // fallback: just proceed
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
      // Move cursor after token
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
    setTimeout(() => recalc(), 0);
  }, [recalc, searchStart]);

  // Handle input
  const handleInput = useCallback(() => {
    setTimeout(() => recalc(), 0);
  }, [recalc]);

  // Handle keydown
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

    // On letter key, start/continue autocomplete
    if (e.key.length === 1 && /[a-zA-Z_]/.test(e.key)) {
      // If not already in AC mode, record search start
      if (!acVisible) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          setSearchStart({ node: range.startContainer, offset: range.startOffset });
        }
      }
      setTimeout(() => {
        // Read text from searchStart to cursor
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
      // Non-letter typed while AC open → close AC
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
      (target as any)._dragSource = true;
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

    // Find the dragged token
    const draggedToken = el.querySelector('[style*="opacity: 0.4"]') as HTMLElement | null;
    if (!draggedToken) return;
    draggedToken.style.opacity = "1";

    // Insert at drop position using caretRangeFromPoint
    const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (range) {
      // Remove from old position
      draggedToken.remove();
      range.insertNode(draggedToken);
      // Add zero-width space after if needed
      if (!draggedToken.nextSibling || (draggedToken.nextSibling as Text).textContent !== "\u200B") {
        draggedToken.after(document.createTextNode("\u200B"));
      }
    }

    setTimeout(() => recalc(), 0);
  }, [recalc]);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = "1";
    setDragOverPos(null);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[780px] max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-lg font-semibold text-foreground">Výpočetní logika</DialogTitle>
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
            <Tabs value={activePreset} onValueChange={(v) => loadPreset(v)}>
              <TabsList className="w-auto">
                {Object.entries(PRESETS).map(([key, p]) => (
                  <TabsTrigger key={key} value={key} className="text-xs font-medium">
                    {p.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                {usedVars.map((v) => (
                  <div key={v} className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-primary truncate min-w-0 flex-1" style={{ fontFamily: "monospace" }}>{v}</span>
                    <Input
                      type="number"
                      value={varValues[v] ?? 0}
                      onChange={(e) => setVarValues((prev) => ({ ...prev, [v]: Number(e.target.value) || 0 }))}
                      className="h-8 w-28 text-xs"
                    />
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
        <div className="px-6 py-3 border-t border-border flex justify-end bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zavrieť
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
