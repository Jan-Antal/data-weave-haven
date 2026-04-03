ALTER TABLE production_capacity
  ADD COLUMN IF NOT EXISTS utilization_pct numeric NOT NULL DEFAULT 83,
  ADD COLUMN IF NOT EXISTS dilna1_hodiny numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dilna2_hodiny numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dilna3_hodiny numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sklad_hodiny numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_employees integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS absence_days integer DEFAULT 0;

ALTER TABLE production_settings
  ADD COLUMN IF NOT EXISTS utilization_pct numeric NOT NULL DEFAULT 83;