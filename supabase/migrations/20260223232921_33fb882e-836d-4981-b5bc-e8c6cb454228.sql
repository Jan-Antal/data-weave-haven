
ALTER TABLE public.project_stages
  ADD COLUMN IF NOT EXISTS pm text,
  ADD COLUMN IF NOT EXISTS risk text,
  ADD COLUMN IF NOT EXISTS datum_smluvni text,
  ADD COLUMN IF NOT EXISTS zamereni text,
  ADD COLUMN IF NOT EXISTS tpv_date text,
  ADD COLUMN IF NOT EXISTS expedice text,
  ADD COLUMN IF NOT EXISTS predani text,
  ADD COLUMN IF NOT EXISTS pm_poznamka text;
