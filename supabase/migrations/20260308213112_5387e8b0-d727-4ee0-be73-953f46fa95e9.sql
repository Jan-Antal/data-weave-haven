CREATE POLICY "Users can update own session tracking"
ON public.data_log
FOR UPDATE
USING ((auth.uid() = user_id) AND (action_type = 'user_session'))
WITH CHECK ((auth.uid() = user_id) AND (action_type = 'user_session'));