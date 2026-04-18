import { UserManagement } from "@/components/UserManagement";

/**
 * Inline rendering of UserManagement table — no Dialog wrapper.
 * Pomocné dialogy (Add user, Change password, Transfer, Confirm) zůstávají,
 * ale nejsou nad jiným modálem, takže neblokují UI.
 */
export function OsobyUzivatele() {
  return (
    <div className="h-full flex flex-col">
      <UserManagement open={true} onOpenChange={() => {}} inline />
    </div>
  );
}
