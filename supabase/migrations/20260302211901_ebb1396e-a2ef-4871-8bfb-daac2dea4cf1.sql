
-- Create user_achievements table
CREATE TABLE public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  achievement_key text NOT NULL,
  achieved_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_key)
);

-- Enable RLS
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- Users can read their own achievements
CREATE POLICY "Users can read own achievements"
ON public.user_achievements
FOR SELECT
USING (user_id = auth.uid());

-- System can insert achievements (via service role or authenticated user for self)
CREATE POLICY "Users can insert own achievements"
ON public.user_achievements
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Admins/owners can read all achievements (for potential future use)
CREATE POLICY "Admins can read all achievements"
ON public.user_achievements
FOR SELECT
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create user_preferences column for achievement sound toggle
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS achievement_sound boolean NOT NULL DEFAULT false;
