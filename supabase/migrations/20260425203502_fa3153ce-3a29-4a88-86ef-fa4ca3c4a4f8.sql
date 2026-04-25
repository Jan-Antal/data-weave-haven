
-- ============================================================
-- 1) role_permission_defaults table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.role_permission_defaults (
  role public.app_role PRIMARY KEY,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.role_permission_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read role_permission_defaults" ON public.role_permission_defaults;
CREATE POLICY "Authenticated read role_permission_defaults"
  ON public.role_permission_defaults FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Owner manage role_permission_defaults" ON public.role_permission_defaults;
CREATE POLICY "Owner manage role_permission_defaults"
  ON public.role_permission_defaults FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));

DROP TRIGGER IF EXISTS trg_role_permission_defaults_updated_at ON public.role_permission_defaults;
CREATE TRIGGER trg_role_permission_defaults_updated_at
  BEFORE UPDATE ON public.role_permission_defaults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2) Seed presets (mirror src/lib/permissionPresets.ts)
--    + new canAccessTpv / canWriteTpv flags
-- ============================================================
INSERT INTO public.role_permission_defaults (role, permissions) VALUES
  ('owner', '{
    "canEdit":true,"canCreateProject":true,"canDeleteProject":true,
    "canEditProjectCode":true,"canEditSmluvniTermin":true,"canManageTPV":true,
    "canAccessSettings":true,"canManageUsers":true,"canManagePeople":true,
    "canManageExternisti":true,"canManageProduction":true,"canAccessAnalytics":true,
    "canSeePrices":true,"canAccessPlanVyroby":true,"canWritePlanVyroby":true,
    "canAccessDaylog":true,"canQCOnly":true,"canUploadDocuments":true,
    "canPermanentDelete":true,"canManageExchangeRates":true,"canManageOverheadProjects":true,
    "canManageStatuses":true,"canAccessRecycleBin":true,
    "canAccessTpv":true,"canWriteTpv":true
  }'::jsonb),
  ('admin', '{
    "canEdit":true,"canCreateProject":true,"canDeleteProject":true,
    "canEditProjectCode":true,"canEditSmluvniTermin":true,"canManageTPV":true,
    "canAccessSettings":true,"canManageUsers":true,"canManagePeople":true,
    "canManageExternisti":true,"canManageProduction":true,"canAccessAnalytics":true,
    "canSeePrices":true,"canAccessPlanVyroby":true,"canWritePlanVyroby":true,
    "canAccessDaylog":true,"canQCOnly":false,"canUploadDocuments":true,
    "canPermanentDelete":true,"canManageExchangeRates":true,"canManageOverheadProjects":true,
    "canManageStatuses":true,"canAccessRecycleBin":true,
    "canAccessTpv":false,"canWriteTpv":false
  }'::jsonb),
  ('vedouci_pm', '{
    "canEdit":true,"canCreateProject":true,"canDeleteProject":true,
    "canEditProjectCode":true,"canEditSmluvniTermin":true,"canManageTPV":true,
    "canManagePeople":true,"canManageExternisti":true,"canAccessAnalytics":true,
    "canSeePrices":true,"canAccessPlanVyroby":true,"canWritePlanVyroby":true,
    "canAccessDaylog":true,"canUploadDocuments":true,"canPermanentDelete":true,
    "canManageOverheadProjects":true,"canAccessRecycleBin":true,
    "canAccessSettings":false,"canManageUsers":false,"canManageProduction":false,
    "canQCOnly":false,"canManageExchangeRates":false,"canManageStatuses":false,
    "canAccessTpv":false,"canWriteTpv":false
  }'::jsonb),
  ('pm', '{
    "canEdit":true,"canCreateProject":true,"canManageTPV":true,
    "canManagePeople":true,"canManageExternisti":true,"canAccessAnalytics":true,
    "canSeePrices":true,"canAccessPlanVyroby":true,"canAccessDaylog":true,
    "canUploadDocuments":true,"canAccessRecycleBin":true,
    "canDeleteProject":false,"canEditProjectCode":false,"canEditSmluvniTermin":false,
    "canAccessSettings":false,"canManageUsers":false,"canManageProduction":false,
    "canWritePlanVyroby":false,"canQCOnly":false,"canPermanentDelete":false,
    "canManageExchangeRates":false,"canManageOverheadProjects":false,"canManageStatuses":false,
    "canAccessTpv":false,"canWriteTpv":false
  }'::jsonb),
  ('vedouci_konstrukter', '{
    "canEdit":true,"canManageTPV":true,"canManagePeople":true,
    "canManageExternisti":true,"canAccessAnalytics":true,"canUploadDocuments":true,
    "canAccessRecycleBin":true,
    "canCreateProject":false,"canDeleteProject":false,"canEditProjectCode":false,
    "canEditSmluvniTermin":false,"canAccessSettings":false,"canManageUsers":false,
    "canManageProduction":false,"canSeePrices":false,"canAccessPlanVyroby":false,
    "canWritePlanVyroby":false,"canAccessDaylog":false,"canQCOnly":false,
    "canPermanentDelete":false,"canManageExchangeRates":false,
    "canManageOverheadProjects":false,"canManageStatuses":false,
    "canAccessTpv":false,"canWriteTpv":false
  }'::jsonb),
  ('konstrukter', '{
    "canEdit":true,"canManageTPV":true,"canUploadDocuments":true,"canAccessRecycleBin":true,
    "canCreateProject":false,"canDeleteProject":false,"canEditProjectCode":false,
    "canEditSmluvniTermin":false,"canAccessSettings":false,"canManageUsers":false,
    "canManagePeople":false,"canManageExternisti":false,"canManageProduction":false,
    "canAccessAnalytics":false,"canSeePrices":false,"canAccessPlanVyroby":false,
    "canWritePlanVyroby":false,"canAccessDaylog":false,"canQCOnly":false,
    "canPermanentDelete":false,"canManageExchangeRates":false,
    "canManageOverheadProjects":false,"canManageStatuses":false,
    "canAccessTpv":false,"canWriteTpv":false
  }'::jsonb),
  ('vedouci_vyroby', '{
    "canEdit":true,"canManageProduction":true,"canAccessAnalytics":true,
    "canAccessPlanVyroby":true,"canWritePlanVyroby":true,"canAccessDaylog":true,
    "canUploadDocuments":true,
    "canCreateProject":false,"canDeleteProject":false,"canEditProjectCode":false,
    "canEditSmluvniTermin":false,"canManageTPV":false,"canAccessSettings":false,
    "canManageUsers":false,"canManagePeople":false,"canManageExternisti":false,
    "canSeePrices":false,"canQCOnly":false,"canPermanentDelete":false,
    "canManageExchangeRates":false,"canManageOverheadProjects":false,
    "canManageStatuses":false,"canAccessRecycleBin":false,
    "canAccessTpv":false,"canWriteTpv":false
  }'::jsonb),
  ('mistr', '{
    "canManageProduction":true,"canAccessPlanVyroby":true,"canAccessDaylog":true,
    "canUploadDocuments":true,
    "canEdit":false,"canCreateProject":false,"canDeleteProject":false,
    "canEditProjectCode":false,"canEditSmluvniTermin":false,"canManageTPV":false,
    "canAccessSettings":false,"canManageUsers":false,"canManagePeople":false,
    "canManageExternisti":false,"canAccessAnalytics":false,"canSeePrices":false,
    "canWritePlanVyroby":false,"canQCOnly":false,"canPermanentDelete":false,
    "canManageExchangeRates":false,"canManageOverheadProjects":false,
    "canManageStatuses":false,"canAccessRecycleBin":false,
    "canAccessTpv":false,"canWriteTpv":false
  }'::jsonb),
  ('quality', '{
    "canAccessDaylog":true,"canQCOnly":true,
    "canEdit":false,"canCreateProject":false,"canDeleteProject":false,
    "canEditProjectCode":false,"canEditSmluvniTermin":false,"canManageTPV":false,
    "canAccessSettings":false,"canManageUsers":false,"canManagePeople":false,
    "canManageExternisti":false,"canManageProduction":false,"canAccessAnalytics":false,
    "canSeePrices":false,"canAccessPlanVyroby":false,"canWritePlanVyroby":false,
    "canUploadDocuments":false,"canPermanentDelete":false,"canManageExchangeRates":false,
    "canManageOverheadProjects":false,"canManageStatuses":false,"canAccessRecycleBin":false,
    "canAccessTpv":false,"canWriteTpv":false
  }'::jsonb),
  ('kalkulant', '{
    "canAccessAnalytics":true,"canSeePrices":true,"canManageOverheadProjects":true,
    "canEdit":false,"canCreateProject":false,"canDeleteProject":false,
    "canEditProjectCode":false,"canEditSmluvniTermin":false,"canManageTPV":false,
    "canAccessSettings":false,"canManageUsers":false,"canManagePeople":false,
    "canManageExternisti":false,"canManageProduction":false,
    "canAccessPlanVyroby":false,"canWritePlanVyroby":false,"canAccessDaylog":false,
    "canQCOnly":false,"canUploadDocuments":false,"canPermanentDelete":false,
    "canManageExchangeRates":false,"canManageStatuses":false,"canAccessRecycleBin":false,
    "canAccessTpv":false,"canWriteTpv":false
  }'::jsonb),
  ('viewer', '{
    "canAccessPlanVyroby":true,"canAccessDaylog":true,"canAccessAnalytics":true,
    "canEdit":false,"canCreateProject":false,"canDeleteProject":false,
    "canEditProjectCode":false,"canEditSmluvniTermin":false,"canManageTPV":false,
    "canAccessSettings":false,"canManageUsers":false,"canManagePeople":false,
    "canManageExternisti":false,"canManageProduction":false,"canSeePrices":false,
    "canWritePlanVyroby":false,"canQCOnly":false,"canUploadDocuments":false,
    "canPermanentDelete":false,"canManageExchangeRates":false,
    "canManageOverheadProjects":false,"canManageStatuses":false,"canAccessRecycleBin":false,
    "canAccessTpv":false,"canWriteTpv":false
  }'::jsonb),
  ('vyroba', '{
    "canEdit":true,"canManageProduction":true,"canAccessAnalytics":true,
    "canAccessPlanVyroby":true,"canWritePlanVyroby":true,"canAccessDaylog":true,
    "canUploadDocuments":true,
    "canCreateProject":false,"canDeleteProject":false,"canEditProjectCode":false,
    "canEditSmluvniTermin":false,"canManageTPV":false,"canAccessSettings":false,
    "canManageUsers":false,"canManagePeople":false,"canManageExternisti":false,
    "canSeePrices":false,"canQCOnly":false,"canPermanentDelete":false,
    "canManageExchangeRates":false,"canManageOverheadProjects":false,
    "canManageStatuses":false,"canAccessRecycleBin":false,
    "canAccessTpv":false,"canWriteTpv":false
  }'::jsonb),
  ('tester', '{
    "canEdit":true,"canCreateProject":true,"canManageTPV":true,
    "canManagePeople":true,"canManageExternisti":true,"canAccessAnalytics":true,
    "canSeePrices":true,"canAccessPlanVyroby":true,"canAccessDaylog":true,
    "canUploadDocuments":true,"canAccessRecycleBin":true,
    "canDeleteProject":false,"canEditProjectCode":false,"canEditSmluvniTermin":false,
    "canAccessSettings":false,"canManageUsers":false,"canManageProduction":false,
    "canWritePlanVyroby":false,"canQCOnly":false,"canPermanentDelete":false,
    "canManageExchangeRates":false,"canManageOverheadProjects":false,"canManageStatuses":false,
    "canAccessTpv":false,"canWriteTpv":false
  }'::jsonb)
