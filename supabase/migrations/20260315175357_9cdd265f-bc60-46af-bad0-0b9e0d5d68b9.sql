
-- 1. Update is_test_user() to also check tester role
CREATE OR REPLACE FUNCTION public.is_test_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    auth.email() = 'alfred@ami-test.cz'
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'tester'
    ),
    false
  )
$$;

-- 2. Projects: add tester to write policies (only is_test=true)
DROP POLICY IF EXISTS "Non-viewers can update projects" ON public.projects;
CREATE POLICY "Non-viewers can update projects" ON public.projects
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'pm'::app_role) OR has_role(auth.uid(), 'konstrukter'::app_role)
  OR (has_role(auth.uid(), 'tester'::app_role) AND is_test = true)
);

DROP POLICY IF EXISTS "Admins and PMs can insert projects" ON public.projects;
CREATE POLICY "Admins and PMs can insert projects" ON public.projects
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'pm'::app_role)
  OR (has_role(auth.uid(), 'tester'::app_role) AND is_test = true)
);

DROP POLICY IF EXISTS "Admins and PMs can delete projects" ON public.projects;
CREATE POLICY "Admins and PMs can delete projects" ON public.projects
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'pm'::app_role)
  OR (has_role(auth.uid(), 'tester'::app_role) AND is_test = true)
);

-- 3. project_stages: add tester with is_test_project check
DROP POLICY IF EXISTS "Non-viewers can insert project_stages" ON public.project_stages;
CREATE POLICY "Non-viewers can insert project_stages" ON public.project_stages
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'pm'::app_role) OR has_role(auth.uid(), 'konstrukter'::app_role)
  OR (has_role(auth.uid(), 'tester'::app_role) AND is_test_project(project_id))
);

DROP POLICY IF EXISTS "Non-viewers can update project_stages" ON public.project_stages;
CREATE POLICY "Non-viewers can update project_stages" ON public.project_stages
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'pm'::app_role) OR has_role(auth.uid(), 'konstrukter'::app_role)
  OR (has_role(auth.uid(), 'tester'::app_role) AND is_test_project(project_id))
);

DROP POLICY IF EXISTS "Admins and PMs can delete project_stages" ON public.project_stages;
CREATE POLICY "Admins and PMs can delete project_stages" ON public.project_stages
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'pm'::app_role)
  OR (has_role(auth.uid(), 'tester'::app_role) AND is_test_project(project_id))
);

-- 4. tpv_items: add tester with is_test_project check
DROP POLICY IF EXISTS "TPV managers can insert tpv_items" ON public.tpv_items;
CREATE POLICY "TPV managers can insert tpv_items" ON public.tpv_items
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'pm'::app_role) OR has_role(auth.uid(), 'konstrukter'::app_role)
  OR (has_role(auth.uid(), 'tester'::app_role) AND is_test_project(project_id))
);

DROP POLICY IF EXISTS "TPV managers can update tpv_items" ON public.tpv_items;
CREATE POLICY "TPV managers can update tpv_items" ON public.tpv_items
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'pm'::app_role) OR has_role(auth.uid(), 'konstrukter'::app_role)
  OR (has_role(auth.uid(), 'tester'::app_role) AND is_test_project(project_id))
);

DROP POLICY IF EXISTS "TPV managers can delete tpv_items" ON public.tpv_items;
CREATE POLICY "TPV managers can delete tpv_items" ON public.tpv_items
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'pm'::app_role) OR has_role(auth.uid(), 'konstrukter'::app_role)
  OR (has_role(auth.uid(), 'tester'::app_role) AND is_test_project(project_id))
);

-- 5. production_schedule: add tester (already has is_test_project check)
DROP POLICY IF EXISTS "Admins can manage production_schedule" ON public.production_schedule;
CREATE POLICY "Admins can manage production_schedule" ON public.production_schedule
FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role))
  AND is_test_project(project_id) = is_test_user()
)
WITH CHECK (
  (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role))
  AND is_test_project(project_id) = is_test_user()
);

-- 6. production_inbox: add tester (already has is_test_project check)
DROP POLICY IF EXISTS "Admins can manage production_inbox" ON public.production_inbox;
CREATE POLICY "Admins can manage production_inbox" ON public.production_inbox
FOR ALL TO authenticated
USING (
  (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role))
  AND is_test_project(project_id) = is_test_user()
)
WITH CHECK (
  (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role))
  AND is_test_project(project_id) = is_test_user()
);

-- 7. production_daily_logs: add tester
DROP POLICY IF EXISTS "Admins can manage production_daily_logs" ON public.production_daily_logs;
CREATE POLICY "Admins can manage production_daily_logs" ON public.production_daily_logs
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role)
);

-- 8. production_quality_checks: add tester
DROP POLICY IF EXISTS "Admins can manage quality checks" ON public.production_quality_checks;
CREATE POLICY "Admins can manage quality checks" ON public.production_quality_checks
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role)
);

-- 9. production_quality_defects: add tester
DROP POLICY IF EXISTS "Admins can manage defects" ON public.production_quality_defects;
CREATE POLICY "Admins can manage defects" ON public.production_quality_defects
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role)
);
