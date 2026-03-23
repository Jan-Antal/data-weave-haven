
CREATE TABLE IF NOT EXISTS public.undo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page text NOT NULL,
  action_type text NOT NULL,
  description text NOT NULL,
  undo_payload jsonb NOT NULL,
  redo_payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS undo_sessions_user_page ON public.undo_sessions(user_id, page, expires_at);

ALTER TABLE public.undo_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own undo sessions"
  ON public.undo_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.cleanup_undo_sessions()
RETURNS void LANGUAGE sql SET search_path TO 'public' AS $$
  DELETE FROM public.undo_sessions WHERE expires_at < now();
$$;
