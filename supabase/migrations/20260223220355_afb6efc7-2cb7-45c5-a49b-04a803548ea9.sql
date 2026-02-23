
-- Fix 1: Replace overly permissive RLS policies on all primary tables
-- Pattern: SELECT for authenticated users, INSERT/UPDATE for admin/owner/pm, DELETE for admin/owner/pm

-- ==================== projects ====================
DROP POLICY IF EXISTS "Allow public read access" ON public.projects;
DROP POLICY IF EXISTS "Allow public read" ON public.projects;
DROP POLICY IF EXISTS "Allow public insert" ON public.projects;
DROP POLICY IF EXISTS "Allow public update" ON public.projects;
DROP POLICY IF EXISTS "Allow public delete" ON public.projects;

CREATE POLICY "Authenticated users can read projects" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins and PMs can insert projects" ON public.projects FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm'));
CREATE POLICY "Non-viewers can update projects" ON public.projects FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter'));
CREATE POLICY "Admins and PMs can delete projects" ON public.projects FOR DELETE TO authenticated USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm'));

-- ==================== project_stages ====================
DROP POLICY IF EXISTS "Allow public read" ON public.project_stages;
DROP POLICY IF EXISTS "Allow public insert" ON public.project_stages;
DROP POLICY IF EXISTS "Allow public update" ON public.project_stages;
DROP POLICY IF EXISTS "Allow public delete" ON public.project_stages;

CREATE POLICY "Authenticated users can read project_stages" ON public.project_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Non-viewers can insert project_stages" ON public.project_stages FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter'));
CREATE POLICY "Non-viewers can update project_stages" ON public.project_stages FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter'));
CREATE POLICY "Admins and PMs can delete project_stages" ON public.project_stages FOR DELETE TO authenticated USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm'));

-- ==================== tpv_items ====================
DROP POLICY IF EXISTS "Allow public read" ON public.tpv_items;
DROP POLICY IF EXISTS "Allow public insert" ON public.tpv_items;
DROP POLICY IF EXISTS "Allow public update" ON public.tpv_items;
DROP POLICY IF EXISTS "Allow public delete" ON public.tpv_items;

CREATE POLICY "Authenticated users can read tpv_items" ON public.tpv_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "TPV managers can insert tpv_items" ON public.tpv_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter'));
CREATE POLICY "TPV managers can update tpv_items" ON public.tpv_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter'));
CREATE POLICY "TPV managers can delete tpv_items" ON public.tpv_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'pm') OR has_role(auth.uid(), 'konstrukter'));

-- ==================== people ====================
DROP POLICY IF EXISTS "Allow public read" ON public.people;
DROP POLICY IF EXISTS "Allow public insert" ON public.people;
DROP POLICY IF EXISTS "Allow public update" ON public.people;
DROP POLICY IF EXISTS "Allow public delete" ON public.people;

CREATE POLICY "Authenticated users can read people" ON public.people FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert people" ON public.people FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update people" ON public.people FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete people" ON public.people FOR DELETE TO authenticated USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'));

-- ==================== exchange_rates ====================
DROP POLICY IF EXISTS "Allow public read" ON public.exchange_rates;
DROP POLICY IF EXISTS "Allow public insert" ON public.exchange_rates;
DROP POLICY IF EXISTS "Allow public update" ON public.exchange_rates;
DROP POLICY IF EXISTS "Allow public delete" ON public.exchange_rates;

CREATE POLICY "Authenticated users can read exchange_rates" ON public.exchange_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert exchange_rates" ON public.exchange_rates FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update exchange_rates" ON public.exchange_rates FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete exchange_rates" ON public.exchange_rates FOR DELETE TO authenticated USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'));

-- ==================== column_labels ====================
DROP POLICY IF EXISTS "Allow public read" ON public.column_labels;
DROP POLICY IF EXISTS "Allow public insert" ON public.column_labels;
DROP POLICY IF EXISTS "Allow public update" ON public.column_labels;
DROP POLICY IF EXISTS "Allow public delete" ON public.column_labels;

CREATE POLICY "Authenticated users can read column_labels" ON public.column_labels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert column_labels" ON public.column_labels FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update column_labels" ON public.column_labels FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete column_labels" ON public.column_labels FOR DELETE TO authenticated USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'));

-- ==================== project_status_options ====================
DROP POLICY IF EXISTS "Allow public read" ON public.project_status_options;
DROP POLICY IF EXISTS "Allow public insert" ON public.project_status_options;
DROP POLICY IF EXISTS "Allow public update" ON public.project_status_options;
DROP POLICY IF EXISTS "Allow public delete" ON public.project_status_options;

CREATE POLICY "Authenticated users can read project_status_options" ON public.project_status_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert project_status_options" ON public.project_status_options FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update project_status_options" ON public.project_status_options FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete project_status_options" ON public.project_status_options FOR DELETE TO authenticated USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'));

-- ==================== tpv_status_options ====================
DROP POLICY IF EXISTS "Allow public read" ON public.tpv_status_options;
DROP POLICY IF EXISTS "Allow public insert" ON public.tpv_status_options;
DROP POLICY IF EXISTS "Allow public update" ON public.tpv_status_options;
DROP POLICY IF EXISTS "Allow public delete" ON public.tpv_status_options;

CREATE POLICY "Authenticated users can read tpv_status_options" ON public.tpv_status_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert tpv_status_options" ON public.tpv_status_options FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update tpv_status_options" ON public.tpv_status_options FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete tpv_status_options" ON public.tpv_status_options FOR DELETE TO authenticated USING (has_role(auth.uid(), 'owner') OR has_role(auth.uid(), 'admin'));
