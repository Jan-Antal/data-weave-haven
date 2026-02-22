
-- Create exchange_rates table
CREATE TABLE public.exchange_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year integer NOT NULL UNIQUE,
  eur_czk numeric NOT NULL DEFAULT 25.0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

-- Public access policies (same pattern as other tables)
CREATE POLICY "Allow public read" ON public.exchange_rates FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.exchange_rates FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.exchange_rates FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.exchange_rates FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_exchange_rates_updated_at
  BEFORE UPDATE ON public.exchange_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed with default rates
INSERT INTO public.exchange_rates (year, eur_czk) VALUES
  (2024, 25.35),
  (2025, 25.10),
  (2026, 25.00);
