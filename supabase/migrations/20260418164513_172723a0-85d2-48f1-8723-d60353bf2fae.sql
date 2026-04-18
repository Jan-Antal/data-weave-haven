-- 1. Extend ami_employees
ALTER TABLE public.ami_employees
  ADD COLUMN IF NOT EXISTS stredisko text,
  ADD COLUMN IF NOT EXISTS usek_nazov text,
  ADD COLUMN IF NOT EXISTS pozicia text,
  ADD COLUMN IF NOT EXISTS deactivated_date date;

-- 2. Extend people
ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS firma text;

-- 3. Position catalogue
CREATE TABLE IF NOT EXISTS public.position_catalogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stredisko text NOT NULL,
  usek text NOT NULL,
  pozicia text NOT NULL,
  project_dropdown_role text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stredisko, usek, pozicia)
);

ALTER TABLE public.position_catalogue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read position_catalogue" ON public.position_catalogue;
CREATE POLICY "Authenticated can read position_catalogue"
  ON public.position_catalogue FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert position_catalogue" ON public.position_catalogue;
CREATE POLICY "Admins can insert position_catalogue"
  ON public.position_catalogue FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update position_catalogue" ON public.position_catalogue;
CREATE POLICY "Admins can update position_catalogue"
  ON public.position_catalogue FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete position_catalogue" ON public.position_catalogue;
CREATE POLICY "Admins can delete position_catalogue"
  ON public.position_catalogue FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_position_catalogue_updated_at ON public.position_catalogue;
CREATE TRIGGER trg_position_catalogue_updated_at
  BEFORE UPDATE ON public.position_catalogue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Seed catalogue
INSERT INTO public.position_catalogue (stredisko, usek, pozicia, project_dropdown_role, sort_order) VALUES
  -- Výroba Direct
  ('Výroba Direct', 'Kompletace', 'Truhlář',   NULL, 10),
  ('Výroba Direct', 'Kompletace', 'Předák',    NULL, 11),
  ('Výroba Direct', 'Kompletace', 'Pomocník',  NULL, 12),
  ('Výroba Direct', 'Lakovna',    'Lakýrník',  NULL, 20),
  ('Výroba Direct', 'Rezání',     'Operátor',  NULL, 30),
  ('Výroba Direct', 'CNC',        'Operátor',  NULL, 40),
  ('Výroba Direct', 'Dyhárna',    'Operátor',  NULL, 50),
  ('Výroba Direct', 'Olepování',  'Operátor',  NULL, 60),
  ('Výroba Direct', 'Balení',     'Pracovník', NULL, 70),
  ('Výroba Direct', 'Expedice',   'Pracovník', NULL, 80),
  -- Výroba Indirect
  ('Výroba Indirect', 'Vedenie výroby', 'Vedúci výroby', NULL, 110),
  ('Výroba Indirect', 'Vedenie výroby', 'Mistr',         NULL, 111),
  ('Výroba Indirect', 'Vedenie výroby', 'Skladník',      NULL, 112),
  ('Výroba Indirect', 'Vedenie výroby', 'Logistik',      NULL, 113),
  ('Výroba Indirect', 'Vedenie výroby', 'Údržbár',       NULL, 114),
  -- Provoz
  ('Provoz', 'Project Management', 'Project Manager', 'pm',          210),
  ('Provoz', 'Project Management', 'Junior PM',       'pm',          211),
  ('Provoz', 'Konstrukce/TPV',     'Konstruktér',     'konstrukter', 220),
  ('Provoz', 'Konstrukce/TPV',     'Technolog',       'konstrukter', 221),
  ('Provoz', 'Obchod/Kalkulace',   'Kalkulant',       'kalkulant',   230),
  ('Provoz', 'Obchod/Kalkulace',   'Junior Kalkulant','kalkulant',   231),
  ('Provoz', 'Admin/Backoffice',   'Office Manager',  NULL, 240),
  ('Provoz', 'Admin/Backoffice',   'Účetní',          NULL, 241),
  ('Provoz', 'Admin/Backoffice',   'HR',              NULL, 242),
  ('Provoz', 'Nákup a Logistika',  'Nákupčí',         NULL, 250)
ON CONFLICT (stredisko, usek, pozicia) DO NOTHING;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_position_catalogue_role ON public.position_catalogue (project_dropdown_role) WHERE project_dropdown_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ami_employees_usek_nazov ON public.ami_employees (usek_nazov);
CREATE INDEX IF NOT EXISTS idx_ami_employees_stredisko ON public.ami_employees (stredisko);
CREATE INDEX IF NOT EXISTS idx_people_is_external ON public.people (is_external);