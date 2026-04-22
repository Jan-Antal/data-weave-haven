DROP POLICY IF EXISTS "Forecast roles can insert production schedule" ON public.production_schedule;
DROP POLICY IF EXISTS "Forecast roles can update production schedule" ON public.production_schedule;
DROP POLICY IF EXISTS "Forecast roles can update production inbox" ON public.production_inbox;

CREATE POLICY "Forecast roles can insert production schedule"
ON public.production_schedule
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'owner'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'vedouci_vyroby'::public.app_role)
);

CREATE POLICY "Forecast roles can update production schedule"
ON public.production_schedule
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'owner'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'vedouci_vyroby'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'owner'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'vedouci_vyroby'::public.app_role)
);

CREATE POLICY "Forecast roles can update production inbox"
ON public.production_inbox
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'owner'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'vedouci_vyroby'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'owner'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'vedouci_vyroby'::public.app_role)
);