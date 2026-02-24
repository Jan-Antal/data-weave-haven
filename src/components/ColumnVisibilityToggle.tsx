import { Columns3 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAllColumnVisibility } from "./ColumnVisibilityContext";

interface ColumnVisibilityToggleProps {
  editMode?: boolean;
  onToggleEditMode?: () => void;
}

export function ColumnVisibilityToggle({
  editMode,
  onToggleEditMode,
}: ColumnVisibilityToggleProps) {
  const { projectInfo, pmStatus, tpvStatus } = useAllColumnVisibility();

  const groups = [
    { label: "Project Info", state: projectInfo },
    { label: "PM Status", state: pmStatus },
    { label: "TPV Status", state: tpvStatus },
  ];

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
        <PopoverContent align="end" className="w-60 p-2 z-[9999] bg-popover border shadow-md max-h-[70vh] overflow-y-auto">
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
          <Accordion type="multiple" defaultValue={["Project Info", "PM Status", "TPV Status"]} className="w-full">
            {groups.map((group) => (
              <AccordionItem key={group.label} value={group.label} className="border-b-0">
                <AccordionTrigger className="py-1.5 px-2 text-xs font-semibold text-muted-foreground hover:no-underline">
                  {group.label}
                </AccordionTrigger>
                <AccordionContent className="pb-1 pt-0">
                  {group.state.columns
                    .filter((col) => !col.locked)
                    .map((col) => (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={group.state.isVisible(col.key)}
                          onCheckedChange={() => group.state.toggleColumn(col.key)}
                        />
                        <span>{col.label}</span>
                      </label>
                    ))}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </PopoverContent>
      </Popover>
    </TableHead>
  );
}
