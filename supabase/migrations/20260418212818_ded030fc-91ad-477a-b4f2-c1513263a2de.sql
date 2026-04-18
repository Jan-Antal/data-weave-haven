ALTER TABLE public.production_capacity
  ADD COLUMN IF NOT EXISTS usek_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.production_capacity
  DROP COLUMN IF EXISTS dilna1_hodiny,
  DROP COLUMN IF EXISTS dilna2_hodiny,
  DROP COLUMN IF EXISTS dilna3_hodiny,
  DROP COLUMN IF EXISTS sklad_hodiny;