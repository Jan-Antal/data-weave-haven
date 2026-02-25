import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const UNDO_DURATION = 5000;

interface UndoData {
  projectId: string;
  previousValues: Record<string, any>;
}

let currentUndoTimeout: ReturnType<typeof setTimeout> | null = null;
let currentUndoDismiss: (() => void) | null = null;

export function showUndoToast(
  projectId: string,
  previousValues: Record<string, any>,
  queryClient: ReturnType<typeof useQueryClient>
) {
  // Clear previous undo toast
  if (currentUndoTimeout) {
    clearTimeout(currentUndoTimeout);
    currentUndoTimeout = null;
  }
  if (currentUndoDismiss) {
    currentUndoDismiss();
    currentUndoDismiss = null;
  }

  const handleUndo = async () => {
    if (currentUndoTimeout) {
      clearTimeout(currentUndoTimeout);
      currentUndoTimeout = null;
    }
    const { error } = await supabase
      .from("projects")
      .update(previousValues as any)
      .eq("id", projectId);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Změny vráceny" });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  };

  const { dismiss } = toast({
    duration: UNDO_DURATION,
    className: "bg-gray-800 text-white border-gray-700",
    title: (
      <div className="flex items-center justify-between w-full gap-4">
        <span className="text-sm font-medium">Uloženo</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleUndo();
            dismiss();
          }}
          className="text-orange-400 font-medium hover:text-orange-300 transition-colors text-sm shrink-0"
        >
          Zpět
        </button>
      </div>
    ) as any,
    description: (
      <div className="mt-2 w-full">
        <div
          className="h-0.5 bg-orange-400/80 rounded-full origin-left"
          style={{
            animation: `undo-shrink ${UNDO_DURATION}ms linear forwards`,
          }}
        />
        <style>{`
          @keyframes undo-shrink {
            from { transform: scaleX(1); }
            to { transform: scaleX(0); }
          }
        `}</style>
      </div>
    ) as any,
  });

  currentUndoDismiss = dismiss;
  currentUndoTimeout = setTimeout(() => {
    currentUndoTimeout = null;
    currentUndoDismiss = null;
  }, UNDO_DURATION);
}
