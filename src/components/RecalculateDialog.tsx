import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface RecalculateDialogProps {
  open: boolean;
  onClose: () => void;
  onFutureOnly: () => void;
  onAll: () => void;
}

export function RecalculateDialog({ open, onClose, onFutureOnly, onAll }: RecalculateDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent className="z-[99999]">
        <AlertDialogHeader>
          <AlertDialogTitle>Přepočítat hodiny</AlertDialogTitle>
          <AlertDialogDescription>
            Přepočítat pouze budoucí týdny, nebo všechna data včetně historie?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose}>Zrušit</Button>
          <Button variant="secondary" onClick={onFutureOnly}>Jen budoucí</Button>
          <Button onClick={onAll}>Vše včetně historie</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
