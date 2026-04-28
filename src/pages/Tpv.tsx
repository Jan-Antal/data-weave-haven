import { useMemo } from "react";
import { TpvModule } from "@/components/tpv";
import type { TpvPermissions } from "@/components/tpv";
import { useAuth } from "@/hooks/useAuth";

/**
 * /tpv route — mounts the new 5-tab TPV module:
 *   Príprava | Subdodávky | Materiál | Hodiny | Dodávatelia
 *
 * Permissions are projected from the app's `useAuth()` flags into the
 * module's TpvPermissions shape and passed via `permissionsOverride`.
 *
 * The module's internal `computePermissions(role)` provides sensible defaults
 * for roles, but the override here is the source of truth — it reflects
 * the per-user / per-role config from `permissionPresets.ts`.
 */
export default function Tpv() {
  const auth = useAuth();

  const permissionsOverride = useMemo<Partial<TpvPermissions>>(() => {
    const canViewAny = auth.canAccessTpv;
    const canWriteAny = auth.canWriteTpv;

    return {
      canView: canViewAny,
      // Subdodávky
      canCreateSubcontract: auth.canWriteTpvSubdodavky,
      canEditSubcontract: auth.canWriteTpvSubdodavky,
      canDeleteSubcontract: auth.canWriteTpvSubdodavky && (auth.isAdmin || auth.isPM),
      canSendRFQ: auth.canWriteTpvSubdodavky,
      canAwardRFQ: auth.canWriteTpvSubdodavky && (auth.isAdmin || auth.isPM),
      // Dodávatelia
      canManageSupplier: auth.canWriteTpvDodavatelia,
      // Materiál
      canEditMaterial: auth.canWriteTpvMaterial,
      // Hodiny
      canSubmitHours: auth.canWriteTpvHodinovaDotacia,
      canApproveHours: auth.canWriteTpvHodinovaDotacia && (auth.isAdmin || auth.isPM || auth.isVyroba),
      // Príprava
      canEditPreparation: auth.canWriteTpvPriprava,
    };
  }, [auth]);

  // Choose initial tab based on what the user can see
  const initialTab = auth.canViewTpvSubdodavky
    ? "subdodavky"
    : auth.canViewTpvPriprava
      ? "priprava"
      : auth.canViewTpvMaterial
        ? "material"
        : auth.canViewTpvHodinovaDotacia
          ? "hodiny"
          : auth.canViewTpvDodavatelia
            ? "dodavatelia"
            : "subdodavky";

  return (
    <TpvModule
      role={auth.role}
      permissionsOverride={permissionsOverride}
      initialTab={initialTab}
    />
  );
}
