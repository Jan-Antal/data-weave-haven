
CREATE TABLE public.production_quality_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  project_id text NOT NULL,
  checked_by uuid NOT NULL,
  checked_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.production_quality_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage quality checks" ON public.production_quality_checks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "PMs can read quality checks" ON public.production_quality_checks
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'pm'::app_role));
