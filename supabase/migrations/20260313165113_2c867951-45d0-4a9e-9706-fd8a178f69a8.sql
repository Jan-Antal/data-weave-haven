INSERT INTO projects (
  project_id, project_name, status, prodejni_cena, marze,
  expedice, montaz, predani, datum_smluvni,
  vyroba, is_active
) VALUES
  ('TEST-ZS-001', 'TEST Kuchyň Novák — bez termínu', 'Výroba', 180000, '25',
   NULL, NULL, NULL, NULL, 90000, true),
  ('TEST-ZS-002', 'TEST Obývák Procházka — bez termínu', 'Výroba', 120000, '30',
   NULL, NULL, NULL, NULL, 60000, true),
  ('TEST-ZS-003', 'TEST Koupelna Dvořák — bez termínu', 'Výroba', 80000, '20',
   NULL, NULL, NULL, NULL, 40000, true);