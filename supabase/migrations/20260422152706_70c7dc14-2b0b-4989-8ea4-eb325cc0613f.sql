ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS production_inbox_seen_at TIMESTAMP WITH TIME ZONE;
