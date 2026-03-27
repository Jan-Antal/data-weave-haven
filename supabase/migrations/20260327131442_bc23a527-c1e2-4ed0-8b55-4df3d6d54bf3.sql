CREATE POLICY "auth_select_production_hours_log"
ON public.production_hours_log
FOR SELECT
TO authenticated
USING (true);