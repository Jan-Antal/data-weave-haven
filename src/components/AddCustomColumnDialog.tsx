import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCustomColumns, useAllCustomColumns } from "@/hooks/useCustomColumns";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
  groupKey: string;
  groupLabel: string;
}

const DATA_TYPES = [
  { value: "text", label: "Text" },
  { value: "date", label: "Datum" },
  { value: "number", label: "Číslo" },
  { value: "select", label: "Výběr" },
  { value: "people", label: "Osoba" },
];

const PEOPLE_ROLES = ["PM", "Konstruktér", "Kalkulant"];

const ALL_TAB_KEYS = ["project-info", "pm-status", "tpv-status"];

export function AddCustomColumnDialog({ open, onOpenChange, tableName, groupKey, groupLabel }: Props) {
  const [name, setName] = useState("");
  const [dataType, setDataType] = useState("text");
  const [selectOptions, setSelectOptions] = useState("");
  const [peopleRole, setPeopleRole] = useState("");
  const { addColumn } = useCustomColumns();
  const { columns: existingCustomColumns } = useAllCustomColumns(tableName);
  const qc = useQueryClient();

  const handleSubmit = async () => {
    if (!name.trim()) return;
    const columnKey = `custom_${Date.now()}_${name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}`;
    // Place new column after all existing ones
    const maxOrder = existingCustomColumns.reduce((max, c) => Math.max(max, c.sort_order ?? 0), 0);
    const nextOrder = maxOrder + 1;

    try {
      // 1. First, insert visibility entries for ALL tabs BEFORE creating the column definition
      // This ensures visibility is set up before the column appears in queries
      const visibilityPromises = ALL_TAB_KEYS.map((tab) => {
        return (supabase.from("column_labels") as any).insert({
          tab,
          column_key: columnKey,
          custom_label: "",
          visible: tab === groupKey,
        });
      });
      const visResults = await Promise.all(visibilityPromises);
      // Check for errors
      for (const r of visResults) {
        if (r.error) console.error("column_labels insert error:", r.error);
      }

      // 2. Invalidate column-labels so all tabs pick up the new visibility entries
      await qc.invalidateQueries({ queryKey: ["column-labels"] });

      // 3. Now create the custom column definition (this triggers custom-columns refetch)
      await addColumn.mutateAsync({
        table_name: tableName,
        group_key: groupKey,
        column_key: columnKey,
        label: name.trim(),
        data_type: dataType,
        select_options: dataType === "select" ? selectOptions.split(",").map(s => s.trim()).filter(Boolean) : [],
        people_role: dataType === "people" ? peopleRole : undefined,
        sort_order: nextOrder,
      });
    } catch (e) {
      console.error("Error creating custom column:", e);
    }

    setName("");
    setDataType("text");
    setSelectOptions("");
    setPeopleRole("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nový sloupec — {groupLabel}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Název sloupce</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Např. Materiál" autoFocus />
          </div>
          <div>
            <Label>Typ dat</Label>
            <Select value={dataType} onValueChange={setDataType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATA_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {dataType === "select" && (
            <div>
              <Label>Možnosti (oddělené čárkou)</Label>
              <Input value={selectOptions} onChange={e => setSelectOptions(e.target.value)} placeholder="Možnost 1, Možnost 2, Možnost 3" />
            </div>
          )}
          {dataType === "people" && (
            <div>
              <Label>Role osoby</Label>
              <Select value={peopleRole} onValueChange={setPeopleRole}>
                <SelectTrigger><SelectValue placeholder="Vyberte roli..." /></SelectTrigger>
                <SelectContent>
                  {PEOPLE_ROLES.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zrušit</Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>Přidat sloupec</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
