
DROP POLICY IF EXISTS "Admins can delete people" ON public.people;
CREATE POLICY "Admins and PMs can delete people"
ON public.people
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'pm'::app_role)
);

DROP POLICY IF EXISTS "Admins and konstrukters can insert people" ON public.people;
CREATE POLICY "Non-viewers can insert people"
ON public.people
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'pm'::app_role) OR
  has_role(auth.uid(), 'konstrukter'::app_role)
);

DROP POLICY IF EXISTS "Admins and konstrukters can update people" ON public.people;
CREATE POLICY "Non-viewers can update people"
ON public.people
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'pm'::app_role) OR
  has_role(auth.uid(), 'konstrukter'::app_role)
);
