CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- No public access; only service role (which bypasses RLS) can read/write.
-- Explicitly deny everything to authenticated/anon by not creating any policy.
CREATE POLICY "Deny all to clients"
  ON public.app_config
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);