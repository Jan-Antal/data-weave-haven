import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface InlineEditableCellProps {
  value: string | number | null;
  onSave: (value: string) => void;
  type?: "text" | "number" | "select";
  options?: string[];
  className?: string;
  displayValue?: React.ReactNode;
}

export function InlineEditableCell({
  value,
  onSave,
  type = "text",
  options,
  className = "",
  displayValue,
}: InlineEditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
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
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  if (editing) {
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

    return (
      <Input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        type={type === "number" ? "number" : "text"}
        className="h-7 text-xs px-1 py-0"
      />
    );
  }

  return (
    <div
      className={`cursor-pointer hover:bg-muted/80 rounded px-1 py-0.5 min-h-[1.5rem] ${className}`}
      onClick={() => {
        setEditValue(String(value ?? ""));
        setEditing(true);
      }}
    >
      {displayValue ?? (value !== null && value !== undefined && value !== "" ? String(value) : "—")}
    </div>
  );
}
