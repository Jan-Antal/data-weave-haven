CREATE TABLE public.production_capacity_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_year integer NOT NULL,
  week_number integer NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.ami_employees(id) ON DELETE CASCADE,
  is_included boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(week_year, week_number, employee_id)
);

CREATE INDEX idx_pce_week ON public.production_capacity_employees(week_year, week_number);
CREATE INDEX idx_pce_employee ON public.production_capacity_employees(employee_id);

ALTER TABLE public.production_capacity_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read production_capacity_employees"
  ON public.production_capacity_employees FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Anonymous can read production_capacity_employees"
  ON public.production_capacity_employees FOR SELECT
  TO anon USING (true);

CREATE POLICY "Admins can insert production_capacity_employees"
  ON public.production_capacity_employees FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update production_capacity_employees"
  ON public.production_capacity_employees FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete production_capacity_employees"
  ON public.production_capacity_employees FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pce_updated_at
  BEFORE UPDATE ON public.production_capacity_employees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill: for each existing production_capacity row, snapshot currently-active employees
INSERT INTO public.production_capacity_employees (week_year, week_number, employee_id, is_included)
SELECT pc.week_year, pc.week_number, e.id, true
FROM public.production_capacity pc
CROSS JOIN public.ami_employees e
WHERE e.aktivny = true
  AND (e.deactivated_at IS NULL OR e.deactivated_at > pc.week_start)
ON CONFLICT (week_year, week_number, employee_id) DO NOTHING;