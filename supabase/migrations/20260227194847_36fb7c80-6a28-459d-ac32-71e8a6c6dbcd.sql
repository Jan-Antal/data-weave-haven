
-- Create feedback table
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL DEFAULT '',
  user_name text NOT NULL DEFAULT '',
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can insert feedback
CREATE POLICY "Authenticated users can insert feedback"
ON public.feedback FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Only admin/owner can read feedback
CREATE POLICY "Admins can read feedback"
ON public.feedback FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Only admin/owner can update feedback (mark as read)
CREATE POLICY "Admins can update feedback"
ON public.feedback FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback;
