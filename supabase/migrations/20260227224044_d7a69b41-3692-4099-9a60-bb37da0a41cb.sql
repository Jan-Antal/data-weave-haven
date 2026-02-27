ALTER TABLE public.project_stages
  ADD COLUMN IF NOT EXISTS konstrukter text,
  ADD COLUMN IF NOT EXISTS narocnost text,
  ADD COLUMN IF NOT EXISTS hodiny_tpv text,
  ADD COLUMN IF NOT EXISTS percent_tpv numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS architekt text;