ALTER TABLE production_schedule ADD COLUMN IF NOT EXISTS is_blocker boolean NOT NULL DEFAULT false;
ALTER TABLE production_schedule ADD COLUMN IF NOT EXISTS tpv_expected_date date NULL;