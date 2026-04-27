-- Add canAccessAnalyticsAbsence flag to all role defaults
UPDATE public.role_permission_defaults
SET permissions = permissions || jsonb_build_object(
  'canAccessAnalyticsAbsence',
  CASE
    WHEN role IN ('owner','admin','vedouci_pm','pm','nakupci','finance','vedouci_konstrukter','vedouci_vyroby','mistr','kalkulant','tester') THEN true
    ELSE false
  END
);