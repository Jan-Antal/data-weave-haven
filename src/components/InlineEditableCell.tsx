import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { formatAppDate, parseAppDate } from "@/lib/dateFormat";
import { cn } from "@/lib/utils";
import { PeopleSelect } from "./PeopleSelect";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { createPortal } from "react-dom";

function TextareaCellWithTooltip({
  value,
  displayValue,
  textContent,
  className,
  onStartEdit,
}: {
  value: string | number | null;
  displayValue?: React.ReactNode;
  textContent: string;
  className: string;
  onStartEdit: () => void;
}) {
  const cellRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{ top: number; left: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback(() => {
    if (!cellRef.current || !textContent || textContent === "—") return;
    const rect = cellRef.current.getBoundingClientRect();
    setTooltip({ top: rect.bottom + 4, left: rect.left });
  }, [textContent]);

  const hideTooltip = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setTooltip(null);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(showTooltip, 300);
  }, [showTooltip]);

  const handleMouseLeave = useCallback(() => {
    hideTooltip();
  }, [hideTooltip]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <>
      <div
        ref={cellRef}
        className={cn(
          "cursor-pointer hover:bg-muted/80 rounded px-1 py-0.5 overflow-hidden h-7 leading-7 truncate whitespace-nowrap text-xs",
          className
        )}
        onClick={onStartEdit}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {displayValue ?? (value !== null && value !== undefined && value !== "" ? String(value) : "—")}
      </div>
      {tooltip && createPortal(
        <div
          style={{
            position: "fixed",
            top: tooltip.top,
            left: tooltip.left,
            zIndex: 9999,
          }}
          className="max-w-[350px] rounded border border-border bg-muted p-2 text-xs leading-relaxed whitespace-pre-wrap shadow-md"
        >
          {textContent}
        </div>,
        document.body
      )}
    </>
  );
}

interface InlineEditableCellProps {
  value: string | number | null;
  onSave: (value: string) => void;
  type?: "text" | "number" | "select" | "date" | "people" | "textarea";
  options?: string[];
  className?: string;
  displayValue?: React.ReactNode;
  peopleRole?: "PM" | "Konstruktér" | "Kalkulant";
  readOnly?: boolean;
}

export function InlineEditableCell({
  value,
  onSave,
  type = "text",
  options,
  className = "",
  displayValue,
  peopleRole,
  readOnly = false,
}: InlineEditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
      }
    }
  }, [editing]);

  const handleSave = () => {
    setEditing(false);
    const original = String(value ?? "");
    if (editValue !== original) {
      onSave(editValue);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setEditValue(String(value ?? ""));
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  if (editing && !readOnly) {
    if (type === "people" && peopleRole) {
      return (
        <PeopleSelect
          role={peopleRole}
          value={editValue}
          onValueChange={(v) => {
            setEditing(false);
            const original = String(value ?? "");
            if (v !== original) onSave(v);
          }}
          open={true}
          onOpenChange={(open) => { if (!open) handleCancel(); }}
        />
      );
    }

    if (type === "select" && options) {
      return (
        <Select
          value={editValue}
          onValueChange={(v) => {
            setEditValue(v);
            setEditing(false);
            const original = String(value ?? "");
            if (v !== original) onSave(v);
          }}
          open={true}
          onOpenChange={(open) => { if (!open) handleCancel(); }}
        >
          <SelectTrigger className="h-7 text-xs w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (type === "date") {
      const dateStr = String(value ?? "");
      const selected = parseAppDate(dateStr);

      return (
        <Popover open={true} onOpenChange={(open) => { if (!open) setEditing(false); }}>
          <PopoverTrigger asChild>
            <div className="h-7 flex items-center text-xs px-1 border rounded cursor-pointer overflow-hidden">
              <CalendarIcon className="h-3 w-3 mr-1 flex-shrink-0 text-muted-foreground" />
              <span className="truncate">{selected ? formatAppDate(selected) : dateStr || "—"}</span>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(d) => {
                if (d) {
                  const formatted = formatAppDate(d);
                  setEditing(false);
                  const original = String(value ?? "");
                  if (formatted !== original) onSave(formatted);
                }
              }}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      );
    }

    if (type === "textarea") {
      return (
        <Popover open={true} onOpenChange={(open) => { if (!open) { handleSave(); } }}>
          <PopoverTrigger asChild>
            <div className="h-7 flex items-center text-xs px-1 truncate cursor-pointer">
              {editValue || "—"}
            </div>
          </PopoverTrigger>
          <PopoverContent
            className="w-[280px] p-1"
            align="start"
            side="bottom"
            onEscapeKeyDown={(e) => { e.preventDefault(); handleCancel(); }}
          >
            <Textarea
              ref={textareaRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="text-xs px-2 py-1.5 w-full min-h-[80px] resize-none border-0 focus-visible:ring-1"
              rows={4}
            />
          </PopoverContent>
        </Popover>
      );
    }

    return (
      <Input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        type={type === "number" ? "number" : "text"}
        className={cn("h-7 text-xs px-1 py-0 w-full overflow-x-auto", type === "number" && "no-spinners")}
      />
    );
  }

  const textContent = String(value ?? "");
  const isTextarea = type === "textarea";

  // For date cells, format the stored value for display
  const displayStr = type === "date" && textContent
    ? (() => { const d = parseAppDate(textContent); return d ? formatAppDate(d) : textContent; })()
    : textContent;

  if (isTextarea) {
    return (
      <TextareaCellWithTooltip
        value={value}
        displayValue={displayValue}
        textContent={textContent}
        className={className}
        onStartEdit={() => {
          if (readOnly) return;
          setEditValue(String(value ?? ""));
          setEditing(true);
        }}
      />
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "rounded px-1 py-0.5 overflow-hidden h-7 leading-7 truncate whitespace-nowrap text-xs",
              !readOnly && "cursor-pointer hover:bg-muted/80",
              className
            )}
            onClick={() => {
              if (readOnly) return;
              setEditValue(String(value ?? ""));
              setEditing(true);
            }}
          >
            {displayValue ?? (value !== null && value !== undefined && value !== "" ? displayStr : "—")}
          </div>
        </TooltipTrigger>
        {textContent && textContent !== "—" && (
          <TooltipContent side="bottom" className="max-w-[300px] text-xs whitespace-pre-wrap">
            {textContent}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
