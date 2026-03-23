
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  project_id text,
  actor_name text,
  actor_initials text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread ON public.notifications(user_id, read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own notifications" ON public.notifications
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE public.user_preferences ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT '{"project_changed": true, "qc_defect": true, "project_created": true, "daylog_missing": true}'::jsonb;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
