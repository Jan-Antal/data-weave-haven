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
    className: "bg-gray-100 text-gray-700 border-gray-200 shadow-md",
    title: (
      <div className="flex items-center justify-between w-full gap-4">
        <span className="text-sm font-medium text-gray-700">Uloženo</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleUndo();
            dismiss();
          }}
          className="text-gray-500 font-medium hover:text-gray-700 transition-colors text-sm shrink-0"
        >
          Zpět
        </button>
      </div>
    ) as any,
    description: (
      <div className="mt-2 w-full">
        <div
          className="h-0.5 bg-gray-300 rounded-full origin-left"
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
