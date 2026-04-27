-- Add canManageStages flag to role_permission_defaults for each role
UPDATE public.role_permission_defaults
SET permissions = permissions || jsonb_build_object('canManageStages', true)
WHERE role IN ('owner','admin','vedouci_pm','pm','nakupci','vedouci_konstrukter','kalkulant','tester');

UPDATE public.role_permission_defaults
SET permissions = permissions || jsonb_build_object('canManageStages', false)
WHERE role IN ('konstrukter','vedouci_vyroby','mistr','quality','viewer','finance','vyroba');
