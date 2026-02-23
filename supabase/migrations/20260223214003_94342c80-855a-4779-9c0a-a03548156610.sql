-- Update RLS policies to also allow owner role for profiles
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins and owners can delete profiles" ON public.profiles FOR DELETE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
CREATE POLICY "Admins and owners can insert profiles" ON public.profiles FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "Admins can read all profiles" ON public.profiles;
CREATE POLICY "Admins and owners can read all profiles" ON public.profiles FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins and owners can update profiles" ON public.profiles FOR UPDATE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'owner'));

-- Update RLS policies for user_roles
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins and owners can manage roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'owner')) WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "Admins can read all roles" ON public.user_roles;
CREATE POLICY "Admins and owners can read all roles" ON public.user_roles FOR SELECT USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'owner'));