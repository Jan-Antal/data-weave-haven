import { Columns3 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import type { ColumnDef } from "@/hooks/useColumnVisibility";

interface ColumnVisibilityToggleProps {
  columns: ColumnDef[];
  isVisible: (key: string) => boolean;
  toggleColumn: (key: string) => void;
  editMode?: boolean;
  onToggleEditMode?: () => void;
}

export function ColumnVisibilityToggle({
  columns,
  isVisible,
  toggleColumn,
  editMode,
  onToggleEditMode,
}: ColumnVisibilityToggleProps) {
  return (
    <TableHead className="w-[32px] min-w-[32px] p-0 sticky right-0 bg-card z-20">
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="relative p-2 rounded hover:bg-muted/50 transition-colors"
            title="Zobrazení sloupců"
          >
            <Columns3 className="h-4 w-4 text-muted-foreground" />
            {editMode && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-2 z-[9999] bg-popover border shadow-md">
          {onToggleEditMode && (
            <>
              <Button
                variant={editMode ? "default" : "outline"}
                size="sm"
                className="w-full mb-2 text-xs"
                onClick={onToggleEditMode}
              >
                {editMode ? "Dokončit úpravy" : "Upravit sloupce"}
              </Button>
              <Separator className="mb-2" />
            </>
          )}
          <div className="text-xs font-semibold text-muted-foreground px-2 py-1 mb-1">
            Sloupce
          </div>
          {columns.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer text-sm"
            >
              <Checkbox
                checked={isVisible(col.key)}
                disabled={col.locked}
                onCheckedChange={() => toggleColumn(col.key)}
              />
              <span className={col.locked ? "text-muted-foreground" : ""}>
                {col.label}
              </span>
            </label>
          ))}
        </PopoverContent>
      </Popover>
    </TableHead>
  );
}
