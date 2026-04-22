DROP POLICY IF EXISTS "Admins can manage user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can read user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners can manage all user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners can read all user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can read non-owner user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert non-owner user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update non-owner user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete non-owner user_roles" ON public.user_roles;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage all user_roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'owner'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

CREATE POLICY "Admins can read non-owner user_roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND role <> 'owner'::public.app_role
);

CREATE POLICY "Admins can insert non-owner user_roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND role <> 'owner'::public.app_role
);

CREATE POLICY "Admins can update non-owner user_roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND role <> 'owner'::public.app_role
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND role <> 'owner'::public.app_role
);

CREATE POLICY "Admins can delete non-owner user_roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND role <> 'owner'::public.app_role
);