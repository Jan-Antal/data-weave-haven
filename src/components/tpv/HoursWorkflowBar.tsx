import { useState } from "react";
import { Send, CheckCircle2, RotateCcw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import {
  useTpvHoursAllocations,
  useSubmitHoursAllocation,
  useApproveHoursAllocation,
  useReturnHoursAllocation,
  deriveProjectAllocationStav,
  type TpvHoursAllocationStav,
} from "@/hooks/useTpvHoursAllocation";

interface Props {
  projectId: string;
  items: Array<{ tpv_item_id: string; hodiny_effective: number }>;
}

const STAV_LABELS: Record<TpvHoursAllocationStav, string> = {
  draft: "Koncept",
  submitted: "Čaká na schválenie",
  approved: "Schválené",
  returned: "Vrátené k prepracovaniu",
};

const STAV_COLORS: Record<TpvHoursAllocationStav, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-blue-100 text-blue-800 border-blue-300",
  approved: "bg-green-100 text-green-800 border-green-300",
  returned: "bg-amber-100 text-amber-900 border-amber-300",
};

export function HoursWorkflowBar({ projectId, items }: Props) {
  const { role } = useAuth();
  const { data: rows = [], isLoading } = useTpvHoursAllocations(projectId);
  const submit = useSubmitHoursAllocation();
  const approve = useApproveHoursAllocation();
  const ret = useReturnHoursAllocation();

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");

  const stav = deriveProjectAllocationStav(rows);
  const canApprove = role === "owner" || role === "admin" || role === "pm";
  const lastReturned = rows.find((r) => r.stav === "returned" && r.return_reason);

  const handleSubmit = () => {
    submit.mutate({
      projectId,
      items: items.map((i) => ({ tpv_item_id: i.tpv_item_id, hodiny_navrh: i.hodiny_effective })),
    });
  };

  const handleReturn = () => {
    if (!returnReason.trim()) return;
    ret.mutate(
      { projectId, reason: returnReason.trim() },
      {
        onSuccess: () => {
          setReturnOpen(false);
          setReturnReason("");
        },
      },
    );
  };

  return (
    <div className="flex items-center justify-between px-3 py-3 border-t bg-muted/30">
      <div className="flex items-center gap-3">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Workflow</span>
        <Badge variant="outline" className={STAV_COLORS[stav]}>
          {stav === "submitted" && <Clock className="h-3 w-3 mr-1" />}
          {stav === "approved" && <CheckCircle2 className="h-3 w-3 mr-1" />}
          {STAV_LABELS[stav]}
        </Badge>
        {lastReturned && stav !== "approved" && (
          <span className="text-xs text-amber-800 italic max-w-md truncate" title={lastReturned.return_reason ?? ""}>
            Dôvod: {lastReturned.return_reason}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {(stav === "draft" || stav === "returned") && (
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submit.isPending || isLoading || items.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Send className="h-4 w-4 mr-1.5" />
            Odoslať na schválenie
          </Button>
        )}

        {stav === "submitted" && canApprove && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setReturnOpen(true)}
              disabled={ret.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-1.5" />
              Vrátiť
            </Button>
            <Button
              size="sm"
              onClick={() => approve.mutate({ projectId })}
              disabled={approve.isPending}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Schváliť
            </Button>
          </>
        )}

        {stav === "submitted" && !canApprove && (
          <span className="text-xs text-muted-foreground">Čaká na PM/Admin</span>
        )}

        {stav === "approved" && (
          <Button size="sm" variant="outline" onClick={handleSubmit} disabled={submit.isPending}>
            Znova odoslať (po úprave)
          </Button>
        )}
      </div>

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vrátiť k prepracovaniu</DialogTitle>
            <DialogDescription>
              Uveď dôvod, prečo sa návrh hodín vracia kalkulantovi.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            placeholder="Napr. nezohľadnené montážne hodiny pre prvok X…"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnOpen(false)}>Zrušiť</Button>
            <Button onClick={handleReturn} disabled={!returnReason.trim() || ret.isPending}>
              Vrátiť
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