ON CONFLICT (role) DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = now();

-- ============================================================
-- 3) has_permission() helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _flag text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (ur.permissions ->> _flag)::boolean
       FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.permissions ? _flag
      LIMIT 1),
    (SELECT (rpd.permissions ->> _flag)::boolean
       FROM public.user_roles ur
       JOIN public.role_permission_defaults rpd ON rpd.role = ur.role
      WHERE ur.user_id = _user_id
      LIMIT 1),
    false
  )
$$;

-- ============================================================
-- 4) Replace RLS policies — projects
-- ============================================================
DROP POLICY IF EXISTS "Admins and PMs can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Admins and PMs can delete projects" ON public.projects;
DROP POLICY IF EXISTS "Admins PMs Konstrukter can update projects" ON public.projects;

CREATE POLICY "perm_insert_projects" ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canCreateProject'));
CREATE POLICY "perm_update_projects" ON public.projects FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canEdit'))
  WITH CHECK (public.has_permission(auth.uid(), 'canEdit'));
CREATE POLICY "perm_delete_projects" ON public.projects FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canDeleteProject'));

-- ============================================================
-- 5) project_stages
-- ============================================================
DROP POLICY IF EXISTS "Admins PMs Konstrukter can manage project_stages" ON public.project_stages;
CREATE POLICY "perm_insert_project_stages" ON public.project_stages FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canEdit'));
CREATE POLICY "perm_update_project_stages" ON public.project_stages FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canEdit'))
  WITH CHECK (public.has_permission(auth.uid(), 'canEdit'));
