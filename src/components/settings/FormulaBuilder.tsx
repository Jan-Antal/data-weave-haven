import { useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Token types ────────────────────────────────────────────

type TokenType = "variable" | "operator" | "function" | "number";

interface Token {
  id: string;
  label: string;
  type: TokenType;
}

let _tokenId = 0;
const makeToken = (label: string, type: TokenType): Token => ({
  id: `tok-${++_tokenId}-${Date.now()}`,
  label,
  type,
});

// ─── Palette items ──────────────────────────────────────────

const VARIABLES = [
  "scheduled_hours", "hodiny_plan", "prodejni_cena", "eur_czk",
  "marze", "production_pct", "hourly_rate", "itemCostCzk",
  "past_hours", "current_hours", "day_idx",
];

const OPERATORS = ["×", "÷", "+", "−", "(", ")"];
const FUNCTIONS = ["FLOOR(", "MIN(", "MAX("];
const NUMBERS = ["1", "5", "100", "0"];

// ─── Preset formulas ────────────────────────────────────────

const PRESETS: Record<string, { label: string; tokens: [string, TokenType][] }> = {
  scheduled_czk: {
    label: "scheduled_czk",
    tokens: [
      ["FLOOR(", "function"], ["(", "operator"],
      ["scheduled_hours", "variable"], ["÷", "operator"], ["hodiny_plan", "variable"],
      [")", "operator"], ["×", "operator"], ["(", "operator"],
      ["prodejni_cena", "variable"], ["×", "operator"], ["eur_czk", "variable"],
      [")", "operator"], [")", "operator"],
    ],
  },
  scheduled_hours: {
    label: "scheduled_hours",
    tokens: [
      ["FLOOR(", "function"],
      ["itemCostCzk", "variable"], ["×", "operator"], ["(", "operator"],
      ["1", "number"], ["−", "operator"], ["marze", "variable"],
      [")", "operator"], ["×", "operator"], ["production_pct", "variable"],
      ["÷", "operator"], ["hourly_rate", "variable"],
      [")", "operator"],
    ],
  },
  weekly_goal_pct: {
    label: "weekly_goal_pct",
    tokens: [
      ["MIN(", "function"],
      ["FLOOR(", "function"], ["(", "operator"],
      ["past_hours", "variable"], ["+", "operator"],
      ["current_hours", "variable"], ["×", "operator"], ["(", "operator"],
      ["day_idx", "variable"], ["+", "operator"], ["1", "number"],
      [")", "operator"], ["÷", "operator"], ["5", "number"],
      [")", "operator"], ["÷", "operator"], ["hodiny_plan", "variable"],
      ["×", "operator"], ["100", "number"],
      [")", "operator"],
      [",", "operator"], ["100", "number"], [")", "operator"],
    ],
  },
};

// ─── Token style helper ─────────────────────────────────────

function tokenColor(type: TokenType) {
  switch (type) {
    case "variable":
      return "bg-blue-900/60 text-blue-200 border-blue-700/50";
    case "operator":
      return "bg-[#1a2a1a] text-gray-300 border-gray-700/50";
    case "function":
      return "bg-amber-900/50 text-amber-200 border-amber-700/50";
    case "number":
      return "bg-green-900/50 text-green-200 border-green-700/50";
  }
}

function palettePillColor(type: TokenType) {
  switch (type) {
    case "variable":
      return "bg-blue-900/40 text-blue-300 border-blue-700/40 hover:bg-blue-800/50";
    case "operator":
      return "bg-[#1a2a1a] text-gray-400 border-gray-700/40 hover:bg-gray-700/40";
    case "function":
      return "bg-amber-900/30 text-amber-300 border-amber-700/40 hover:bg-amber-800/40";
    case "number":
      return "bg-green-900/30 text-green-300 border-green-700/40 hover:bg-green-800/40";
  }
}

// ─── Evaluator ──────────────────────────────────────────────

function evaluateFormula(tokens: Token[], vars: Record<string, number>): { text: string; result: number | string } {
  const text = tokens.map((t) => {
    if (t.type === "variable") return vars[t.label] ?? 0;
    if (t.type === "number") return t.label;
    if (t.label === "×") return "*";
    if (t.label === "÷") return "/";
    if (t.label === "−") return "-";
    if (t.label === "FLOOR(") return "Math.floor(";
    if (t.label === "MIN(") return "Math.min(";
    if (t.label === "MAX(") return "Math.max(";
    return t.label;
  }).join(" ");

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${text});`);
    const r = fn();
    return { text: tokens.map((t) => t.label).join(" "), result: typeof r === "number" && !isNaN(r) ? r : "—" };
  } catch {
    return { text: tokens.map((t) => t.label).join(" "), result: "Chyba syntaxe" };
  }
}

// ─── Default variable values ────────────────────────────────

const DEFAULT_VALUES: Record<string, number> = {
  scheduled_hours: 40,
  hodiny_plan: 200,
  prodejni_cena: 500000,
  eur_czk: 25,
  marze: 0.15,
  production_pct: 0.3,
  hourly_rate: 650,
  itemCostCzk: 120000,
  past_hours: 30,
  current_hours: 8,
  day_idx: 2,
};

// ─── Component ──────────────────────────────────────────────

interface FormulaBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FormulaBuilder({ open, onOpenChange }: FormulaBuilderProps) {
  const [activePreset, setActivePreset] = useState<string>("scheduled_czk");
  const [tokens, setTokens] = useState<Token[]>(() =>
    PRESETS.scheduled_czk.tokens.map(([l, t]) => makeToken(l, t))
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [varValues, setVarValues] = useState<Record<string, number>>({ ...DEFAULT_VALUES });
  const [customLabel, setCustomLabel] = useState("");
  const [customType, setCustomType] = useState<"number" | "variable">("number");

  const loadPreset = useCallback((key: string) => {
    setActivePreset(key);
    setTokens(PRESETS[key].tokens.map(([l, t]) => makeToken(l, t)));
    setSelectedId(null);
  }, []);

  const insertToken = useCallback((label: string, type: TokenType) => {
    const newTok = makeToken(label, type);
    setTokens((prev) => {
      if (!selectedId) return [...prev, newTok];
      const idx = prev.findIndex((t) => t.id === selectedId);
      if (idx === -1) return [...prev, newTok];
      const copy = [...prev];
      copy.splice(idx + 1, 0, newTok);
      return copy;
    });
    setSelectedId(newTok.id);
  }, [selectedId]);

  const removeToken = useCallback((id: string) => {
    setTokens((prev) => prev.filter((t) => t.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  const clearAll = useCallback(() => {
    setTokens([]);
    setSelectedId(null);
  }, []);

  // Detect variables used in formula
  const usedVars = useMemo(
    () => [...new Set(tokens.filter((t) => t.type === "variable").map((t) => t.label))],
    [tokens]
  );

  const { text: formulaText, result } = useMemo(
    () => evaluateFormula(tokens, varValues),
    [tokens, varValues]
  );

  const handleAddCustom = () => {
    const trimmed = customLabel.trim();
    if (!trimmed) return;
    insertToken(trimmed, customType);
    setCustomLabel("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[780px] max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden border-0"
        style={{ zIndex: 99999 }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-gray-800" style={{ background: "#0a1209" }}>
          <h2 className="text-lg font-semibold text-gray-100">Výpočetní logika</h2>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ background: "#0f1a0f" }}>
          {/* Warning banner */}
          <div className="mx-4 mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium"
            style={{ background: "rgba(234,175,60,0.12)", color: "#eaaf3c", border: "1px solid rgba(234,175,60,0.25)" }}>
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Experimentálny režim — zmeny vzorcov sa zatiaľ nepremietajú do výpočtov
          </div>

          {/* Preset tabs */}
          <div className="flex gap-1.5 px-4 mt-4">
            {Object.entries(PRESETS).map(([key, p]) => (
              <button
                key={key}
                onClick={() => loadPreset(key)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
                  activePreset === key
                    ? "text-white border-[#e8692a]"
                    : "text-gray-400 border-gray-700/50 hover:text-gray-200 hover:border-gray-600"
                )}
                style={activePreset === key ? { background: "rgba(232,105,42,0.2)", borderColor: "#e8692a" } : {}}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Formula canvas */}
          <div className="mx-4 mt-3">
            <Label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 block">Vzorec</Label>
            <div
              className="flex flex-wrap gap-1.5 min-h-[48px] p-2.5 rounded-lg border border-gray-700/50"
              style={{ background: "#0a1209" }}
            >
              {tokens.length === 0 && (
                <span className="text-gray-600 text-xs italic">Klikni na položku z palety…</span>
              )}
              {tokens.map((tok) => (
                <button
                  key={tok.id}
                  onClick={() => setSelectedId(selectedId === tok.id ? null : tok.id)}
                  className={cn(
                    "relative flex items-center gap-1 px-2 py-1 rounded text-xs font-mono border transition-all",
                    tokenColor(tok.type),
                    selectedId === tok.id && "ring-2 ring-[#e8692a] ring-offset-1 ring-offset-[#0a1209]"
                  )}
                >
                  {tok.label}
                  <span
                    onClick={(e) => { e.stopPropagation(); removeToken(tok.id); }}
                    className="ml-0.5 opacity-40 hover:opacity-100 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Palette */}
          <div className="mx-4 mt-4 space-y-3">
            <Label className="text-[10px] uppercase tracking-wider text-gray-500">Paleta</Label>

            {/* Variables */}
            <div>
              <span className="text-[10px] text-blue-400 font-medium uppercase tracking-wide">Premenné</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    onClick={() => insertToken(v, "variable")}
                    className={cn("px-2 py-1 rounded text-xs font-mono border transition-colors", palettePillColor("variable"))}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Operators & functions */}
            <div>
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">Operátory & funkcie</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {OPERATORS.map((o) => (
                  <button
                    key={o}
                    onClick={() => insertToken(o, "operator")}
                    className={cn("px-2.5 py-1 rounded text-xs font-mono border transition-colors", palettePillColor("operator"))}
                  >
                    {o}
                  </button>
                ))}
                {FUNCTIONS.map((f) => (
                  <button
                    key={f}
                    onClick={() => insertToken(f, "function")}
                    className={cn("px-2 py-1 rounded text-xs font-mono border transition-colors", palettePillColor("function"))}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Numbers */}
            <div>
              <span className="text-[10px] text-green-400 font-medium uppercase tracking-wide">Čísla</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {NUMBERS.map((n) => (
                  <button
                    key={n}
                    onClick={() => insertToken(n, "number")}
                    className={cn("px-2.5 py-1 rounded text-xs font-mono border transition-colors", palettePillColor("number"))}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom input */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-[10px] text-gray-500">Vlastný token</Label>
                <Input
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="napr. 0.85"
                  className="h-8 text-xs bg-[#0a1209] border-gray-700/50 text-gray-200"
                />
              </div>
              <Select value={customType} onValueChange={(v) => setCustomType(v as "number" | "variable")}>
                <SelectTrigger className="h-8 w-[110px] text-xs bg-[#0a1209] border-gray-700/50 text-gray-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="number">Číslo</SelectItem>
                  <SelectItem value="variable">Premenná</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8 text-xs" onClick={handleAddCustom}
                style={{ background: "#e8692a" }}>
                Pridať
              </Button>
            </div>

            <Button variant="ghost" size="sm" className="text-xs text-gray-500 hover:text-red-400" onClick={clearAll}>
              Vymazať všetko
            </Button>
          </div>

          {/* Variable values */}
          {usedVars.length > 0 && (
            <div className="mx-4 mt-5">
              <Label className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 block">Hodnoty premenných</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {usedVars.map((v) => (
                  <div key={v} className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-blue-300 truncate min-w-0 flex-1">{v}</span>
                    <Input
                      type="number"
                      value={varValues[v] ?? 0}
                      onChange={(e) => setVarValues((prev) => ({ ...prev, [v]: Number(e.target.value) || 0 }))}
                      className="h-7 w-24 text-xs bg-[#0a1209] border-gray-700/50 text-gray-200"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live result */}
          <div className="mx-4 mt-5 mb-5 rounded-lg p-3 border border-gray-700/50" style={{ background: "#0a1209" }}>
            <Label className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 block">Výsledok</Label>
            <p className="text-xs font-mono text-gray-400 break-all leading-relaxed">{formulaText || "—"}</p>
            <p className="mt-2 text-lg font-bold font-mono" style={{ color: "#e8692a" }}>
              = {typeof result === "number" ? result.toLocaleString("cs-CZ") : result}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-800 flex justify-end" style={{ background: "#0a1209" }}>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-gray-700 text-gray-300 hover:text-white">
            Zavrieť
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
