-- TPV Preparation module: two new tables for documentation/hours/material tracking

-- 1. tpv_preparation (1:1 with tpv_items)
CREATE TABLE public.tpv_preparation (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tpv_item_id UUID NOT NULL REFERENCES public.tpv_items(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  doc_ok BOOLEAN NOT NULL DEFAULT false,
  hodiny_manual NUMERIC,
  hodiny_schvalene BOOLEAN NOT NULL DEFAULT false,
  readiness_status TEXT NOT NULL DEFAULT 'rozpracovane'
    CHECK (readiness_status IN ('rozpracovane','ready','riziko','blokovane')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tpv_item_id)
);

CREATE INDEX idx_tpv_preparation_project_id ON public.tpv_preparation(project_id);
CREATE INDEX idx_tpv_preparation_tpv_item_id ON public.tpv_preparation(tpv_item_id);

ALTER TABLE public.tpv_preparation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tpv_preparation"
  ON public.tpv_preparation FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Konstrukter PM Admin can insert tpv_preparation"
  ON public.tpv_preparation FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pm'::app_role)
    OR has_role(auth.uid(), 'konstrukter'::app_role)
  );

CREATE POLICY "Konstrukter PM Admin can update tpv_preparation"
  ON public.tpv_preparation FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pm'::app_role)
    OR has_role(auth.uid(), 'konstrukter'::app_role)
  );

CREATE POLICY "Admins can delete tpv_preparation"
  ON public.tpv_preparation FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

CREATE TRIGGER update_tpv_preparation_updated_at
  BEFORE UPDATE ON public.tpv_preparation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 2. tpv_material (1:N with tpv_items)
CREATE TABLE public.tpv_material (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tpv_item_id UUID NOT NULL REFERENCES public.tpv_items(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  nazov TEXT NOT NULL,
  mnozstvo NUMERIC,
  jednotka TEXT,
  dodavatel TEXT,
  objednane_dat DATE,
  dodane_dat DATE,
  stav TEXT NOT NULL DEFAULT 'nezadany'
    CHECK (stav IN ('nezadany','objednane','caka','dodane')),
  poznamka TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tpv_material_project_id ON public.tpv_material(project_id);
CREATE INDEX idx_tpv_material_tpv_item_id ON public.tpv_material(tpv_item_id);
CREATE INDEX idx_tpv_material_nazov ON public.tpv_material(lower(nazov));

ALTER TABLE public.tpv_material ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tpv_material"
  ON public.tpv_material FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Konstrukter PM Admin can insert tpv_material"
  ON public.tpv_material FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pm'::app_role)
    OR has_role(auth.uid(), 'konstrukter'::app_role)
  );

CREATE POLICY "Konstrukter PM Admin can update tpv_material"
  ON public.tpv_material FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pm'::app_role)
    OR has_role(auth.uid(), 'konstrukter'::app_role)
  );

CREATE POLICY "Konstrukter PM Admin can delete tpv_material"
  ON public.tpv_material FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'pm'::app_role)
    OR has_role(auth.uid(), 'konstrukter'::app_role)
  );

CREATE TRIGGER update_tpv_material_updated_at
  BEFORE UPDATE ON public.tpv_material
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();