CREATE POLICY "perm_delete_project_stages" ON public.project_stages FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canDeleteProject') OR public.has_permission(auth.uid(), 'canEdit'));

-- ============================================================
-- 6) tpv_items — manage cez canManageTPV, ALE select gate cez canAccessTpv NIE
--    (tpv_items je súčasť projektu — viditeľné všade kde sa zobrazuje projekt)
--    TPV modul vypneme len cez tpv_* tabuľky uvedené nižšie.
-- ============================================================
DROP POLICY IF EXISTS "Admins PMs Konstrukter can manage tpv_items" ON public.tpv_items;
CREATE POLICY "perm_insert_tpv_items" ON public.tpv_items FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canManageTPV'));
CREATE POLICY "perm_update_tpv_items" ON public.tpv_items FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageTPV'))
  WITH CHECK (public.has_permission(auth.uid(), 'canManageTPV'));
CREATE POLICY "perm_delete_tpv_items" ON public.tpv_items FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageTPV'));

-- ============================================================
-- 7) production_schedule
-- ============================================================
DROP POLICY IF EXISTS "Forecast roles can update production schedule" ON public.production_schedule;
DROP POLICY IF EXISTS "vedouci_vyroby_can_delete_production_schedule" ON public.production_schedule;
DROP POLICY IF EXISTS "vedouci_vyroby_can_insert_production_schedule" ON public.production_schedule;
CREATE POLICY "perm_insert_production_schedule" ON public.production_schedule FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canWritePlanVyroby'));
CREATE POLICY "perm_update_production_schedule" ON public.production_schedule FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canWritePlanVyroby'))
  WITH CHECK (public.has_permission(auth.uid(), 'canWritePlanVyroby'));
