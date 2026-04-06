
ALTER TABLE public.project_stages
  ADD COLUMN IF NOT EXISTS cost_preset_id uuid,
  ADD COLUMN IF NOT EXISTS cost_material_pct numeric,
  ADD COLUMN IF NOT EXISTS cost_production_pct numeric,
  ADD COLUMN IF NOT EXISTS cost_subcontractors_pct numeric,
  ADD COLUMN IF NOT EXISTS cost_overhead_pct numeric,
  ADD COLUMN IF NOT EXISTS cost_doprava_pct numeric,
  ADD COLUMN IF NOT EXISTS cost_montaz_pct numeric,
  ADD COLUMN IF NOT EXISTS cost_is_custom boolean DEFAULT false;
