
-- Bump existing stage orders up by 1 for projects that have stages
UPDATE public.project_stages ps
SET stage_order = COALESCE(ps.stage_order, 0) + 1
WHERE ps.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.project_stages ps2
    WHERE ps2.project_id = ps.project_id
      AND ps2.deleted_at IS NULL
      AND ps2.id != ps.id
  );

-- Insert new "base" stage (order 0) copying project-level data
INSERT INTO public.project_stages (
  id, project_id, stage_name, display_name, stage_order,
  status, datum_smluvni, pm, konstrukter, kalkulant, architekt,
  prodejni_cena, currency, marze,
  cost_preset_id, cost_material_pct, cost_production_pct,
  cost_subcontractors_pct, cost_overhead_pct, cost_doprava_pct,
  cost_montaz_pct, cost_is_custom,
  narocnost, risk, zamereni, tpv_date, expedice, predani,
  montaz, van_date, pm_poznamka, hodiny_tpv, percent_tpv,
  status_vyroba
)
SELECT
  gen_random_uuid(),
  p.project_id,
  p.project_id || '-BASE',
  'Původní data',
  0,
  p.status, p.datum_smluvni, p.pm, p.konstrukter, p.kalkulant, p.architekt,
  p.prodejni_cena, p.currency, p.marze,
  p.cost_preset_id, p.cost_material_pct, p.cost_production_pct,
  p.cost_subcontractors_pct, p.cost_overhead_pct, p.cost_doprava_pct,
  p.cost_montaz_pct, p.cost_is_custom,
  p.narocnost, p.risk, p.zamereni, p.tpv_date, p.expedice, p.predani,
  p.montaz, p.van_date, p.pm_poznamka, p.hodiny_tpv, p.percent_tpv,
  NULL
FROM public.projects p
WHERE p.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.project_stages ps
    WHERE ps.project_id = p.project_id AND ps.deleted_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.project_stages ps2
    WHERE ps2.project_id = p.project_id
      AND ps2.deleted_at IS NULL
      AND ps2.stage_order = 0
      AND ps2.stage_name LIKE '%BASE%'
  );
