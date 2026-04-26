ALTER TABLE public.ami_absences
ADD COLUMN IF NOT EXISTS period_id uuid;

CREATE INDEX IF NOT EXISTS idx_ami_absences_period_id
ON public.ami_absences (period_id);