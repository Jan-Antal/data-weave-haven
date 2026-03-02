-- Allow konstrukter to insert people (add new persons)
DROP POLICY "Admins can insert people" ON public.people;
CREATE POLICY "Admins and konstrukters can insert people"
ON public.people
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'konstrukter'::app_role)
);

-- Allow konstrukter to update people (for toggling Konstruktér role)
DROP POLICY "Admins can update people" ON public.people;
CREATE POLICY "Admins and konstrukters can update people"
ON public.people
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'owner'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'konstrukter'::app_role)
);