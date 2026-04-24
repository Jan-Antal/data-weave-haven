-- 1) Add 'kalkulant' role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'kalkulant';

-- 2) tpv_project_preparation (1:1 per project)
CREATE TABLE IF NOT EXISTS public.tpv_project_preparation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL UNIQUE,
  calc_status text NOT NULL DEFAULT 'draft',
  readiness_overall numeric DEFAULT 0,
  target_release_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tpv_project_preparation_calc_status_chk
    CHECK (calc_status IN ('draft','review','released'))
);
CREATE INDEX IF NOT EXISTS idx_tpv_project_preparation_project ON public.tpv_project_preparation(project_id);

-- 3) tpv_supplier (CRM, contact merged inline)
CREATE TABLE IF NOT EXISTS public.tpv_supplier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nazov text NOT NULL,
  ico text,
  dic text,
  kontakt_meno text,
  kontakt_email text,
  kontakt_telefon text,
  kontakt_pozice text,
  web text,
  adresa text,
  kategorie text[] DEFAULT '{}',
  rating int,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tpv_supplier_rating_chk CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5))
);
CREATE INDEX IF NOT EXISTS idx_tpv_supplier_active ON public.tpv_supplier(is_active);
CREATE INDEX IF NOT EXISTS idx_tpv_supplier_nazov ON public.tpv_supplier(lower(nazov));

-- 4) tpv_subcontract
CREATE TABLE IF NOT EXISTS public.tpv_subcontract (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  tpv_item_id uuid REFERENCES public.tpv_items(id) ON DELETE SET NULL,
  nazov text NOT NULL,
  popis text,
  mnozstvo numeric,
  jednotka text,
  dodavatel_id uuid REFERENCES public.tpv_supplier(id) ON DELETE SET NULL,
  cena_predpokladana numeric,
  cena_finalna numeric,
  mena text NOT NULL DEFAULT 'CZK',
  stav text NOT NULL DEFAULT 'navrh',
  objednane_dat date,
  dodane_dat date,
  poznamka text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tpv_subcontract_stav_chk
    CHECK (stav IN ('navrh','rfq','ponuka','objednane','dodane','zruseno'))
);
CREATE INDEX IF NOT EXISTS idx_tpv_subcontract_project ON public.tpv_subcontract(project_id);
CREATE INDEX IF NOT EXISTS idx_tpv_subcontract_item ON public.tpv_subcontract(tpv_item_id);
CREATE INDEX IF NOT EXISTS idx_tpv_subcontract_supplier ON public.tpv_subcontract(dodavatel_id);
CREATE INDEX IF NOT EXISTS idx_tpv_subcontract_stav ON public.tpv_subcontract(stav);

-- 5) tpv_supplier_task
CREATE TABLE IF NOT EXISTS public.tpv_supplier_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.tpv_supplier(id) ON DELETE CASCADE,
  subcontract_id uuid REFERENCES public.tpv_subcontract(id) ON DELETE SET NULL,
  project_id text,
  title text NOT NULL,
  description text,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tpv_supplier_task_status_chk
    CHECK (status IN ('open','in_progress','done','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_tpv_supplier_task_supplier ON public.tpv_supplier_task(supplier_id);
CREATE INDEX IF NOT EXISTS idx_tpv_supplier_task_subcontract ON public.tpv_supplier_task(subcontract_id);
CREATE INDEX IF NOT EXISTS idx_tpv_supplier_task_assigned ON public.tpv_supplier_task(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tpv_supplier_task_status ON public.tpv_supplier_task(status);

-- 6) tpv_subcontract_request (RFQ)
CREATE TABLE IF NOT EXISTS public.tpv_subcontract_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontract_id uuid NOT NULL REFERENCES public.tpv_subcontract(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.tpv_supplier(id) ON DELETE CASCADE,
  sent_at timestamptz,
  responded_at timestamptz,
  cena_nabidka numeric,
  mena text DEFAULT 'CZK',
  termin_dodani date,
  stav text NOT NULL DEFAULT 'sent',
  poznamka text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tpv_subcontract_request_stav_chk
    CHECK (stav IN ('sent','received','accepted','rejected'))
);
CREATE INDEX IF NOT EXISTS idx_tpv_scr_subcontract ON public.tpv_subcontract_request(subcontract_id);
CREATE INDEX IF NOT EXISTS idx_tpv_scr_supplier ON public.tpv_subcontract_request(supplier_id);

-- 7) tpv_hours_allocation
CREATE TABLE IF NOT EXISTS public.tpv_hours_allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  tpv_item_id uuid NOT NULL REFERENCES public.tpv_items(id) ON DELETE CASCADE,
  hodiny_navrh numeric,
  stav text NOT NULL DEFAULT 'draft',
  submitted_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  return_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tpv_hours_allocation_stav_chk
    CHECK (stav IN ('draft','submitted','approved','returned')),
  CONSTRAINT tpv_hours_allocation_unique_item UNIQUE (tpv_item_id)
);
CREATE INDEX IF NOT EXISTS idx_tpv_hours_alloc_project ON public.tpv_hours_allocation(project_id);
CREATE INDEX IF NOT EXISTS idx_tpv_hours_alloc_stav ON public.tpv_hours_allocation(stav);

