
-- ===================== PROJECTS =====================
DROP POLICY IF EXISTS "Non-viewers can update projects" ON public.projects;
DROP POLICY IF EXISTS "Admins and PMs can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Admins and PMs can delete projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated users can read projects" ON public.projects;
DROP POLICY IF EXISTS "All authenticated can read projects" ON public.projects;
DROP POLICY IF EXISTS "Admins PMs Konstrukter can update projects" ON public.projects;

CREATE POLICY "All authenticated can read projects" ON public.projects
  FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY "Admins and PMs can insert projects" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm'));
CREATE POLICY "Admins PMs Konstrukter can update projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter'))
  WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter'));
CREATE POLICY "Admins and PMs can delete projects" ON public.projects
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm'));

-- ===================== PROJECT_STAGES =====================
DROP POLICY IF EXISTS "Non-viewers can insert project_stages" ON public.project_stages;
DROP POLICY IF EXISTS "Non-viewers can update project_stages" ON public.project_stages;
DROP POLICY IF EXISTS "Non-viewers can delete project_stages" ON public.project_stages;
DROP POLICY IF EXISTS "Admins and PMs can delete project_stages" ON public.project_stages;
DROP POLICY IF EXISTS "All authenticated can read project_stages" ON public.project_stages;
DROP POLICY IF EXISTS "Authenticated users can read project_stages" ON public.project_stages;
DROP POLICY IF EXISTS "Admins PMs Konstrukter can manage project_stages" ON public.project_stages;

CREATE POLICY "All authenticated can read project_stages" ON public.project_stages
  FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY "Admins PMs Konstrukter can manage project_stages" ON public.project_stages
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter'))
  WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter'));

-- ===================== TPV_ITEMS =====================
DROP POLICY IF EXISTS "Authenticated users can read tpv_items" ON public.tpv_items;
DROP POLICY IF EXISTS "TPV managers can delete tpv_items" ON public.tpv_items;
DROP POLICY IF EXISTS "TPV managers can insert tpv_items" ON public.tpv_items;
DROP POLICY IF EXISTS "TPV managers can update tpv_items" ON public.tpv_items;
DROP POLICY IF EXISTS "Konstrukter can manage tpv_items" ON public.tpv_items;
DROP POLICY IF EXISTS "Admins PMs Konstrukter can manage tpv_items" ON public.tpv_items;
DROP POLICY IF EXISTS "All authenticated can read tpv_items" ON public.tpv_items;

CREATE POLICY "All authenticated can read tpv_items" ON public.tpv_items
  FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY "Admins PMs Konstrukter can manage tpv_items" ON public.tpv_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter'))
  WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter'));

-- ===================== PRODUCTION_SCHEDULE =====================
DROP POLICY IF EXISTS "Admins can manage production_schedule" ON public.production_schedule;
DROP POLICY IF EXISTS "PMs can read production_schedule" ON public.production_schedule;
DROP POLICY IF EXISTS "PM and Konstrukter can manage production_schedule" ON public.production_schedule;
DROP POLICY IF EXISTS "Admins and PMs can manage production_schedule" ON public.production_schedule;
DROP POLICY IF EXISTS "All authenticated can read production_schedule" ON public.production_schedule;

CREATE POLICY "All authenticated can read production_schedule" ON public.production_schedule
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and PMs can manage production_schedule" ON public.production_schedule
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm'))
  WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm'));

-- ===================== PRODUCTION_INBOX =====================
DROP POLICY IF EXISTS "Admins can manage production_inbox" ON public.production_inbox;
DROP POLICY IF EXISTS "PMs can read production_inbox" ON public.production_inbox;
DROP POLICY IF EXISTS "PM and Konstrukter can manage production_inbox" ON public.production_inbox;
DROP POLICY IF EXISTS "Admins PMs Konstrukter can manage production_inbox" ON public.production_inbox;
DROP POLICY IF EXISTS "All authenticated can read production_inbox" ON public.production_inbox;

CREATE POLICY "All authenticated can read production_inbox" ON public.production_inbox
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins PMs Konstrukter can manage production_inbox" ON public.production_inbox
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter'))
  WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter'));

-- ===================== PRODUCTION_DAILY_LOGS =====================
DROP POLICY IF EXISTS "Admins can manage production_daily_logs" ON public.production_daily_logs;
DROP POLICY IF EXISTS "PMs can read production_daily_logs" ON public.production_daily_logs;
DROP POLICY IF EXISTS "PM and Konstrukter can manage production_daily_logs" ON public.production_daily_logs;
DROP POLICY IF EXISTS "All non-viewers can manage production_daily_logs" ON public.production_daily_logs;
DROP POLICY IF EXISTS "All authenticated can read production_daily_logs" ON public.production_daily_logs;

CREATE POLICY "All authenticated can read production_daily_logs" ON public.production_daily_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "All non-viewers can manage production_daily_logs" ON public.production_daily_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter') OR has_role(auth.uid(), 'vyroba'))
  WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter') OR has_role(auth.uid(), 'vyroba'));

-- ===================== PRODUCTION_QUALITY_CHECKS =====================
DROP POLICY IF EXISTS "Admins can manage quality checks" ON public.production_quality_checks;
DROP POLICY IF EXISTS "PMs can read quality checks" ON public.production_quality_checks;
DROP POLICY IF EXISTS "PM and Konstrukter can manage quality checks" ON public.production_quality_checks;
DROP POLICY IF EXISTS "All non-viewers can manage quality checks" ON public.production_quality_checks;
DROP POLICY IF EXISTS "All authenticated can read quality checks" ON public.production_quality_checks;

CREATE POLICY "All authenticated can read quality checks" ON public.production_quality_checks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "All non-viewers can manage quality checks" ON public.production_quality_checks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter') OR has_role(auth.uid(), 'vyroba'))
  WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter') OR has_role(auth.uid(), 'vyroba'));

-- ===================== PRODUCTION_QUALITY_DEFECTS =====================
DROP POLICY IF EXISTS "Admins can manage defects" ON public.production_quality_defects;
DROP POLICY IF EXISTS "PMs can read defects" ON public.production_quality_defects;
DROP POLICY IF EXISTS "PM and Konstrukter can manage defects" ON public.production_quality_defects;
DROP POLICY IF EXISTS "All non-viewers can manage defects" ON public.production_quality_defects;
DROP POLICY IF EXISTS "All authenticated can read defects" ON public.production_quality_defects;

CREATE POLICY "All authenticated can read defects" ON public.production_quality_defects
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "All non-viewers can manage defects" ON public.production_quality_defects
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter') OR has_role(auth.uid(), 'vyroba'))
  WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter') OR has_role(auth.uid(), 'vyroba'));

-- ===================== DATA_LOG =====================
DROP POLICY IF EXISTS "Authenticated users can insert activity log" ON public.data_log;
DROP POLICY IF EXISTS "All non-viewers can insert data_log" ON public.data_log;

CREATE POLICY "All non-viewers can insert data_log" ON public.data_log
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter') OR has_role(auth.uid(), 'vyroba'));