CREATE POLICY "perm_delete_production_schedule" ON public.production_schedule FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canWritePlanVyroby'));

-- ============================================================
-- 8) production_inbox
-- ============================================================
DROP POLICY IF EXISTS "Forecast roles can update production inbox" ON public.production_inbox;
DROP POLICY IF EXISTS "vedouci_vyroby_can_delete_production_inbox" ON public.production_inbox;
DROP POLICY IF EXISTS "vedouci_vyroby_can_insert_production_inbox" ON public.production_inbox;
CREATE POLICY "perm_insert_production_inbox" ON public.production_inbox FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canWritePlanVyroby') OR public.has_permission(auth.uid(), 'canManageTPV'));
CREATE POLICY "perm_update_production_inbox" ON public.production_inbox FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canWritePlanVyroby'))
  WITH CHECK (public.has_permission(auth.uid(), 'canWritePlanVyroby'));
CREATE POLICY "perm_delete_production_inbox" ON public.production_inbox FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canWritePlanVyroby'));

-- ============================================================
-- 9) production_daily_logs
-- ============================================================
DROP POLICY IF EXISTS "vedouci_vyroby_can_delete_production_daily_logs" ON public.production_daily_logs;
DROP POLICY IF EXISTS "vedouci_vyroby_can_insert_production_daily_logs" ON public.production_daily_logs;
DROP POLICY IF EXISTS "vedouci_vyroby_can_update_production_daily_logs" ON public.production_daily_logs;
CREATE POLICY "perm_insert_production_daily_logs" ON public.production_daily_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canAccessDaylog') OR public.has_permission(auth.uid(), 'canManageProduction') OR public.has_permission(auth.uid(), 'canQCOnly'));
CREATE POLICY "perm_update_production_daily_logs" ON public.production_daily_logs FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canAccessDaylog') OR public.has_permission(auth.uid(), 'canManageProduction') OR public.has_permission(auth.uid(), 'canQCOnly'))
  WITH CHECK (public.has_permission(auth.uid(), 'canAccessDaylog') OR public.has_permission(auth.uid(), 'canManageProduction') OR public.has_permission(auth.uid(), 'canQCOnly'));
CREATE POLICY "perm_delete_production_daily_logs" ON public.production_daily_logs FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageProduction'));

