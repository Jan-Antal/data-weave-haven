
CREATE POLICY "Anonymous can read production_schedule"
ON public.production_schedule FOR SELECT TO anon USING (true);

CREATE POLICY "Anonymous can read production_inbox"
ON public.production_inbox FOR SELECT TO anon USING (true);

CREATE POLICY "Anonymous can read production_capacity"
ON public.production_capacity FOR SELECT TO anon USING (true);

CREATE POLICY "Anonymous can read production_daily_logs"
ON public.production_daily_logs FOR SELECT TO anon USING (true);

CREATE POLICY "Anonymous can read tpv_items"
ON public.tpv_items FOR SELECT TO anon USING (deleted_at IS NULL);

CREATE POLICY "Anonymous can read project_stages"
ON public.project_stages FOR SELECT TO anon USING (deleted_at IS NULL);

CREATE POLICY "Anonymous can read people"
ON public.people FOR SELECT TO anon USING (true);

CREATE POLICY "Anonymous can read production_quality_defects"
ON public.production_quality_defects FOR SELECT TO anon USING (true);

CREATE POLICY "Anonymous can read data_log"
ON public.data_log FOR SELECT TO anon USING (true);