-- 8) tpv_inbox_task
CREATE TABLE IF NOT EXISTS public.tpv_inbox_task (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text,
  tpv_item_id uuid REFERENCES public.tpv_items(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  category text,
  priority text NOT NULL DEFAULT 'normal',
  assigned_to uuid,
  due_date date,
  status text NOT NULL DEFAULT 'open',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tpv_inbox_task_status_chk
    CHECK (status IN ('open','in_progress','done','cancelled')),
  CONSTRAINT tpv_inbox_task_priority_chk
    CHECK (priority IN ('low','normal','high','urgent'))
);
CREATE INDEX IF NOT EXISTS idx_tpv_inbox_task_project ON public.tpv_inbox_task(project_id);
CREATE INDEX IF NOT EXISTS idx_tpv_inbox_task_assigned ON public.tpv_inbox_task(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tpv_inbox_task_status ON public.tpv_inbox_task(status);
CREATE INDEX IF NOT EXISTS idx_tpv_inbox_task_due ON public.tpv_inbox_task(due_date);

-- 9) updated_at triggers
CREATE TRIGGER trg_tpv_project_preparation_updated_at
  BEFORE UPDATE ON public.tpv_project_preparation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tpv_supplier_updated_at
  BEFORE UPDATE ON public.tpv_supplier
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tpv_subcontract_updated_at
  BEFORE UPDATE ON public.tpv_subcontract
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tpv_supplier_task_updated_at
  BEFORE UPDATE ON public.tpv_supplier_task
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tpv_subcontract_request_updated_at
  BEFORE UPDATE ON public.tpv_subcontract_request
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tpv_hours_allocation_updated_at
  BEFORE UPDATE ON public.tpv_hours_allocation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tpv_inbox_task_updated_at
  BEFORE UPDATE ON public.tpv_inbox_task
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10) RLS — enable
ALTER TABLE public.tpv_project_preparation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_supplier ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_subcontract ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_supplier_task ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_subcontract_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_hours_allocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_inbox_task ENABLE ROW LEVEL SECURITY;

-- 11) RLS policies — uniform pattern
-- tpv_project_preparation
CREATE POLICY "auth read tpv_project_preparation" ON public.tpv_project_preparation
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tpv roles manage tpv_project_preparation" ON public.tpv_project_preparation
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pm') OR has_role(auth.uid(),'konstrukter') OR has_role(auth.uid(),'kalkulant'))
  WITH CHECK (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pm') OR has_role(auth.uid(),'konstrukter') OR has_role(auth.uid(),'kalkulant'));

-- tpv_supplier
CREATE POLICY "auth read tpv_supplier" ON public.tpv_supplier
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tpv roles manage tpv_supplier" ON public.tpv_supplier
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pm') OR has_role(auth.uid(),'konstrukter') OR has_role(auth.uid(),'kalkulant'))
  WITH CHECK (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pm') OR has_role(auth.uid(),'konstrukter') OR has_role(auth.uid(),'kalkulant'));

-- tpv_subcontract
CREATE POLICY "auth read tpv_subcontract" ON public.tpv_subcontract
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tpv roles manage tpv_subcontract" ON public.tpv_subcontract
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pm') OR has_role(auth.uid(),'konstrukter') OR has_role(auth.uid(),'kalkulant'))
  WITH CHECK (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pm') OR has_role(auth.uid(),'konstrukter') OR has_role(auth.uid(),'kalkulant'));

-- tpv_supplier_task
CREATE POLICY "auth read tpv_supplier_task" ON public.tpv_supplier_task
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tpv roles manage tpv_supplier_task" ON public.tpv_supplier_task
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pm') OR has_role(auth.uid(),'konstrukter') OR has_role(auth.uid(),'kalkulant'))
  WITH CHECK (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pm') OR has_role(auth.uid(),'konstrukter') OR has_role(auth.uid(),'kalkulant'));

-- tpv_subcontract_request
CREATE POLICY "auth read tpv_subcontract_request" ON public.tpv_subcontract_request
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tpv roles manage tpv_subcontract_request" ON public.tpv_subcontract_request
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pm') OR has_role(auth.uid(),'konstrukter') OR has_role(auth.uid(),'kalkulant'))
  WITH CHECK (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pm') OR has_role(auth.uid(),'konstrukter') OR has_role(auth.uid(),'kalkulant'));

-- tpv_hours_allocation
CREATE POLICY "auth read tpv_hours_allocation" ON public.tpv_hours_allocation
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tpv roles manage tpv_hours_allocation" ON public.tpv_hours_allocation
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pm') OR has_role(auth.uid(),'konstrukter') OR has_role(auth.uid(),'kalkulant'))
  WITH CHECK (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pm') OR has_role(auth.uid(),'konstrukter') OR has_role(auth.uid(),'kalkulant'));

-- tpv_inbox_task
CREATE POLICY "auth read tpv_inbox_task" ON public.tpv_inbox_task
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tpv roles manage tpv_inbox_task" ON public.tpv_inbox_task
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pm') OR has_role(auth.uid(),'konstrukter') OR has_role(auth.uid(),'kalkulant'))
  WITH CHECK (has_role(auth.uid(),'owner') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pm') OR has_role(auth.uid(),'konstrukter') OR has_role(auth.uid(),'kalkulant'));