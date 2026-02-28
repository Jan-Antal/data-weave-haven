
-- Create project_activity_log table
CREATE TABLE public.project_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  user_id uuid NOT NULL,
  user_email text NOT NULL DEFAULT '',
  action_type text NOT NULL,
  old_value text,
  new_value text,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_activity_log_project_id ON public.project_activity_log(project_id);
CREATE INDEX idx_activity_log_created_at ON public.project_activity_log(created_at DESC);

-- RLS
ALTER TABLE public.project_activity_log ENABLE ROW LEVEL SECURITY;

-- Only admin/owner/pm can SELECT
CREATE POLICY "Admins and PMs can read activity log"
  ON public.project_activity_log FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pm'::app_role)
  );

-- Any authenticated user can INSERT (logging happens from various roles)
CREATE POLICY "Authenticated users can insert activity log"
  ON public.project_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Auto-cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_old_activity_logs()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM project_activity_log WHERE created_at < now() - interval '30 days';
END;
$$;