-- ============================================================
-- 10) production_quality_checks
-- ============================================================
DROP POLICY IF EXISTS "vedouci_vyroby_can_delete_production_quality_checks" ON public.production_quality_checks;
DROP POLICY IF EXISTS "vedouci_vyroby_can_insert_production_quality_checks" ON public.production_quality_checks;
DROP POLICY IF EXISTS "vedouci_vyroby_can_update_production_quality_checks" ON public.production_quality_checks;
CREATE POLICY "perm_insert_production_quality_checks" ON public.production_quality_checks FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canQCOnly') OR public.has_permission(auth.uid(), 'canAccessDaylog') OR public.has_permission(auth.uid(), 'canManageProduction'));
CREATE POLICY "perm_update_production_quality_checks" ON public.production_quality_checks FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canQCOnly') OR public.has_permission(auth.uid(), 'canAccessDaylog') OR public.has_permission(auth.uid(), 'canManageProduction'))
  WITH CHECK (public.has_permission(auth.uid(), 'canQCOnly') OR public.has_permission(auth.uid(), 'canAccessDaylog') OR public.has_permission(auth.uid(), 'canManageProduction'));
CREATE POLICY "perm_delete_production_quality_checks" ON public.production_quality_checks FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageProduction'));

-- ============================================================
-- 11) production_quality_defects
-- ============================================================
DROP POLICY IF EXISTS "vedouci_vyroby_can_delete_production_quality_defects" ON public.production_quality_defects;
DROP POLICY IF EXISTS "vedouci_vyroby_can_insert_production_quality_defects" ON public.production_quality_defects;
DROP POLICY IF EXISTS "vedouci_vyroby_can_update_production_quality_defects" ON public.production_quality_defects;
CREATE POLICY "perm_insert_production_quality_defects" ON public.production_quality_defects FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canQCOnly') OR public.has_permission(auth.uid(), 'canAccessDaylog') OR public.has_permission(auth.uid(), 'canManageProduction'));
CREATE POLICY "perm_update_production_quality_defects" ON public.production_quality_defects FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canQCOnly') OR public.has_permission(auth.uid(), 'canAccessDaylog') OR public.has_permission(auth.uid(), 'canManageProduction'))
  WITH CHECK (public.has_permission(auth.uid(), 'canQCOnly') OR public.has_permission(auth.uid(), 'canAccessDaylog') OR public.has_permission(auth.uid(), 'canManageProduction'));
CREATE POLICY "perm_delete_production_quality_defects" ON public.production_quality_defects FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageProduction'));

-- ============================================================
-- 12) production_expedice
-- ============================================================
DROP POLICY IF EXISTS "vedouci_vyroby_can_delete_production_expedice" ON public.production_expedice;
DROP POLICY IF EXISTS "vedouci_vyroby_can_insert_production_expedice" ON public.production_expedice;
DROP POLICY IF EXISTS "vedouci_vyroby_can_update_production_expedice" ON public.production_expedice;
CREATE POLICY "perm_insert_production_expedice" ON public.production_expedice FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canManageProduction') OR public.has_permission(auth.uid(), 'canWritePlanVyroby'));
CREATE POLICY "perm_update_production_expedice" ON public.production_expedice FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageProduction') OR public.has_permission(auth.uid(), 'canWritePlanVyroby'))
  WITH CHECK (public.has_permission(auth.uid(), 'canManageProduction') OR public.has_permission(auth.uid(), 'canWritePlanVyroby'));
CREATE POLICY "perm_delete_production_expedice" ON public.production_expedice FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageProduction'));

-- ============================================================
-- 13) production_capacity + employees + company_holidays
-- ============================================================
DROP POLICY IF EXISTS "Admins can delete production_capacity" ON public.production_capacity;
DROP POLICY IF EXISTS "Admins can insert production_capacity" ON public.production_capacity;
DROP POLICY IF EXISTS "Admins can update production_capacity" ON public.production_capacity;
CREATE POLICY "perm_insert_production_capacity" ON public.production_capacity FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canManageProduction'));
CREATE POLICY "perm_update_production_capacity" ON public.production_capacity FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageProduction'))
  WITH CHECK (public.has_permission(auth.uid(), 'canManageProduction'));
CREATE POLICY "perm_delete_production_capacity" ON public.production_capacity FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageProduction'));

DROP POLICY IF EXISTS "Admins can delete production_capacity_employees" ON public.production_capacity_employees;
DROP POLICY IF EXISTS "Admins can insert production_capacity_employees" ON public.production_capacity_employees;
DROP POLICY IF EXISTS "Admins can update production_capacity_employees" ON public.production_capacity_employees;
CREATE POLICY "perm_insert_production_capacity_employees" ON public.production_capacity_employees FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canManageProduction'));
CREATE POLICY "perm_update_production_capacity_employees" ON public.production_capacity_employees FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageProduction'))
  WITH CHECK (public.has_permission(auth.uid(), 'canManageProduction'));
