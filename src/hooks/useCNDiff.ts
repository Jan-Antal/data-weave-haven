import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TPVItem } from "@/hooks/useTPVItems";

export interface CNExtractedItem {
  kod_prvku: string;
  nazev: string;
  popis: string;
  cena: number;
  pocet: number;
}

export interface CNDiffAdded {
  type: "added";
  extracted: CNExtractedItem;
}

export interface CNDiffRemoved {
  type: "removed";
  current: TPVItem;
}

export interface CNDiffChanged {
  type: "changed";
  current: TPVItem;
  extracted: CNExtractedItem;
  changes: { field: string; oldVal: string | number; newVal: string | number }[];
}

export type CNDiffEntry = CNDiffAdded | CNDiffRemoved | CNDiffChanged;

export interface CNDiffResult {
  entries: CNDiffEntry[];
  sourceName: string;
}

export function useCNDiff(projectId: string, currentItems: TPVItem[]) {
  const [diff, setDiff] = useState<CNDiffResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const abortRef = useRef(false);

  const hasDifferences = diff !== null && diff.entries.length > 0;

  const clearDiff = useCallback(() => setDiff(null), []);

  const checkCN = useCallback(async () => {
    if (isChecking) return;
    setIsChecking(true);
    abortRef.current = false;

    try {
      // Step 1: Search for CN files
      const { data: searchData, error: searchErr } = await supabase.functions.invoke(
        "extract-tpv-from-sharepoint",
        { body: { projectId, action: "search" } }
      );
      if (searchErr || searchData?.error) throw new Error(searchData?.error || "Search failed");
      if (abortRef.current) return;

      const autoMatches: { itemId: string; name: string; size: number }[] = searchData.autoMatches || [];
      if (autoMatches.length === 0) {
        // No CN found — nothing to compare
        setDiff(null);
        return;
      }

      // Pick the first (best) match
      const pick = autoMatches[0];

      // Step 2: Extract items from the CN document
      const { data: extractData, error: extractErr } = await supabase.functions.invoke(
        "extract-tpv-from-sharepoint",
        { body: { projectId, action: "extract", fileItemId: pick.itemId } }
      );
      if (extractErr || extractData?.error) throw new Error(extractData?.error || "Extract failed");
      if (abortRef.current) return;

      const extracted: CNExtractedItem[] = (extractData.items || []).map((item: any) => ({
        kod_prvku: item.kod_prvku || item.item_name || "",
        nazev: item.nazev || item.kod_prvku || item.item_name || "",
        popis: item.popis || item.popis_full || "",
        cena: Number(item.cena) || 0,
        pocet: Number(item.pocet) || 1,
      }));

      // Step 3: Compute diff
      const activeItems = currentItems.filter((i) => !i.deleted_at);
      const entries: CNDiffEntry[] = [];

      // Build lookup by item_name (= kod_prvku)
      const currentByCode = new Map<string, TPVItem>();
      for (const item of activeItems) {
        if (item.item_code) currentByCode.set(item.item_code, item);
      }

      const matchedCodes = new Set<string>();

      for (const ext of extracted) {
        const code = ext.kod_prvku;
        if (!code) continue;

        const cur = currentByCode.get(code);
        if (!cur) {
          entries.push({ type: "added", extracted: ext });
        } else {
          matchedCodes.add(code);
          // Check for changes in cena, pocet, nazev
          const changes: { field: string; oldVal: string | number; newVal: string | number }[] = [];
          if ((cur.cena ?? 0) !== ext.cena) {
            changes.push({ field: "cena", oldVal: cur.cena ?? 0, newVal: ext.cena });
          }
          if ((cur.pocet ?? 1) !== ext.pocet) {
            changes.push({ field: "pocet", oldVal: cur.pocet ?? 1, newVal: ext.pocet });
          }
          if ((cur.nazev || "") !== ext.nazev) {
            changes.push({ field: "nazev", oldVal: cur.nazev || "", newVal: ext.nazev });
          }
          if (changes.length > 0) {
            entries.push({ type: "changed", current: cur, extracted: ext, changes });
          }
        }
      }

      // Removed: items in TPV but not in CN
      for (const item of activeItems) {
        if (item.item_code && !matchedCodes.has(item.item_code)) {
          // Check if not in extracted at all
          const inExtracted = extracted.some((e) => e.kod_prvku === item.item_code);
          if (!inExtracted) {
            entries.push({ type: "removed", current: item });
          }
        }
      }

      setDiff({ entries, sourceName: pick.name });
    } catch (err) {
      console.error("CN diff check failed:", err);
      // Silent fail — don't block user
      setDiff(null);
    } finally {
      setIsChecking(false);
    }
  }, [projectId, currentItems, isChecking]);

  return { diff, isChecking, hasDifferences, checkCN, clearDiff };
}
