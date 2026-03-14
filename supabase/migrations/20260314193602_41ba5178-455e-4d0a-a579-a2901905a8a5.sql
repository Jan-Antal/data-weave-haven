
CREATE TABLE public.production_quality_defects (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id text NOT NULL,
  item_id uuid NOT NULL,
  item_code text,
  defect_type text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'minor',
  resolution_type text,
  assigned_to text,
  photo_url text,
  reported_by uuid NOT NULL,
  reported_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid,
  resolved_at timestamp with time zone
);

ALTER TABLE public.production_quality_defects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage defects" ON public.production_quality_defects
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "PMs can read defects" ON public.production_quality_defects
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'pm'::app_role));
