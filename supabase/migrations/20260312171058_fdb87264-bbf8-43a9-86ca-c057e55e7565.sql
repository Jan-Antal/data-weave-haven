
CREATE TABLE public.production_daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id text NOT NULL,
  week_key text NOT NULL,
  day_index int NOT NULL,
  phase text,
  percent int NOT NULL DEFAULT 0,
  logged_by uuid REFERENCES auth.users(id),
  logged_at timestamptz DEFAULT now(),
  UNIQUE(bundle_id, week_key, day_index)
);

ALTER TABLE public.production_daily_logs ENABLE ROW LEVEL SECURITY;

-- Owner and admin can do everything
CREATE POLICY "Admins can manage production_daily_logs"
ON public.production_daily_logs
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- PMs can read
CREATE POLICY "PMs can read production_daily_logs"
ON public.production_daily_logs
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'pm'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.production_daily_logs;
