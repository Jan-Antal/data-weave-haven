-- ============================================================
-- TPV Phase 6 — Material schema rework + sampling + N:M to items
-- ============================================================
--
-- Why:
-- 1) Existing tpv_material had implicit 1:N to tpv_items (one material
--    row per prvok). Real workflow: one material can serve many prvkov,
--    and after sampling materials can be merged. Need N:M.
-- 2) AI auto-import from PDF needs to capture richer data:
--    internal_code (M01, M02), prefix (M/U/SP/SK), specifikácia,
--    poznamky, dodava_arkhe flag, nutno_vzorovat flag.
-- 3) Sampling (vzorovanie) is now a first-class entity with
--    alternatives, photos, approval state.
-- 4) Subdodávky get category + internal_code + flags so AI can
--    place SP.xx and SK.xx items in the right tab.
--
-- Strategy:
-- - WIPE tpv_material rows (per Jan's instruction — fake test data only)
-- - DROP & RECREATE tpv_material with new schema
-- - Create tpv_material_item_link (N:M)
-- - Create tpv_material_sample (sampling + alternatives)
-- - ALTER tpv_subcontract — add new columns (preserve data)
-- - Reload PostgREST schema cache
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) tpv_material — drop existing, recreate
-- ------------------------------------------------------------

-- Wipe all existing rows first (they're test data only)
DELETE FROM public.tpv_material;

DROP TABLE IF EXISTS public.tpv_material CASCADE;

CREATE TABLE public.tpv_material (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            text NOT NULL REFERENCES public.projects(project_id) ON DELETE CASCADE,
  -- Identification (from PDF legend)
  internal_code         text,                                       -- "M01", "M02", "U01a"...
  prefix                text CHECK (prefix IN ('M','U') OR prefix IS NULL), -- M=material, U=úchytka/kovanie
  nazov                 text NOT NULL,                              -- "LTD tl. 18 mm"
  specifikacia          text,                                       -- "Egger U708 ST9 Světle šedá"
  hrana                 text,                                       -- "hrana 1 mm dle dekoru desky"
  kategoria             text,                                       -- "ltd / mdf / sklo / kameň / úchytka / kovanie"
  -- Flags from PDF notes
  dodava_arkhe          boolean NOT NULL DEFAULT false,             -- "DODÁVÁ ARKHE" — we don't supply, only mount
  nutno_vzorovat        boolean NOT NULL DEFAULT true,              -- almost always true based on real PDFs
  -- Free-form notes (everything from bullet points in PDF)
  poznamky              text,
  -- Quantity (cumulative — derived from links, but stored for fast read)
  mnozstvo_kumulovane   numeric,                                    -- SUM of links — recomputed
  jednotka              text,                                       -- "m²", "m", "ks", "kg"
  -- Pricing
  cena_jednotkova       numeric,
  cena_celkova          numeric GENERATED ALWAYS AS (
                          COALESCE(cena_jednotkova, 0) * COALESCE(mnozstvo_kumulovane, 0)
                        ) STORED,
  mena                  text NOT NULL DEFAULT 'CZK',
  -- Sourcing
  dodavatel_id          uuid REFERENCES public.tpv_supplier(id) ON DELETE SET NULL,
  produkt_ref           text,                                       -- "Egger W1000" — selected product after sampling
  -- Workflow
  stav                  text NOT NULL DEFAULT 'extracted'
                        CHECK (stav IN (
                          'extracted',     -- from AI auto-import, awaits review
                          'needs_review',  -- human pending
                          'confirmed',     -- confirmed real item
                          'sampling',      -- in sampling
                          'sample_ok',     -- approved by client
                          'specified',     -- final spec + price done
                          'ordering',      -- order being prepared
                          'ordered',       -- ordered with supplier
                          'delivered'      -- physically received
                        )),
  -- AI auto-import metadata
  ai_extracted          boolean NOT NULL DEFAULT false,
  ai_confidence         numeric,                                    -- 0.0–1.0 score
  ai_source_doc         text,                                       -- e.g. "POS_DPI_ASR_900_R01_atypicke-prvky.pdf"
  -- Timestamps
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Uniqueness: avoid duplicates per project + internal_code
  CONSTRAINT tpv_material_unique_internal_code UNIQUE (project_id, internal_code)
);

CREATE INDEX idx_tpv_material_project_id ON public.tpv_material(project_id);
CREATE INDEX idx_tpv_material_dodavatel_id ON public.tpv_material(dodavatel_id);
CREATE INDEX idx_tpv_material_stav ON public.tpv_material(stav);
CREATE INDEX idx_tpv_material_prefix ON public.tpv_material(prefix);

COMMENT ON TABLE public.tpv_material IS
  'Material/hardware catalog per project. N:M to tpv_items via tpv_material_item_link. After sampling, materials may be merged.';
COMMENT ON COLUMN public.tpv_material.internal_code IS
  'Code from PDF legend, e.g. "M01", "U01a". May change after sampling/merging.';
COMMENT ON COLUMN public.tpv_material.dodava_arkhe IS
  'True when the architect/investor supplies the material; we only mount it (e.g. natural stone).';

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.tpv_material_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tpv_material_updated_at
  BEFORE UPDATE ON public.tpv_material
  FOR EACH ROW EXECUTE FUNCTION public.tpv_material_set_updated_at();


-- ------------------------------------------------------------
-- 2) tpv_material_item_link — N:M between material and prvkov
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tpv_material_item_link (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id           uuid NOT NULL REFERENCES public.tpv_material(id) ON DELETE CASCADE,
  tpv_item_id           uuid NOT NULL REFERENCES public.tpv_items(id) ON DELETE CASCADE,
  mnozstvo_per_item     numeric,                                    -- area/length/count of THIS material on THIS prvok
  jednotka              text,                                       -- override if differs from material default
  occurrences           int,                                        -- count of times material code appears on the prvok drawing (AI hint)
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- One link record per (material, prvok) pair
  CONSTRAINT tpv_material_item_link_unique UNIQUE (material_id, tpv_item_id)
);

