CREATE TABLE IF NOT EXISTS project_plan_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL UNIQUE,
  tpv_hours INTEGER NOT NULL DEFAULT 0,
  project_hours INTEGER NOT NULL DEFAULT 0,
  hodiny_plan INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'None',
  warning_low_tpv BOOLEAN NOT NULL DEFAULT false,
  force_project_price BOOLEAN NOT NULL DEFAULT false,
  marze_used NUMERIC,
  prodpct_used NUMERIC,
  eur_rate_used NUMERIC,
  recalculated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE project_plan_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_project_plan_hours" ON project_plan_hours FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_write_project_plan_hours" ON project_plan_hours FOR ALL TO authenticated USING (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pm'::app_role)
) WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pm'::app_role)
);
CREATE POLICY "anon_read_project_plan_hours" ON project_plan_hours FOR SELECT TO anon USING (true);