
CREATE TABLE public.project_hours_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ami_project_id text,
  project_name text,
  status text,
  pm text,
  hodiny_plan numeric,
  hodiny_skutocne numeric,
  rozdiel numeric,
  datum_sync date,
  source text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.project_hours_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anonymous can read project_hours_log"
  ON public.project_hours_log FOR SELECT TO anon USING (true);

CREATE POLICY "Anonymous can insert project_hours_log"
  ON public.project_hours_log FOR INSERT TO anon WITH CHECK (true);
