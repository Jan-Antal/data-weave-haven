import { useState } from "react";
import { UserManagement } from "@/components/UserManagement";

/**
 * Wrapper: reuses the existing UserManagement dialog content by mounting it
 * permanently open inside the Správa osob tab. UserManagement controls its own
 * Dialog wrapper, so we just keep it open while the parent tab is active.
 */
export function OsobyUzivatele() {
  // The original UserManagement is itself a Dialog. We render it always-open
  // here. When the parent SpravaOsob dialog closes, this component unmounts.
  const [open] = useState(true);
  return (
    <div className="h-full">
      <UserManagement open={open} onOpenChange={() => { /* controlled by parent */ }} />
    </div>
  );
}