CREATE INDEX idx_tpv_material_item_link_material ON public.tpv_material_item_link(material_id);
CREATE INDEX idx_tpv_material_item_link_item ON public.tpv_material_item_link(tpv_item_id);

COMMENT ON TABLE public.tpv_material_item_link IS
  'N:M relationship between materials and prvkov. mnozstvo_per_item = quantity of this material on this prvok. SUM across links = total material quantity to order.';

-- Trigger: when link changes, recompute material.mnozstvo_kumulovane
CREATE OR REPLACE FUNCTION public.tpv_material_link_recompute_total()
RETURNS TRIGGER AS $$
DECLARE
  v_material_id uuid;
  v_total numeric;
BEGIN
  v_material_id := COALESCE(NEW.material_id, OLD.material_id);
  SELECT COALESCE(SUM(mnozstvo_per_item), 0)
    INTO v_total
    FROM public.tpv_material_item_link
    WHERE material_id = v_material_id;
  UPDATE public.tpv_material
    SET mnozstvo_kumulovane = v_total
    WHERE id = v_material_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tpv_material_link_recompute_ai
  AFTER INSERT OR UPDATE OR DELETE ON public.tpv_material_item_link
  FOR EACH ROW EXECUTE FUNCTION public.tpv_material_link_recompute_total();


-- ------------------------------------------------------------
-- 3) tpv_material_sample — sampling rounds + alternatives
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tpv_material_sample (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id           uuid NOT NULL REFERENCES public.tpv_material(id) ON DELETE CASCADE,
  poradie               int NOT NULL DEFAULT 1,                     -- 1 = original, 2,3 = alternatives
  nazov_vzorky          text NOT NULL,                              -- "Egger U708" or "alt: Egger W980"
  specifikacia          text,
  foto_url              text,                                       -- SharePoint or storage link
  stav                  text NOT NULL DEFAULT 'navrhnute'
                        CHECK (stav IN (
                          'navrhnute',     -- proposed
                          'objednane',     -- sample ordered
                          'dorucene',      -- sample arrived
                          'schvalene',     -- approved by client
                          'zamietnute'     -- rejected by client
                        )),
  schvalene_kym         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  schvalene_kedy        timestamptz,
  zamietnutie_dovod     text,
  poznamka              text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tpv_material_sample_material ON public.tpv_material_sample(material_id);
CREATE INDEX idx_tpv_material_sample_stav ON public.tpv_material_sample(stav);

COMMENT ON TABLE public.tpv_material_sample IS
  'Sampling alternatives for a material. poradie=1 is the primary, 2..N are alternatives proposed during sampling round.';


-- ------------------------------------------------------------
-- 4) tpv_subcontract — extend with category + auto-import flags
-- ------------------------------------------------------------