CREATE POLICY "perm_delete_production_capacity_employees" ON public.production_capacity_employees FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageProduction'));

DROP POLICY IF EXISTS "Admins can delete company_holidays" ON public.company_holidays;
DROP POLICY IF EXISTS "Admins can insert company_holidays" ON public.company_holidays;
DROP POLICY IF EXISTS "Admins can update company_holidays" ON public.company_holidays;
CREATE POLICY "perm_insert_company_holidays" ON public.company_holidays FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canManageProduction') OR public.has_permission(auth.uid(), 'canAccessSettings'));
CREATE POLICY "perm_update_company_holidays" ON public.company_holidays FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageProduction') OR public.has_permission(auth.uid(), 'canAccessSettings'))
  WITH CHECK (public.has_permission(auth.uid(), 'canManageProduction') OR public.has_permission(auth.uid(), 'canAccessSettings'));
CREATE POLICY "perm_delete_company_holidays" ON public.company_holidays FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageProduction') OR public.has_permission(auth.uid(), 'canAccessSettings'));

-- ============================================================
-- 14) people, ami_employees, ami_absences, position_catalogue
-- ============================================================
DROP POLICY IF EXISTS "Admins and PMs can delete people" ON public.people;
DROP POLICY IF EXISTS "Non-viewers can insert people" ON public.people;
DROP POLICY IF EXISTS "Non-viewers can update people" ON public.people;
CREATE POLICY "perm_insert_people" ON public.people FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canManagePeople'));
CREATE POLICY "perm_update_people" ON public.people FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManagePeople'))
  WITH CHECK (public.has_permission(auth.uid(), 'canManagePeople'));
CREATE POLICY "perm_delete_people" ON public.people FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManagePeople'));

DROP POLICY IF EXISTS "Admins can delete ami_employees" ON public.ami_employees;
DROP POLICY IF EXISTS "Admins can insert ami_employees" ON public.ami_employees;
DROP POLICY IF EXISTS "Admins can update ami_employees" ON public.ami_employees;
CREATE POLICY "perm_insert_ami_employees" ON public.ami_employees FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canManagePeople'));
CREATE POLICY "perm_update_ami_employees" ON public.ami_employees FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManagePeople'))
  WITH CHECK (public.has_permission(auth.uid(), 'canManagePeople'));
CREATE POLICY "perm_delete_ami_employees" ON public.ami_employees FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManagePeople'));

DROP POLICY IF EXISTS "Admins can delete ami_absences" ON public.ami_absences;
DROP POLICY IF EXISTS "Admins can insert ami_absences" ON public.ami_absences;
DROP POLICY IF EXISTS "Admins can update ami_absences" ON public.ami_absences;
CREATE POLICY "perm_insert_ami_absences" ON public.ami_absences FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canManagePeople'));
CREATE POLICY "perm_update_ami_absences" ON public.ami_absences FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManagePeople'))
  WITH CHECK (public.has_permission(auth.uid(), 'canManagePeople'));
CREATE POLICY "perm_delete_ami_absences" ON public.ami_absences FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManagePeople'));

DROP POLICY IF EXISTS "Admins can delete position_catalogue" ON public.position_catalogue;
DROP POLICY IF EXISTS "Admins can insert position_catalogue" ON public.position_catalogue;
DROP POLICY IF EXISTS "Admins can update position_catalogue" ON public.position_catalogue;
CREATE POLICY "perm_insert_position_catalogue" ON public.position_catalogue FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canManagePeople') OR public.has_permission(auth.uid(), 'canAccessSettings'));
CREATE POLICY "perm_update_position_catalogue" ON public.position_catalogue FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManagePeople') OR public.has_permission(auth.uid(), 'canAccessSettings'))
  WITH CHECK (public.has_permission(auth.uid(), 'canManagePeople') OR public.has_permission(auth.uid(), 'canAccessSettings'));
CREATE POLICY "perm_delete_position_catalogue" ON public.position_catalogue FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManagePeople') OR public.has_permission(auth.uid(), 'canAccessSettings'));

