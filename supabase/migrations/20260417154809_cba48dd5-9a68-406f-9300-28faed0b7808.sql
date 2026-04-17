-- 1) Add pracovni_skupina column to ami_employees
ALTER TABLE public.ami_employees
  ADD COLUMN IF NOT EXISTS pracovni_skupina text;

-- 2) Enable RLS on ami_employees
ALTER TABLE public.ami_employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read ami_employees" ON public.ami_employees;
CREATE POLICY "Authenticated can read ami_employees"
  ON public.ami_employees FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert ami_employees" ON public.ami_employees;
CREATE POLICY "Admins can insert ami_employees"
  ON public.ami_employees FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update ami_employees" ON public.ami_employees;
CREATE POLICY "Admins can update ami_employees"
  ON public.ami_employees FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete ami_employees" ON public.ami_employees;
CREATE POLICY "Admins can delete ami_employees"
  ON public.ami_employees FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- 3) Enable RLS on ami_absences
ALTER TABLE public.ami_absences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read ami_absences" ON public.ami_absences;
CREATE POLICY "Authenticated can read ami_absences"
  ON public.ami_absences FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert ami_absences" ON public.ami_absences;
CREATE POLICY "Admins can insert ami_absences"
  ON public.ami_absences FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update ami_absences" ON public.ami_absences;
CREATE POLICY "Admins can update ami_absences"
  ON public.ami_absences FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete ami_absences" ON public.ami_absences;
CREATE POLICY "Admins can delete ami_absences"
  ON public.ami_absences FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));