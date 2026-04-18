import { CapacitySettings } from "@/components/production/CapacitySettings";

/**
 * Kapacita tab — pouze inline CapacitySettings (graf + složení útvarů).
 * Sub-tab "Zaměstnanci v týdnu" odstraněn (duplicitní s hlavní záložkou Zaměstnanci).
 */
export function OsobyKapacita() {
  return (
    <div className="h-full overflow-hidden">
      <CapacitySettings open={true} onOpenChange={() => {}} inline />
    </div>
  );
}
