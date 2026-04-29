/**
 * Materiál API — Supabase queries (rewritten for new schema, PR #6).
 *
 * Joins:
 *   - tpv_material → projects        (FK exists, embedded ok)
 *   - tpv_material → tpv_supplier    (FK exists, embedded ok)
 *   - tpv_material → tpv_material_item_link → tpv_items  (manual weave)
 */

import { supabase } from "@/integrations/supabase/client";
import type {
  TpvMaterialRow,
  TpvMaterialItemLinkRow,
  TpvMaterialSampleRow,
  MaterialView,
  SampleView,
  MaterialFilters,
  CreateMaterialInput,
  UpdateMaterialInput,
  UpsertLinkInput,
  MergeMaterialsInput,
  CreateSampleInput,
  UpdateSampleInput,
  MaterialStav,
} from "../types";
import { MATERIAL_STAV } from "../types";

// ============================================================
// READ — list with weaved links
// ============================================================

const SELECT_MATERIAL_BASE = `
  *,
  project:projects(
    project_id, project_name, pm, klient, status, is_active
  ),
  supplier:tpv_supplier(
    id, nazov
  )
` as const;

/**
 * Fetch materials with project + supplier (embedded) and links (separate query weaved).
 */
export async function fetchMaterials(
  filters: MaterialFilters = {}
): Promise<MaterialView[]> {
  let query = supabase
    .from("tpv_material")
    .select(SELECT_MATERIAL_BASE)
    .order("internal_code", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (filters.project_id) query = query.eq("project_id", filters.project_id);
  if (filters.prefix) query = query.eq("prefix", filters.prefix);
  if (filters.kategoria) query = query.eq("kategoria", filters.kategoria);
  if (filters.stav) {
    if (Array.isArray(filters.stav)) query = query.in("stav", filters.stav);
    else query = query.eq("stav", filters.stav);
  }
  if (filters.dodava_arkhe !== undefined)
    query = query.eq("dodava_arkhe", filters.dodava_arkhe);
  if (filters.nutno_vzorovat !== undefined)
    query = query.eq("nutno_vzorovat", filters.nutno_vzorovat);
  if (filters.ai_extracted !== undefined)
    query = query.eq("ai_extracted", filters.ai_extracted);
  if (filters.search?.trim()) {
    const s = filters.search.trim();
    query = query.or(
      `nazov.ilike.%${s}%,specifikacia.ilike.%${s}%,internal_code.ilike.%${s}%,produkt_ref.ilike.%${s}%,poznamky.ilike.%${s}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  const baseRows =
    (data as Array<TpvMaterialRow & {
      project: MaterialView["project"];
      supplier: MaterialView["supplier"];
    }>) ?? [];
  if (baseRows.length === 0) return [];

  let materials = baseRows;
  if (filters.active_only !== false) {
    materials = materials.filter((m) => m.project?.is_active !== false);
  }
  if (materials.length === 0) return [];

  // Fetch links for these materials
  const materialIds = materials.map((m) => m.id);
  const linksRes = await supabase
    .from("tpv_material_item_link")
    .select(
      `
      *,
      tpv_item:tpv_items(
        id, project_id, item_code, nazev, popis, status
      )
    `
    )
    .in("material_id", materialIds);
  if (linksRes.error) throw linksRes.error;
  const allLinks =
    (linksRes.data as Array<
      TpvMaterialItemLinkRow & { tpv_item: MaterialView["links"][number]["tpv_item"] }
    >) ?? [];

  const linksByMaterial = new Map<string, MaterialView["links"]>();
  for (const link of allLinks) {
    const arr = linksByMaterial.get(link.material_id) ?? [];
    arr.push(link);
    linksByMaterial.set(link.material_id, arr);
  }

  return materials.map((m) => ({
    ...m,
    links: linksByMaterial.get(m.id) ?? [],
  }));
}

export async function fetchMaterialById(
  id: string
): Promise<MaterialView | null> {
  const { data, error } = await supabase
    .from("tpv_material")
    .select(SELECT_MATERIAL_BASE)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const linksRes = await supabase
    .from("tpv_material_item_link")
    .select(
      `
      *,
      tpv_item:tpv_items(
        id, project_id, item_code, nazev, popis, status
      )
    `
    )
    .eq("material_id", id);
  if (linksRes.error) throw linksRes.error;

  return {
    ...(data as MaterialView),
    links: (linksRes.data as MaterialView["links"]) ?? [],
  };
}

// ============================================================
// CREATE / UPDATE / DELETE — material
// ============================================================

function trimOrNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function createMaterial(
  input: CreateMaterialInput
): Promise<TpvMaterialRow> {
  const payload = {
    project_id: input.project_id,
    internal_code: trimOrNull(input.internal_code),
    prefix: input.prefix ?? null,
    nazov: input.nazov.trim(),
    specifikacia: trimOrNull(input.specifikacia),
    hrana: trimOrNull(input.hrana),
    kategoria: trimOrNull(input.kategoria),
    dodava_arkhe: input.dodava_arkhe ?? false,
    nutno_vzorovat: input.nutno_vzorovat ?? true,
    poznamky: trimOrNull(input.poznamky),
    jednotka: trimOrNull(input.jednotka),
    cena_jednotkova: input.cena_jednotkova ?? null,
    mena: input.mena ?? "CZK",
    dodavatel_id: input.dodavatel_id ?? null,
    produkt_ref: trimOrNull(input.produkt_ref),
    stav: (input.stav ?? "confirmed") as MaterialStav,
    ai_extracted: input.ai_extracted ?? false,
    ai_confidence: input.ai_confidence ?? null,
    ai_source_doc: trimOrNull(input.ai_source_doc),
  };
  const { data, error } = await supabase
    .from("tpv_material")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvMaterialRow;
}

export async function updateMaterial(
  input: UpdateMaterialInput
): Promise<TpvMaterialRow> {
  const { id, ...rest } = input;
  const patch: Record<string, unknown> = {};
  if (rest.internal_code !== undefined)
    patch.internal_code = trimOrNull(rest.internal_code);
  if (rest.prefix !== undefined) patch.prefix = rest.prefix;
  if (rest.nazov !== undefined) patch.nazov = rest.nazov.trim();
  if (rest.specifikacia !== undefined)
    patch.specifikacia = trimOrNull(rest.specifikacia);
  if (rest.hrana !== undefined) patch.hrana = trimOrNull(rest.hrana);
  if (rest.kategoria !== undefined)
    patch.kategoria = trimOrNull(rest.kategoria);
  if (rest.dodava_arkhe !== undefined)
    patch.dodava_arkhe = rest.dodava_arkhe;
  if (rest.nutno_vzorovat !== undefined)
    patch.nutno_vzorovat = rest.nutno_vzorovat;
  if (rest.poznamky !== undefined)
    patch.poznamky = trimOrNull(rest.poznamky);
  if (rest.jednotka !== undefined)
    patch.jednotka = trimOrNull(rest.jednotka);
  if (rest.cena_jednotkova !== undefined)
    patch.cena_jednotkova = rest.cena_jednotkova;
  if (rest.mena !== undefined) patch.mena = rest.mena;
  if (rest.dodavatel_id !== undefined)
    patch.dodavatel_id = rest.dodavatel_id;
  if (rest.produkt_ref !== undefined)
    patch.produkt_ref = trimOrNull(rest.produkt_ref);
  if (rest.stav !== undefined) patch.stav = rest.stav;

  const { data, error } = await supabase
    .from("tpv_material")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvMaterialRow;
}

export async function deleteMaterial(id: string): Promise<void> {
  const { error } = await supabase.from("tpv_material").delete().eq("id", id);
  if (error) throw error;
}

// ============================================================
// LINKS — material ↔ items
// ============================================================

export async function upsertLink(
  input: UpsertLinkInput
): Promise<TpvMaterialItemLinkRow> {
  // Try fetch existing
  const existingRes = await supabase
    .from("tpv_material_item_link")
    .select("*")
    .eq("material_id", input.material_id)
    .eq("tpv_item_id", input.tpv_item_id)
    .maybeSingle();
  if (existingRes.error) throw existingRes.error;
  const existing = existingRes.data as TpvMaterialItemLinkRow | null;

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (input.mnozstvo_per_item !== undefined)
      patch.mnozstvo_per_item = input.mnozstvo_per_item;
    if (input.jednotka !== undefined) patch.jednotka = input.jednotka;
    if (input.occurrences !== undefined) patch.occurrences = input.occurrences;
    if (input.notes !== undefined) patch.notes = input.notes;
    const { data, error } = await supabase
      .from("tpv_material_item_link")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data as TpvMaterialItemLinkRow;
  }

  const { data, error } = await supabase
    .from("tpv_material_item_link")
    .insert({
      material_id: input.material_id,
      tpv_item_id: input.tpv_item_id,
      mnozstvo_per_item: input.mnozstvo_per_item ?? null,
      jednotka: input.jednotka ?? null,
      occurrences: input.occurrences ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvMaterialItemLinkRow;
}

export async function removeLink(linkId: string): Promise<void> {
  const { error } = await supabase
    .from("tpv_material_item_link")
    .delete()
    .eq("id", linkId);
  if (error) throw error;
}

// ============================================================
// MERGE — combine multiple materials into one (post-sampling consolidation)
// ============================================================

/**
 * Merge source materials into target:
 *   1. Move all links from source → target (skip duplicates per (material, item) pair)
 *   2. Move all samples from source → target (re-numbered poradie)
 *   3. Delete source materials
 *
 * Done as a sequence of API calls because PostgREST has no transaction
 * semantics for client-side. If a step fails partway, you'll have
 * partial state — UI should show an error and let user retry.
 */
export async function mergeMaterials(
  input: MergeMaterialsInput
): Promise<void> {
  const { target_id, source_ids } = input;
  if (!source_ids.length) return;

  // 1) Pull all links from sources, then upsert into target
  const sourceLinksRes = await supabase
    .from("tpv_material_item_link")
    .select("*")
    .in("material_id", source_ids);
  if (sourceLinksRes.error) throw sourceLinksRes.error;
  const sourceLinks =
    (sourceLinksRes.data as TpvMaterialItemLinkRow[]) ?? [];

  // Group by tpv_item_id: sum mnozstvo_per_item
  type LinkAgg = {
    tpv_item_id: string;
    mnozstvo_sum: number;
    jednotka: string | null;
    occurrences_sum: number;
    notes: string | null;
  };
  const byItem = new Map<string, LinkAgg>();
  for (const l of sourceLinks) {
    const ex = byItem.get(l.tpv_item_id);
    if (ex) {
      ex.mnozstvo_sum += l.mnozstvo_per_item ?? 0;
      ex.occurrences_sum += l.occurrences ?? 0;
      if (!ex.notes && l.notes) ex.notes = l.notes;
    } else {
      byItem.set(l.tpv_item_id, {
        tpv_item_id: l.tpv_item_id,
        mnozstvo_sum: l.mnozstvo_per_item ?? 0,
        jednotka: l.jednotka,
        occurrences_sum: l.occurrences ?? 0,
        notes: l.notes,
      });
    }
  }

  // Upsert each into target (adding to existing target link if any)
  for (const agg of byItem.values()) {
    const existingRes = await supabase
      .from("tpv_material_item_link")
      .select("*")
      .eq("material_id", target_id)
      .eq("tpv_item_id", agg.tpv_item_id)
      .maybeSingle();
    if (existingRes.error) throw existingRes.error;
    const existing = existingRes.data as TpvMaterialItemLinkRow | null;

    if (existing) {
      const newMnozstvo =
        (existing.mnozstvo_per_item ?? 0) + agg.mnozstvo_sum;
      const newOcc = (existing.occurrences ?? 0) + agg.occurrences_sum;
      const { error } = await supabase
        .from("tpv_material_item_link")
        .update({
          mnozstvo_per_item: newMnozstvo,
          occurrences: newOcc,
          notes: existing.notes ?? agg.notes,
        })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("tpv_material_item_link")
        .insert({
          material_id: target_id,
          tpv_item_id: agg.tpv_item_id,
          mnozstvo_per_item: agg.mnozstvo_sum || null,
          jednotka: agg.jednotka,
          occurrences: agg.occurrences_sum || null,
          notes: agg.notes,
        });
      if (error) throw error;
    }
  }

  // 2) Move samples (renumber poradie)
  const targetSamplesRes = await supabase
    .from("tpv_material_sample")
    .select("poradie")
    .eq("material_id", target_id)
    .order("poradie", { ascending: false })
    .limit(1);
  if (targetSamplesRes.error) throw targetSamplesRes.error;
  let nextPoradie =
    ((targetSamplesRes.data?.[0]?.poradie as number | undefined) ?? 0) + 1;

  const sourceSamplesRes = await supabase
    .from("tpv_material_sample")
    .select("*")
    .in("material_id", source_ids)
    .order("poradie", { ascending: true });
  if (sourceSamplesRes.error) throw sourceSamplesRes.error;
  const sourceSamples =
    (sourceSamplesRes.data as TpvMaterialSampleRow[]) ?? [];

  for (const s of sourceSamples) {
    const { error } = await supabase
      .from("tpv_material_sample")
      .update({ material_id: target_id, poradie: nextPoradie })
      .eq("id", s.id);
    if (error) throw error;
    nextPoradie += 1;
  }

  // 3) Delete source materials (CASCADE removes any leftover links)
  const { error: delErr } = await supabase
    .from("tpv_material")
    .delete()
    .in("id", source_ids);
  if (delErr) throw delErr;
}

// ============================================================
// SAMPLES
// ============================================================

export async function fetchSamplesForMaterial(
  materialId: string
): Promise<TpvMaterialSampleRow[]> {
  const { data, error } = await supabase
    .from("tpv_material_sample")
    .select("*")
    .eq("material_id", materialId)
    .order("poradie", { ascending: true });
  if (error) throw error;
  return (data as TpvMaterialSampleRow[]) ?? [];
}

export async function createSample(
  input: CreateSampleInput
): Promise<TpvMaterialSampleRow> {
  // If poradie not provided, append after existing samples
  let poradie = input.poradie;
  if (poradie == null) {
    const { data: latest } = await supabase
      .from("tpv_material_sample")
      .select("poradie")
      .eq("material_id", input.material_id)
      .order("poradie", { ascending: false })
      .limit(1);
    poradie = ((latest?.[0]?.poradie as number | undefined) ?? 0) + 1;
  }
  const { data, error } = await supabase
    .from("tpv_material_sample")
    .insert({
      material_id: input.material_id,
      poradie,
      nazov_vzorky: input.nazov_vzorky.trim(),
      specifikacia: trimOrNull(input.specifikacia),
      foto_url: trimOrNull(input.foto_url),
      stav: input.stav ?? "navrhnute",
      poznamka: trimOrNull(input.poznamka),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvMaterialSampleRow;
}

export async function updateSample(
  input: UpdateSampleInput
): Promise<TpvMaterialSampleRow> {
  const { id, ...rest } = input;
  const patch: Record<string, unknown> = {};
  if (rest.nazov_vzorky !== undefined)
    patch.nazov_vzorky = rest.nazov_vzorky.trim();
  if (rest.specifikacia !== undefined)
    patch.specifikacia = trimOrNull(rest.specifikacia);
  if (rest.foto_url !== undefined) patch.foto_url = trimOrNull(rest.foto_url);
  if (rest.stav !== undefined) {
    patch.stav = rest.stav;
    if (rest.stav === "schvalene") {
      patch.schvalene_kedy = new Date().toISOString();
      const { data: userData } = await supabase.auth.getUser();
      patch.schvalene_kym = userData.user?.id ?? null;
    }
  }
  if (rest.zamietnutie_dovod !== undefined)
    patch.zamietnutie_dovod = trimOrNull(rest.zamietnutie_dovod);
  if (rest.poznamka !== undefined)
    patch.poznamka = trimOrNull(rest.poznamka);

  const { data, error } = await supabase
    .from("tpv_material_sample")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as TpvMaterialSampleRow;
}

export async function deleteSample(id: string): Promise<void> {
  const { error } = await supabase
    .from("tpv_material_sample")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/**
 * When a sample is approved, propagate its specifikacia/foto_url
 * to the parent material's produkt_ref + advance material stav to sample_ok.
 */
export async function approveSampleAndUpdateMaterial(
  sampleId: string
): Promise<void> {
  const sampleRes = await supabase
    .from("tpv_material_sample")
    .select("*")
    .eq("id", sampleId)
    .single();
  if (sampleRes.error) throw sampleRes.error;
  const sample = sampleRes.data as TpvMaterialSampleRow;

  // Mark this sample as approved
  const { data: userData } = await supabase.auth.getUser();
  const { error: e1 } = await supabase
    .from("tpv_material_sample")
    .update({
      stav: "schvalene",
      schvalene_kedy: new Date().toISOString(),
      schvalene_kym: userData.user?.id ?? null,
    })
    .eq("id", sampleId);
  if (e1) throw e1;

  // Reject all other samples for this material
  const { error: e2 } = await supabase
    .from("tpv_material_sample")
    .update({ stav: "zamietnute" })
    .eq("material_id", sample.material_id)
    .neq("id", sampleId)
    .in("stav", ["navrhnute", "objednane", "dorucene"]);
  if (e2) throw e2;

  // Update parent material
  const { error: e3 } = await supabase
    .from("tpv_material")
    .update({
      produkt_ref: sample.nazov_vzorky,
      specifikacia: sample.specifikacia ?? undefined,
      stav: "sample_ok",
    })
    .eq("id", sample.material_id);
  if (e3) throw e3;
}

// Re-export constants used elsewhere
export { MATERIAL_STAV };
