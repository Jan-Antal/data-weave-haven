
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  user_email text DEFAULT '',
  user_name text DEFAULT '',
  session_start timestamptz DEFAULT now(),
  last_activity timestamptz DEFAULT now(),
  session_end timestamptz
);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can insert their own sessions
CREATE POLICY "Users can insert own sessions"
  ON public.user_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- All authenticated users can update their own sessions
CREATE POLICY "Users can update own sessions"
  ON public.user_sessions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins/owners can read all sessions
CREATE POLICY "Admins can read all sessions"
  ON public.user_sessions FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Users can read own sessions
CREATE POLICY "Users can read own sessions"
  ON public.user_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
