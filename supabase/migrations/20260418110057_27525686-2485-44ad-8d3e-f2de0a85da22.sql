CREATE TABLE public.overhead_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.overhead_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read overhead_projects"
  ON public.overhead_projects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert overhead_projects"
  ON public.overhead_projects FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update overhead_projects"
  ON public.overhead_projects FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete overhead_projects"
  ON public.overhead_projects FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_overhead_projects_updated_at
  BEFORE UPDATE ON public.overhead_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.overhead_projects (project_code, label, description, sort_order) VALUES
  ('Z-2511-998', 'Režije Dílna', 'Interné režijné hodiny dielne', 10),
  ('Z-2511-999', 'Provozní režije', 'Interné prevádzkové režijné hodiny', 20);