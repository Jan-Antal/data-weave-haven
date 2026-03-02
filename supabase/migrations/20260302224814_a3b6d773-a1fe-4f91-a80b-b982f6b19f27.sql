
-- =============================================
-- PRODUCTION SETTINGS (single-row app config)
-- =============================================
CREATE TABLE public.production_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_capacity_hours numeric NOT NULL DEFAULT 875,
  monthly_capacity_hours numeric NOT NULL DEFAULT 3500,
  hourly_rate numeric NOT NULL DEFAULT 550,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.production_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read production_settings"
ON public.production_settings FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can update production_settings"
ON public.production_settings FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Insert default row
INSERT INTO public.production_settings (weekly_capacity_hours, monthly_capacity_hours, hourly_rate)
VALUES (875, 3500, 550);

-- =============================================
-- COST BREAKDOWN PRESETS
-- =============================================
CREATE TABLE public.cost_breakdown_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  material_pct numeric NOT NULL DEFAULT 15,
  overhead_pct numeric NOT NULL DEFAULT 25,
  logistics_pct numeric NOT NULL DEFAULT 15,
  production_pct numeric NOT NULL DEFAULT 25,
  subcontractors_pct numeric NOT NULL DEFAULT 10,
  margin_pct numeric NOT NULL DEFAULT 10,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cost_breakdown_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cost_breakdown_presets"
ON public.cost_breakdown_presets FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can insert cost_breakdown_presets"
ON public.cost_breakdown_presets FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update cost_breakdown_presets"
ON public.cost_breakdown_presets FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete cost_breakdown_presets"
ON public.cost_breakdown_presets FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Insert 3 starter presets
INSERT INTO public.cost_breakdown_presets (name, material_pct, overhead_pct, logistics_pct, production_pct, subcontractors_pct, margin_pct, is_default, sort_order)
VALUES
  ('Standardní', 15, 25, 15, 25, 10, 10, true, 0),
  ('Komerční interiér', 10, 20, 20, 30, 10, 10, false, 1),
  ('Zakázková výroba', 12, 20, 10, 35, 13, 10, false, 2);

-- =============================================
-- PRODUCTION INBOX (for future use)
-- =============================================
CREATE TABLE public.production_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL REFERENCES public.projects(project_id),
  stage_id uuid REFERENCES public.project_stages(id),
  item_name text NOT NULL,
  estimated_hours numeric NOT NULL,
  estimated_czk numeric NOT NULL,
  sent_by uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Validation trigger for status instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_production_inbox_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'scheduled', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be pending, scheduled, or cancelled', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_production_inbox_status_trigger
BEFORE INSERT OR UPDATE ON public.production_inbox
FOR EACH ROW EXECUTE FUNCTION public.validate_production_inbox_status();

ALTER TABLE public.production_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage production_inbox"
ON public.production_inbox FOR ALL TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "PMs can read production_inbox"
ON public.production_inbox FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'pm'::app_role));

-- =============================================
-- PRODUCTION SCHEDULE (for future use)
-- =============================================
CREATE TABLE public.production_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_item_id uuid REFERENCES public.production_inbox(id),
  project_id text NOT NULL REFERENCES public.projects(project_id),
  stage_id uuid REFERENCES public.project_stages(id),
  item_name text NOT NULL,
  scheduled_week date NOT NULL,
  scheduled_hours numeric NOT NULL,
  scheduled_czk numeric NOT NULL,
  position integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'scheduled',
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

-- Validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_production_schedule_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status NOT IN ('scheduled', 'in_progress', 'completed') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be scheduled, in_progress, or completed', NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_production_schedule_status_trigger
BEFORE INSERT OR UPDATE ON public.production_schedule
FOR EACH ROW EXECUTE FUNCTION public.validate_production_schedule_status();

ALTER TABLE public.production_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage production_schedule"
ON public.production_schedule FOR ALL TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "PMs can read production_schedule"
ON public.production_schedule FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'pm'::app_role));

-- =============================================
-- ADD COST COLUMNS TO PROJECTS
-- =============================================
ALTER TABLE public.projects
ADD COLUMN cost_preset_id uuid REFERENCES public.cost_breakdown_presets(id),
ADD COLUMN cost_material_pct numeric,
ADD COLUMN cost_overhead_pct numeric,
ADD COLUMN cost_logistics_pct numeric,
ADD COLUMN cost_production_pct numeric,
ADD COLUMN cost_subcontractors_pct numeric,
ADD COLUMN cost_margin_pct numeric,
ADD COLUMN cost_is_custom boolean DEFAULT false;

-- Updated_at trigger for production_settings
CREATE TRIGGER update_production_settings_updated_at
BEFORE UPDATE ON public.production_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Updated_at trigger for cost_breakdown_presets
CREATE TRIGGER update_cost_breakdown_presets_updated_at
BEFORE UPDATE ON public.cost_breakdown_presets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
