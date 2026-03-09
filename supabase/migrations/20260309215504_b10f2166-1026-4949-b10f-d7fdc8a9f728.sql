
-- Per-week production capacity table
CREATE TABLE public.production_capacity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_year integer NOT NULL,
  week_number integer NOT NULL,
  week_start date NOT NULL,
  capacity_hours numeric NOT NULL DEFAULT 875,
  working_days integer NOT NULL DEFAULT 5,
  is_manual_override boolean NOT NULL DEFAULT false,
  holiday_name text,
  company_holiday_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(week_year, week_number)
);

-- RLS
ALTER TABLE public.production_capacity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read production_capacity"
  ON public.production_capacity FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert production_capacity"
  ON public.production_capacity FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update production_capacity"
  ON public.production_capacity FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete production_capacity"
  ON public.production_capacity FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Company holidays table
CREATE TABLE public.company_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  capacity_override numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.company_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read company_holidays"
  ON public.company_holidays FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert company_holidays"
  ON public.company_holidays FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update company_holidays"
  ON public.company_holidays FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete company_holidays"
  ON public.company_holidays FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