-- ============================================================
-- 15) exchange_rates
-- ============================================================
DROP POLICY IF EXISTS "Admins can delete exchange_rates" ON public.exchange_rates;
DROP POLICY IF EXISTS "Admins can insert exchange_rates" ON public.exchange_rates;
DROP POLICY IF EXISTS "Admins can update exchange_rates" ON public.exchange_rates;
CREATE POLICY "perm_insert_exchange_rates" ON public.exchange_rates FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canManageExchangeRates'));
CREATE POLICY "perm_update_exchange_rates" ON public.exchange_rates FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageExchangeRates'))
  WITH CHECK (public.has_permission(auth.uid(), 'canManageExchangeRates'));
CREATE POLICY "perm_delete_exchange_rates" ON public.exchange_rates FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageExchangeRates'));

-- ============================================================
-- 16) overhead_projects
-- ============================================================
DROP POLICY IF EXISTS "Admins can delete overhead_projects" ON public.overhead_projects;
DROP POLICY IF EXISTS "Admins can insert overhead_projects" ON public.overhead_projects;
DROP POLICY IF EXISTS "Admins can update overhead_projects" ON public.overhead_projects;
CREATE POLICY "perm_insert_overhead_projects" ON public.overhead_projects FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canManageOverheadProjects'));
CREATE POLICY "perm_update_overhead_projects" ON public.overhead_projects FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageOverheadProjects'))
  WITH CHECK (public.has_permission(auth.uid(), 'canManageOverheadProjects'));
CREATE POLICY "perm_delete_overhead_projects" ON public.overhead_projects FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageOverheadProjects'));

-- ============================================================
-- 17) cost_breakdown_presets, column_labels, custom_column_definitions, formula_config, production_settings
-- ============================================================
DROP POLICY IF EXISTS "Admins can delete cost_breakdown_presets" ON public.cost_breakdown_presets;
DROP POLICY IF EXISTS "Admins can insert cost_breakdown_presets" ON public.cost_breakdown_presets;
DROP POLICY IF EXISTS "Admins can update cost_breakdown_presets" ON public.cost_breakdown_presets;
CREATE POLICY "perm_insert_cost_breakdown_presets" ON public.cost_breakdown_presets FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canAccessSettings'));
CREATE POLICY "perm_update_cost_breakdown_presets" ON public.cost_breakdown_presets FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canAccessSettings'))
  WITH CHECK (public.has_permission(auth.uid(), 'canAccessSettings'));
CREATE POLICY "perm_delete_cost_breakdown_presets" ON public.cost_breakdown_presets FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canAccessSettings'));

DROP POLICY IF EXISTS "Admins can delete column_labels" ON public.column_labels;
DROP POLICY IF EXISTS "Admins can insert column_labels" ON public.column_labels;
DROP POLICY IF EXISTS "Admins can update column_labels" ON public.column_labels;
CREATE POLICY "perm_insert_column_labels" ON public.column_labels FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canAccessSettings') OR public.has_permission(auth.uid(), 'canEdit'));
CREATE POLICY "perm_update_column_labels" ON public.column_labels FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canAccessSettings') OR public.has_permission(auth.uid(), 'canEdit'))
  WITH CHECK (public.has_permission(auth.uid(), 'canAccessSettings') OR public.has_permission(auth.uid(), 'canEdit'));
CREATE POLICY "perm_delete_column_labels" ON public.column_labels FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canAccessSettings') OR public.has_permission(auth.uid(), 'canEdit'));

DROP POLICY IF EXISTS "Admins can delete custom_column_definitions" ON public.custom_column_definitions;
DROP POLICY IF EXISTS "Admins can insert custom_column_definitions" ON public.custom_column_definitions;
DROP POLICY IF EXISTS "Admins can update custom_column_definitions" ON public.custom_column_definitions;
CREATE POLICY "perm_insert_custom_column_definitions" ON public.custom_column_definitions FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canAccessSettings') OR public.has_permission(auth.uid(), 'canEdit'));
CREATE POLICY "perm_update_custom_column_definitions" ON public.custom_column_definitions FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canAccessSettings') OR public.has_permission(auth.uid(), 'canEdit'))
  WITH CHECK (public.has_permission(auth.uid(), 'canAccessSettings') OR public.has_permission(auth.uid(), 'canEdit'));
CREATE POLICY "perm_delete_custom_column_definitions" ON public.custom_column_definitions FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canAccessSettings') OR public.has_permission(auth.uid(), 'canEdit'));

DROP POLICY IF EXISTS "Admins can manage formula_config" ON public.formula_config;
CREATE POLICY "perm_manage_formula_config" ON public.formula_config FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'canAccessSettings'))
  WITH CHECK (public.has_permission(auth.uid(), 'canAccessSettings'));

