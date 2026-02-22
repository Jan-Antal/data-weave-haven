import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format, parse, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import { PeopleSelect } from "./PeopleSelect";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface InlineEditableCellProps {
  value: string | number | null;
  onSave: (value: string) => void;
  type?: "text" | "number" | "select" | "date" | "people" | "textarea";
  options?: string[];
  className?: string;
  displayValue?: React.ReactNode;
  peopleRole?: "PM" | "Konstruktér" | "Kalkulant";
}

export function InlineEditableCell({
  value,
  onSave,
  type = "text",
  options,
  className = "",
  displayValue,
  peopleRole,
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

  if (editing) {
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
      let selected: Date | undefined;
      for (const fmt of ["yyyy-MM-dd", "d.M.yyyy", "dd.MM.yyyy", "d/M/yyyy"]) {
        try {
          const d = parse(dateStr, fmt, new Date());
          if (isValid(d)) { selected = d; break; }
        } catch { /* skip */ }
      }

      return (
        <Popover open={true} onOpenChange={(open) => { if (!open) setEditing(false); }}>
          <PopoverTrigger asChild>
            <div className="h-7 flex items-center text-xs px-1 border rounded cursor-pointer overflow-hidden">
              <CalendarIcon className="h-3 w-3 mr-1 flex-shrink-0 text-muted-foreground" />
              <span className="truncate">{selected ? format(selected, "d.M.yyyy") : dateStr || "—"}</span>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(d) => {
                if (d) {
                  const formatted = format(d, "d.M.yyyy");
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
        <Textarea
          ref={textareaRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="text-xs px-1 py-1 w-full min-h-[1.75rem] resize-none"
          rows={Math.max(2, editValue.split("\n").length)}
          style={{ height: "auto" }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = el.scrollHeight + "px";
          }}
        />
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

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`cursor-pointer hover:bg-muted/80 rounded px-1 py-0.5 h-7 leading-7 truncate whitespace-nowrap overflow-hidden ${className}`}
            onClick={() => {
              setEditValue(String(value ?? ""));
              setEditing(true);
            }}
          >
            {displayValue ?? (value !== null && value !== undefined && value !== "" ? String(value) : "—")}
          </div>
        </TooltipTrigger>
        {textContent && textContent !== "—" && (
          <TooltipContent side="bottom" className="max-w-[300px] text-xs">
            {textContent}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
