
-- Rename columns in cost_breakdown_presets
ALTER TABLE public.cost_breakdown_presets RENAME COLUMN logistics_pct TO doprava_pct;
ALTER TABLE public.cost_breakdown_presets RENAME COLUMN margin_pct TO montaz_pct;

-- Rename columns in projects
ALTER TABLE public.projects RENAME COLUMN cost_logistics_pct TO cost_doprava_pct;
ALTER TABLE public.projects RENAME COLUMN cost_margin_pct TO cost_montaz_pct;
