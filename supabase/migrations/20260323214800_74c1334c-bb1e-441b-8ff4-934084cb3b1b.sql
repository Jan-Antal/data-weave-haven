ALTER TABLE public.notifications 
  ADD COLUMN IF NOT EXISTS link_context jsonb,
  ADD COLUMN IF NOT EXISTS batch_key text;

CREATE INDEX IF NOT EXISTS notifications_batch ON public.notifications(user_id, batch_key, created_at DESC);