-- Formula configuration table for dynamic calculation expressions
-- Rows with is_default=true should NEVER be deleted — they are the system defaults
CREATE TABLE IF NOT EXISTS public.formula_config (
  key text PRIMARY KEY,
  expression text NOT NULL,
  description text,
  is_default boolean DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.formula_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage formula_config" ON public.formula_config
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'owner'::app_role)
  );

CREATE POLICY "All authenticated users can read formula_config" ON public.formula_config
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert default formulas (safe defaults, never delete rows with is_default=true)
INSERT INTO public.formula_config (key, expression, description, is_default) VALUES
  ('scheduled_czk_hist', 'FLOOR((scheduled_hours / hodiny_plan) * prodejni_cena * eur_czk)', 'Hodnota HIST bundle', true),
  ('scheduled_czk_tpv', 'FLOOR(tpv_cena * pocet * eur_czk)', 'Hodnota TPV bundle', true),
  ('scheduled_hours', 'FLOOR(itemCostCzk * (1 - marze) * production_pct / hourly_rate)', 'Hodiny bundle', true),
  ('hodiny_plan_projekt', 'FLOOR(prodejni_cena * eur_czk * (1 - marze) * production_pct / hourly_rate)', 'Hodiny projektu z ceny', true),
  ('hodiny_plan_tpv', 'FLOOR(tpv_cena * pocet * eur_czk * (1 - marze) * production_pct / hourly_rate)', 'Hodiny projektu z TPV', true),
  ('production_pct', 'preset_production_pct / 100', 'Production PCT', true),
  ('weekly_goal_pct', 'MIN(FLOOR((past_hours + current_hours * (day_idx + 1) / 5) / hodiny_plan * 100), 100)', 'Týdenní cíl %', true),
  ('is_on_track', 'percent >= weekly_goal_pct', 'On track?', true)
ON CONFLICT (key) DO NOTHING;