DROP POLICY IF EXISTS "Admins can update production_settings" ON public.production_settings;
CREATE POLICY "perm_update_production_settings" ON public.production_settings FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canAccessSettings'))
  WITH CHECK (public.has_permission(auth.uid(), 'canAccessSettings'));

-- ============================================================
-- 18) project_status_options, tpv_status_options
-- ============================================================
DROP POLICY IF EXISTS "Admins can delete project_status_options" ON public.project_status_options;
DROP POLICY IF EXISTS "Admins can insert project_status_options" ON public.project_status_options;
DROP POLICY IF EXISTS "Admins can update project_status_options" ON public.project_status_options;
CREATE POLICY "perm_insert_project_status_options" ON public.project_status_options FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canManageStatuses'));
CREATE POLICY "perm_update_project_status_options" ON public.project_status_options FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageStatuses'))
  WITH CHECK (public.has_permission(auth.uid(), 'canManageStatuses'));
CREATE POLICY "perm_delete_project_status_options" ON public.project_status_options FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageStatuses'));

-- tpv_status_options môže neexistovať — zahalíme do DO bloku
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='tpv_status_options') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Admins can delete tpv_status_options" ON public.tpv_status_options';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can insert tpv_status_options" ON public.tpv_status_options';
    EXECUTE 'DROP POLICY IF EXISTS "Admins can update tpv_status_options" ON public.tpv_status_options';
    EXECUTE 'CREATE POLICY "perm_insert_tpv_status_options" ON public.tpv_status_options FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), ''canManageStatuses''))';
    EXECUTE 'CREATE POLICY "perm_update_tpv_status_options" ON public.tpv_status_options FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), ''canManageStatuses'')) WITH CHECK (public.has_permission(auth.uid(), ''canManageStatuses''))';
    EXECUTE 'CREATE POLICY "perm_delete_tpv_status_options" ON public.tpv_status_options FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), ''canManageStatuses''))';
  END IF;
END $$;

-- ============================================================
-- 19) profiles — admin actions cez canManageUsers
-- ============================================================
DROP POLICY IF EXISTS "Admins and owners can delete profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins and owners can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins and owners can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins and owners can update profiles" ON public.profiles;
CREATE POLICY "perm_read_all_profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageUsers') OR id = auth.uid());
CREATE POLICY "perm_insert_profiles" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'canManageUsers'));
CREATE POLICY "perm_update_profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageUsers') OR id = auth.uid())
  WITH CHECK (public.has_permission(auth.uid(), 'canManageUsers') OR id = auth.uid());
CREATE POLICY "perm_delete_profiles" ON public.profiles FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'canManageUsers'));

-- ============================================================
-- 20) tpv_* tabuľky — gate na canAccessTpv (read) + canWriteTpv (write)
--     Vypína celý TPV modul plošne; zapnúť cez Oprávnenia.
-- ============================================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'tpv_project_preparation','tpv_subcontract','tpv_supplier',
    'tpv_supplier_task','tpv_subcontract_request','tpv_hours_allocation',
    'tpv_inbox_task','tpv_material','tpv_preparation'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t) THEN
      -- drop ALL existing policies on this table
      EXECUTE format('
        DO $inner$
        DECLARE p record;
        BEGIN
          FOR p IN SELECT policyname FROM pg_policies WHERE schemaname=''public'' AND tablename=%L LOOP
            EXECUTE format(''DROP POLICY IF EXISTS %%I ON public.%I'', p.policyname);
          END LOOP;
        END
        $inner$;
      ', t, t);
      -- new policies
      EXECUTE format('CREATE POLICY "perm_select_%I" ON public.%I FOR SELECT TO authenticated USING (public.has_permission(auth.uid(), ''canAccessTpv''))', t, t);
      EXECUTE format('CREATE POLICY "perm_insert_%I" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(), ''canWriteTpv''))', t, t);
      EXECUTE format('CREATE POLICY "perm_update_%I" ON public.%I FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(), ''canWriteTpv'')) WITH CHECK (public.has_permission(auth.uid(), ''canWriteTpv''))', t, t);
      EXECUTE format('CREATE POLICY "perm_delete_%I" ON public.%I FOR DELETE TO authenticated USING (public.has_permission(auth.uid(), ''canWriteTpv''))', t, t);
    END IF;
  END LOOP;
END $$;
