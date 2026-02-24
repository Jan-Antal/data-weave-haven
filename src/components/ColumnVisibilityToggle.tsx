import { Columns3 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import {
  useAllColumnVisibility,
  COLUMN_GROUPS,
  ColumnVisibilityState,
} from "./ColumnVisibilityContext";

interface Props {
  tabKey: "projectInfo" | "pmStatus" | "tpvStatus";
  editMode?: boolean;
  onToggleEditMode?: () => void;
}

export function ColumnVisibilityToggle({ tabKey, editMode, onToggleEditMode }: Props) {
  const allVis = useAllColumnVisibility();
  const state: ColumnVisibilityState = allVis[tabKey];

  return (
    <TableHead
      className="w-[32px] min-w-[32px] p-0 sticky right-0 z-20"
      style={{
        background:
          "linear-gradient(hsl(var(--primary) / 0.05), hsl(var(--primary) / 0.05)), hsl(var(--card))",
      }}
    >
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="relative p-2 rounded hover:bg-muted/50 transition-colors"
            title="Zobrazení sloupců"
            type="button"
          >
            <Columns3 className="h-4 w-4 text-muted-foreground" />
            {editMode && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" />
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          side="bottom"
          avoidCollisions
          collisionPadding={16}
          sideOffset={4}
          className="w-56 p-0 z-[9999] bg-popover border shadow-md flex flex-col"
          style={{ maxHeight: "calc(100vh - 120px)" }}
        >
          {/* Edit-mode button */}
          {onToggleEditMode && (
            <div className="p-2 pb-0 shrink-0">
              <Button
                variant={editMode ? "default" : "outline"}
                size="sm"
                className="w-full mb-2 text-xs"
                onClick={onToggleEditMode}
              >
                {editMode ? "Dokončit úpravy" : "Upravit sloupce"}
              </Button>
              <Separator />
            </div>
          )}

          {/* Scrollable column list */}
          <div className="overflow-y-auto p-2 pt-1">
            {COLUMN_GROUPS.map((group) => {
              const groupCols = state.columns.filter(
                (c) => !c.locked && group.keys.includes(c.key)
              );
              if (groupCols.length === 0) return null;

              return (
                <div key={group.label} className="mb-2">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1">
                    {group.label}
                  </div>
                  {groupCols.map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={state.isVisible(col.key)}
                        onCheckedChange={() => state.toggleColumn(col.key)}
                      />
                      <span>{col.label}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </TableHead>
  );
}
