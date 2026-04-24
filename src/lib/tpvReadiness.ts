import type { Tables } from "@/integrations/supabase/types";

export type ReadinessStatus = "rozpracovane" | "ready" | "riziko" | "blokovane";

export type TpvPreparation = Tables<"tpv_preparation">;
export type TpvMaterial = Tables<"tpv_material">;

export const READINESS_LABEL: Record<ReadinessStatus, string> = {
  rozpracovane: "Rozpracované",
  ready: "Ready",
  riziko: "Riziko",
  blokovane: "Blokované",
};

export const READINESS_BG: Record<ReadinessStatus, string> = {
  ready: "#EAF3DE",
  riziko: "#FAEEDA",
  blokovane: "#FCEBEB",
  rozpracovane: "#F1EFE8",
};

export const READINESS_FG: Record<ReadinessStatus, string> = {
  ready: "#27500A",
  riziko: "#633806",
  blokovane: "#791F1F",
  rozpracovane: "#5F5E5A",
};

/**
 * Compute readiness state for one tpv item from its preparation row + materials.
 *
 *  blokovane:    doc_ok = false
 *  riziko:       doc_ok = true AND any material in (nezadany, caka) OR no materials
 *  ready:        doc_ok = true AND all materials = dodane AND hodiny_schvalene
 *  rozpracovane: everything else
 */
export function computeReadiness(
  prep: Pick<TpvPreparation, "doc_ok" | "hodiny_schvalene"> | null | undefined,
  materials: Pick<TpvMaterial, "stav">[],
): ReadinessStatus {
  const docOk = prep?.doc_ok ?? false;
  const hoursOk = prep?.hodiny_schvalene ?? false;

  if (!docOk) return "blokovane";

  if (materials.length === 0) return "riziko";

  const hasUnready = materials.some((m) => m.stav === "nezadany" || m.stav === "caka");
  if (hasUnready) return "riziko";

  const allDelivered = materials.every((m) => m.stav === "dodane");
  if (allDelivered && hoursOk) return "ready";

  return "rozpracovane";
}

/** Aggregate material stav for one item display. */
export function aggregateMaterialStav(materials: Pick<TpvMaterial, "stav">[]): {
  label: string;
  color: string;
} {
  if (materials.length === 0) return { label: "—", color: "#5F5E5A" };
  if (materials.every((m) => m.stav === "dodane")) return { label: "Dodané", color: "#27500A" };
  if (materials.some((m) => m.stav === "caka")) return { label: "Čaká", color: "#633806" };
  if (materials.every((m) => m.stav === "objednane" || m.stav === "dodane")) return { label: "Objednané", color: "#1e40af" };
  return { label: "Nezadané", color: "#791F1F" };
}
