CREATE POLICY "Anonymous can read active non-test projects"
ON public.projects
FOR SELECT
TO anon
USING (
  is_test = false
  AND deleted_at IS NULL
  AND is_active = true
);