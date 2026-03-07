import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CostBreakdownPresetsSection } from "./CostBreakdownPresetsSection";
import { useAuth } from "@/hooks/useAuth";
import { TestModeBanner } from "./TestModeBanner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CostBreakdownPresetsDialog({ open, onOpenChange }: Props) {
  const { isTestUser } = useAuth();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px] max-h-[78vh] flex flex-col gap-0 p-0 overflow-hidden">
        <div className="px-5 pt-5 pb-3 border-b">
          <h2 className="text-lg font-semibold">💰 Rozpad ceny — Šablony</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isTestUser && <TestModeBanner />}
          <CostBreakdownPresetsSection readOnly={isTestUser} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
