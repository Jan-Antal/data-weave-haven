
-- Projects table: merged data from Project Info, PM Status, and TPV Status
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  project_name TEXT NOT NULL,
  klient TEXT,
  location TEXT,
  pm TEXT,
  konstrukter TEXT,
  status TEXT,
  datum_smluvni TEXT,
  prodejni_cena NUMERIC,
  currency TEXT DEFAULT 'CZK',
  marze TEXT,
  fakturace TEXT,
  contract_link TEXT,
  fee_proposal_link TEXT,
  -- PM Status fields
  risk TEXT,
  smluvni TEXT,
  zamereni TEXT,
  tpv_date TEXT,
  expedice TEXT,
  predani TEXT,
  pm_poznamka TEXT,
  -- TPV Status fields
  narocnost TEXT,
  hodiny_tpv TEXT,
  percent_tpv NUMERIC DEFAULT 0,
  tpv_risk TEXT,
  datum_tpv TEXT,
  tpv_poznamka TEXT,
  -- Extra fields from source data
  architekt TEXT,
  kalkulant TEXT,
  datum_objednavky TEXT,
  material NUMERIC,
  vyroba NUMERIC,
  tpv_cost NUMERIC,
  subdodavky NUMERIC,
  dm TEXT,
  link_cn TEXT,
  velikost_zakazky TEXT,
  -- Meta
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS but allow public read (internal company tool, no auth)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.projects FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.projects FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.projects FOR DELETE USING (true);

-- Project stages child table
CREATE TABLE public.project_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES public.projects(project_id) ON DELETE CASCADE,
  stage_name TEXT NOT NULL,
  stage_order INTEGER,
  status TEXT,
  start_date TEXT,
  end_date TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.project_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON public.project_stages FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.project_stages FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.project_stages FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.project_stages FOR DELETE USING (true);

-- TPV items child table
CREATE TABLE public.tpv_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES public.projects(project_id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  item_type TEXT,
  status TEXT,
  sent_date TEXT,
  accepted_date TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tpv_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON public.tpv_items FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.tpv_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.tpv_items FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.tpv_items FOR DELETE USING (true);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_project_stages_updated_at BEFORE UPDATE ON public.project_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tpv_items_updated_at BEFORE UPDATE ON public.tpv_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
