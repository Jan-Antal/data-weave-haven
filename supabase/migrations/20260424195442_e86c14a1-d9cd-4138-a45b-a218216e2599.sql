DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-backup-export') THEN
    PERFORM cron.unschedule('daily-backup-export');
  END IF;
END $$;

SELECT cron.schedule(
  'daily-backup-export',
  '0 2 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://jvkuqvwmrzttelxkhrwr.supabase.co/functions/v1/backup-export',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2a3Vxdndtcnp0dGVseGtocndyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODc0MDUsImV4cCI6MjA4NzM2MzQwNX0.la8jZzRv3mzVt7DlPgDbZKO5td4STrtAdtjcRjmWRmk'
    ),
    body := jsonb_build_object(
      'mode', 'sharepoint',
      'trigger', 'cron',
      'secret', (SELECT value FROM public.app_config WHERE key='backup_cron_secret')
    )
  );
  $job$
);