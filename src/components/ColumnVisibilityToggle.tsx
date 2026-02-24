import { Columns3 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAllColumnVisibility, COLUMN_GROUPS, ColumnVisibilityState } from "./ColumnVisibilityContext";

interface ColumnVisibilityToggleProps {
  editMode?: boolean;
  onToggleEditMode?: () => void;
  /** Which tab's visibility state to control */
  tabKey: "projectInfo" | "pmStatus" | "tpvStatus";
}

export function ColumnVisibilityToggle({
  editMode,
  onToggleEditMode,
  tabKey,
}: ColumnVisibilityToggleProps) {
  const allVis = useAllColumnVisibility();
  const state: ColumnVisibilityState = allVis[tabKey];
  const allColumns = state.columns;

  return (
    <TableHead className="w-[32px] min-w-[32px] p-0 sticky right-0 z-20" style={{ background: 'linear-gradient(hsl(var(--primary) / 0.05), hsl(var(--primary) / 0.05)), hsl(var(--card))' }}>
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
        <PopoverContent align="end" className="w-60 p-0 z-[9999] bg-popover border shadow-md max-h-[70vh] flex flex-col">
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
          <div className="overflow-y-auto p-2 pt-1">
            <Accordion type="multiple" defaultValue={COLUMN_GROUPS.map(g => g.label)} className="w-full">
              {COLUMN_GROUPS.map((group) => {
                const groupColumns = allColumns.filter(
                  (col) => !col.locked && group.keys.includes(col.key)
                );
                if (groupColumns.length === 0) return null;
                return (
                  <AccordionItem key={group.label} value={group.label} className="border-b-0">
                    <AccordionTrigger className="py-1.5 px-2 text-xs font-semibold text-muted-foreground hover:no-underline">
                      {group.label}
                    </AccordionTrigger>
                    <AccordionContent className="pb-1 pt-0">
                      {groupColumns.map((col) => (
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
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        </PopoverContent>
      </Popover>
    </TableHead>
  );
}
