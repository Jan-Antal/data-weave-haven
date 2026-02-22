import { TableHead } from "@/components/ui/table";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

interface SortableHeaderProps {
  label: string;
  column: string;
  sortCol: string | null;
  sortDir: "asc" | "desc" | null;
  onSort: (col: string) => void;
  className?: string;
}

export function SortableHeader({ label, column, sortCol, sortDir, onSort, className = "" }: SortableHeaderProps) {
  const active = sortCol === column;
  return (
    <TableHead
      className={`font-semibold cursor-pointer select-none hover:bg-muted/50 ${className}`}
      onClick={() => onSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {active && sortDir === "asc" && <ArrowUp className="h-3 w-3" />}
        {active && sortDir === "desc" && <ArrowDown className="h-3 w-3" />}
        {!active && <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </div>
    </TableHead>
  );
}
