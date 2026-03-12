import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface DeadlineWarningDialogProps {
  open: boolean;
  projectName: string;
  deadlineLabel: string;
  deadlineDate: Date;
  weekLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeadlineWarningDialog({
  open,
  projectName,
  deadlineLabel,
  deadlineDate,
  weekLabel,
  onCancel,
  onConfirm,
}: DeadlineWarningDialogProps) {
  const formattedDate = format(deadlineDate, "d.M.yyyy");

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent className="z-[99999]" onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <AlertDialogTitle>Plánování po termínu</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm leading-relaxed">
            Projekt <strong>{projectName}</strong> má{" "}
            <strong>{deadlineLabel}</strong> {formattedDate}, ale plánujete ho do
            týdne <strong>{weekLabel}</strong>, který začíná po tomto termínu.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Zrušit</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Přesto naplánovat
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
