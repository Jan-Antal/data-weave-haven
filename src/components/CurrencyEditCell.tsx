import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface CurrencyEditCellProps {
  value: number | null;
  currency: string;
  onSave: (amount: string, currency: string) => void;
  className?: string;
}

export function CurrencyEditCell({ value, currency, onSave, className = "" }: CurrencyEditCellProps) {
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(String(value ?? ""));
  const [editCurrency, setEditCurrency] = useState(currency || "CZK");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    setEditing(false);
    const origAmount = String(value ?? "");
    const origCurrency = currency || "CZK";
    if (editAmount !== origAmount || editCurrency !== origCurrency) {
      onSave(editAmount, editCurrency);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setEditAmount(String(value ?? ""));
    setEditCurrency(currency || "CZK");
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleSave(); }
    else if (e.key === "Escape") { e.preventDefault(); handleCancel(); }
  };

  const toggleCurrency = () => {
    setEditCurrency(prev => prev === "CZK" ? "EUR" : "CZK");
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          ref={inputRef}
          type="number"
          value={editAmount}
          onChange={(e) => setEditAmount(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="h-7 text-xs px-1 py-0 w-full no-spinners"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs font-sans shrink-0"
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleCurrency}
        >
          {editCurrency}
        </Button>
      </div>
    );
  }

  const displayText = formatCurrency(value, currency || "CZK");

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "cursor-pointer hover:bg-muted/80 rounded px-1 py-0.5 h-7 leading-7 truncate whitespace-nowrap overflow-hidden font-sans text-xs",
              className
            )}
            onClick={() => {
              setEditAmount(String(value ?? ""));
              setEditCurrency(currency || "CZK");
              setEditing(true);
            }}
          >
            {displayText}
          </div>
        </TooltipTrigger>
        {displayText !== "—" && (
          <TooltipContent side="bottom" className="max-w-[300px] text-xs">
            {displayText}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
