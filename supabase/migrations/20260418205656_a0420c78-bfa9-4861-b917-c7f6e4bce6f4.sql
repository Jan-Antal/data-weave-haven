ALTER TABLE public.ami_employees
  ADD COLUMN IF NOT EXISTS is_pm BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_kalkulant BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_konstrukter BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS people_employee_id_unique
  ON public.people(employee_id) WHERE employee_id IS NOT NULL;