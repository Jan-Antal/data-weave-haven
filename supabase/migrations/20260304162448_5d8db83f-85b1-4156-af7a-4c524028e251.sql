DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'data_log'
      AND policyname = 'Users can update own login tracking'
  ) THEN
    CREATE POLICY "Users can update own login tracking"
    ON public.data_log
    FOR UPDATE
    USING (auth.uid() = user_id AND action_type = 'user_login')
    WITH CHECK (auth.uid() = user_id AND action_type = 'user_login');
  END IF;
END $$;