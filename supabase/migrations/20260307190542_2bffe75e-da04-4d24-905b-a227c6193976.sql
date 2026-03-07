
-- 1. Add is_test column to projects
ALTER TABLE public.projects ADD COLUMN is_test boolean NOT NULL DEFAULT false;

-- 2. Helper: check if current user is the test user
CREATE OR REPLACE FUNCTION public.is_test_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.email() = 'alfred@ami-test.cz', false)
$$;

-- 3. Helper: check if a project_id belongs to a test project (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_test_project(_project_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_test FROM public.projects WHERE project_id = _project_id LIMIT 1),
    false
  )
$$;

-- 4. Replace SELECT policy on projects: test user sees test, others see non-test
DROP POLICY IF EXISTS "Authenticated users can read projects" ON public.projects;
CREATE POLICY "Authenticated users can read projects"
ON public.projects FOR SELECT
TO authenticated
USING (is_test = public.is_test_user());

-- 5. Replace SELECT policy on project_stages
DROP POLICY IF EXISTS "Authenticated users can read project_stages" ON public.project_stages;
CREATE POLICY "Authenticated users can read project_stages"
ON public.project_stages FOR SELECT
TO authenticated
USING (public.is_test_project(project_id) = public.is_test_user());

-- 6. Replace SELECT policy on tpv_items
DROP POLICY IF EXISTS "Authenticated users can read tpv_items" ON public.tpv_items;
CREATE POLICY "Authenticated users can read tpv_items"
ON public.tpv_items FOR SELECT
TO authenticated
USING (public.is_test_project(project_id) = public.is_test_user());

-- 7. Update data_log SELECT policy
DROP POLICY IF EXISTS "Admins and PMs can read activity log" ON public.data_log;
CREATE POLICY "Admins and PMs can read activity log"
ON public.data_log FOR SELECT
TO authenticated
USING (
  (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'pm'::app_role))
  AND public.is_test_project(project_id) = public.is_test_user()
);

-- 8. Update production_inbox policies
DROP POLICY IF EXISTS "Admins can manage production_inbox" ON public.production_inbox;
CREATE POLICY "Admins can manage production_inbox"
ON public.production_inbox FOR ALL
TO authenticated
USING (
  (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND public.is_test_project(project_id) = public.is_test_user()
)
WITH CHECK (
  (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND public.is_test_project(project_id) = public.is_test_user()
);

DROP POLICY IF EXISTS "PMs can read production_inbox" ON public.production_inbox;
CREATE POLICY "PMs can read production_inbox"
ON public.production_inbox FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'pm'::app_role)
  AND public.is_test_project(project_id) = public.is_test_user()
);

-- 9. Update production_schedule policies
DROP POLICY IF EXISTS "Admins can manage production_schedule" ON public.production_schedule;
CREATE POLICY "Admins can manage production_schedule"
ON public.production_schedule FOR ALL
TO authenticated
USING (
  (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND public.is_test_project(project_id) = public.is_test_user()
)
WITH CHECK (
  (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND public.is_test_project(project_id) = public.is_test_user()
);

DROP POLICY IF EXISTS "PMs can read production_schedule" ON public.production_schedule;
CREATE POLICY "PMs can read production_schedule"
ON public.production_schedule FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'pm'::app_role)
  AND public.is_test_project(project_id) = public.is_test_user()
);
