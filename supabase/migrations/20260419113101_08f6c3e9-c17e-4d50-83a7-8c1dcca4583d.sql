-- 1. Extend app_role enum with new role names
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vedouci_pm';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vedouci_konstrukter';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vedouci_vyroby';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'mistr';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'quality';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'kalkulant';

-- 2. Per-user permission overrides on user_roles
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS permissions JSONB;

-- 3. Helper: any authenticated user with a row in user_roles
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

-- 4. Broaden SELECT on projects (keep existing test isolation untouched; just add an additional permissive SELECT for any authenticated user with a role)
DROP POLICY IF EXISTS "All roles can read projects" ON public.projects;
CREATE POLICY "All roles can read projects"
ON public.projects
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "All roles can read project_stages" ON public.project_stages;
CREATE POLICY "All roles can read project_stages"
ON public.project_stages
FOR SELECT
TO authenticated
USING (deleted_at IS NULL AND public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "All roles can read tpv_items" ON public.tpv_items;
CREATE POLICY "All roles can read tpv_items"
ON public.tpv_items
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "All roles can read production_schedule" ON public.production_schedule;
CREATE POLICY "All roles can read production_schedule"
ON public.production_schedule
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid()));

DROP POLICY IF EXISTS "All roles can read production_inbox" ON public.production_inbox;
CREATE POLICY "All roles can read production_inbox"
ON public.production_inbox
FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid()));