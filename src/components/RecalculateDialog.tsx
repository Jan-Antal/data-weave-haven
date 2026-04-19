import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface RecalculateDialogProps {
  open: boolean;
  onClose: () => void;
  onFutureOnly: () => void;
  onAll: () => void;
  /** When set, dialog shows progress UI and hides action buttons. */
  progress?: { phase: string; pct: number } | null;
}

export function RecalculateDialog({ open, onClose, onFutureOnly, onAll, progress }: RecalculateDialogProps) {
  const isRunning = !!progress;
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o && !isRunning) onClose(); }}>
      <AlertDialogContent className="z-[99999]">
        <AlertDialogHeader>
          <AlertDialogTitle>Přepočítat hodiny</AlertDialogTitle>
          <AlertDialogDescription>
            {isRunning
              ? "Probíhá přepočet, prosím vyčkejte..."
              : "Přepočítat pouze budoucí týdny, nebo všechna data včetně historie?"}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isRunning ? (
          <div className="space-y-3 py-2">
            <Progress value={progress!.pct} />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{progress!.phase}</span>
              <span className="tabular-nums">{progress!.pct}%</span>
            </div>
          </div>
        ) : (
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={onClose}>Zrušit</Button>
            <Button variant="secondary" onClick={onFutureOnly}>Jen budoucí</Button>
            <Button onClick={onAll}>Vše včetně historie</Button>
          </AlertDialogFooter>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
