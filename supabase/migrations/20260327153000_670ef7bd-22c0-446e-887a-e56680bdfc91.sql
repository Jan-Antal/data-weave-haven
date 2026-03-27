CREATE POLICY "Admins PMs Konstrukter can read deleted projects"
ON public.projects
FOR SELECT
TO authenticated
USING (
  deleted_at IS NOT NULL
  AND (
    public.has_role(auth.uid(), 'owner'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'pm'::public.app_role)
    OR public.has_role(auth.uid(), 'konstrukter'::public.app_role)
  )
);