ALTER TABLE public.tpv_subcontract
  ADD COLUMN IF NOT EXISTS kategoria       text,                  -- 'spotrebice','sanita','kovovyroba','calounenie','ine'
  ADD COLUMN IF NOT EXISTS internal_code   text,                  -- "SP.01", "SK.02"
  ADD COLUMN IF NOT EXISTS nutno_vzorovat  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vazba_na_vyrobu boolean DEFAULT true,  -- mounted into furniture → must be on-site before assembly
  ADD COLUMN IF NOT EXISTS ai_extracted    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_confidence   numeric,
  ADD COLUMN IF NOT EXISTS ai_source_doc   text;

ALTER TABLE public.tpv_subcontract
  DROP CONSTRAINT IF EXISTS tpv_subcontract_kategoria_check;

ALTER TABLE public.tpv_subcontract
  ADD CONSTRAINT tpv_subcontract_kategoria_check
  CHECK (kategoria IS NULL OR kategoria IN
         ('spotrebice','sanita','kovovyroba','calounenie','ine'));

CREATE INDEX IF NOT EXISTS idx_tpv_subcontract_kategoria
  ON public.tpv_subcontract(kategoria);
CREATE INDEX IF NOT EXISTS idx_tpv_subcontract_internal_code
  ON public.tpv_subcontract(project_id, internal_code);

COMMENT ON COLUMN public.tpv_subcontract.kategoria IS
  'spotrebice (SP.xx, e.g. fridge), sanita (SK.xx, e.g. tap), kovovyroba, calounenie, ine. Drives AI auto-extraction routing.';
COMMENT ON COLUMN public.tpv_subcontract.vazba_na_vyrobu IS
  'When true, must be on-site before our furniture assembly (e.g. appliance mounted in cabinet). Affects production scheduling.';


-- ------------------------------------------------------------
-- 5) RLS policies
-- ------------------------------------------------------------

ALTER TABLE public.tpv_material ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_material_item_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tpv_material_sample ENABLE ROW LEVEL SECURITY;

-- Read: anyone authenticated (the previous tpv_material had this; keep parity)
DROP POLICY IF EXISTS tpv_material_read_all ON public.tpv_material;
CREATE POLICY tpv_material_read_all
  ON public.tpv_material FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS tpv_material_link_read_all ON public.tpv_material_item_link;
CREATE POLICY tpv_material_link_read_all
  ON public.tpv_material_item_link FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS tpv_material_sample_read_all ON public.tpv_material_sample;
CREATE POLICY tpv_material_sample_read_all
  ON public.tpv_material_sample FOR SELECT
  TO authenticated
  USING (true);

-- Write: any authenticated user (UI guards by canEditMaterial perm flag)
DROP POLICY IF EXISTS tpv_material_write_all ON public.tpv_material;
CREATE POLICY tpv_material_write_all
  ON public.tpv_material FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS tpv_material_link_write_all ON public.tpv_material_item_link;
CREATE POLICY tpv_material_link_write_all
  ON public.tpv_material_item_link FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS tpv_material_sample_write_all ON public.tpv_material_sample;
CREATE POLICY tpv_material_sample_write_all
  ON public.tpv_material_sample FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ------------------------------------------------------------
-- 6) Reload PostgREST schema cache
-- ------------------------------------------------------------

NOTIFY pgrst, 'reload schema';

COMMIT;
