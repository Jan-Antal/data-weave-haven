import { AlertTriangle } from "lucide-react";

export function TestModeBanner() {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium mb-3">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      Settings are read-only in TEST MODE
    </div>
  );
}
