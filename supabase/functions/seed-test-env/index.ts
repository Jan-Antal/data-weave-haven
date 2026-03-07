import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEST_EMAIL = "alfred@ami-test.cz";
const TEST_PASSWORD = "Alfred2026!";
const TEST_FULL_NAME = "Alfred Test (AMI)";

// Using Z-2201-XXX prefix to avoid any collision with production Z-26XX projects
const PROJECTS = [
  {
    project_id: "Z-2201-001",
    project_name: "Rezidence Vinohrady — Byt 4A",
    klient: "Ing. Martin Dvořák",
    pm: "Novák Jan",
    konstrukter: "Svoboda Petr",
    status: "Projekce",
    datum_smluvni: "2026-06-15",
    datum_objednavky: "2026-01-10",
    prodejni_cena: 2850000,
    marze: "18",
    currency: "CZK",
    risk: "Střední",
    location: "Praha 2",
    narocnost: "Vysoká",
    is_test: true,
  },
  {
    project_id: "Z-2201-002",
    project_name: "Hotel Mánes — Lobby & Bar",
    klient: "Mánes Hotels s.r.o.",
    pm: "Černá Kateřina",
    konstrukter: "Horák Tomáš",
    status: "Výroba",
    datum_smluvni: "2026-04-30",
    datum_objednavky: "2025-11-20",
    prodejni_cena: 5400000,
    marze: "22",
    currency: "CZK",
    risk: "Nízké",
    location: "Praha 1",
    narocnost: "Střední",
    is_test: true,
  },
  {
    project_id: "Z-2201-003",
    project_name: "Kanceláře Karlín Hub",
    klient: "Karlín Development a.s.",
    pm: "Novák Jan",
    konstrukter: "Svoboda Petr",
    status: "Kalkulace",
    datum_smluvni: "2026-08-01",
    datum_objednavky: "2026-02-15",
    prodejni_cena: 3200000,
    marze: "20",
    currency: "EUR",
    risk: "Nízké",
    location: "Praha 8",
    narocnost: "Nízká",
    is_test: true,
  },
  {
    project_id: "Z-2201-004",
    project_name: "Vila Bubeneč — Komplet interiér",
    klient: "Rodina Vávra",
    pm: "Černá Kateřina",
    konstrukter: "Horák Tomáš",
    status: "Montáž",
    datum_smluvni: "2026-03-20",
    datum_objednavky: "2025-09-05",
    prodejni_cena: 7800000,
    marze: "15",
    currency: "CZK",
    risk: "Vysoké",
    location: "Praha 6",
    narocnost: "Velmi vysoká",
    is_test: true,
  },
  {
    project_id: "Z-2201-005",
    project_name: "Showroom Smíchov City",
    klient: "AMI Interior s.r.o.",
    pm: "Novák Jan",
    konstrukter: "Svoboda Petr",
    status: "Fakturace",
    datum_smluvni: "2026-02-28",
    datum_objednavky: "2025-08-12",
    prodejni_cena: 1950000,
    marze: "25",
    currency: "CZK",
    risk: "Nízké",
    location: "Praha 5",
    narocnost: "Nízká",
    is_test: true,
  },
];

const STAGES = [
  { project_id: "Z-2201-001", stage_name: "-A", display_name: "Kuchyně", status: "Projekce", datum_smluvni: "2026-05-01", stage_order: 1 },
  { project_id: "Z-2201-001", stage_name: "-B", display_name: "Obývací pokoj", status: "Kalkulace", datum_smluvni: "2026-06-01", stage_order: 2 },
  { project_id: "Z-2201-001", stage_name: "-C", display_name: "Ložnice", status: "Projekce", datum_smluvni: "2026-06-15", stage_order: 3 },
  { project_id: "Z-2201-002", stage_name: "-A", display_name: "Lobby", status: "Výroba", datum_smluvni: "2026-03-30", stage_order: 1 },
  { project_id: "Z-2201-002", stage_name: "-B", display_name: "Bar", status: "Projekce", datum_smluvni: "2026-04-30", stage_order: 2 },
  { project_id: "Z-2201-004", stage_name: "-A", display_name: "Přízemí", status: "Montáž", datum_smluvni: "2026-03-10", stage_order: 1 },
  { project_id: "Z-2201-004", stage_name: "-B", display_name: "Patro", status: "Výroba", datum_smluvni: "2026-03-20", stage_order: 2 },
];

const TPV_ITEMS = [
  // Z-2201-001 — Rezidence Vinohrady
  { project_id: "Z-2201-001", item_name: "KU-001", nazev_prvku: "Kuchyňská linka — dub", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 1, cena: 185000 },
  { project_id: "Z-2201-001", item_name: "KU-002", nazev_prvku: "Ostrůvek s deskou Dekton", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 1, cena: 95000 },
  { project_id: "Z-2201-001", item_name: "OB-001", nazev_prvku: "TV stěna — ořech", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 1, cena: 72000 },
  { project_id: "Z-2201-001", item_name: "OB-002", nazev_prvku: "Komoda pod TV", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 1, cena: 48000 },
  { project_id: "Z-2201-001", item_name: "LO-001", nazev_prvku: "Šatní skříň ložnice", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 2, cena: 92000 },
  { project_id: "Z-2201-001", item_name: "LO-002", nazev_prvku: "Noční stolky — pár", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 2, cena: 28000 },
  { project_id: "Z-2201-001", item_name: "KP-001", nazev_prvku: "Koupelnový nábytek", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 1, cena: 115000 },
  { project_id: "Z-2201-001", item_name: "PR-001", nazev_prvku: "Předsíňová stěna", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 1, cena: 68000 },

  // Z-2201-002 — Hotel Mánes
  { project_id: "Z-2201-002", item_name: "LO-001", nazev_prvku: "Recepční pult — mosaz/mramor", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 1, cena: 320000 },
  { project_id: "Z-2201-002", item_name: "LO-002", nazev_prvku: "Obkladový panel lobby", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 12, cena: 28000 },
  { project_id: "Z-2201-002", item_name: "LO-003", nazev_prvku: "Lobby sedací boxy", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 6, cena: 45000 },
  { project_id: "Z-2201-002", item_name: "LO-004", nazev_prvku: "Lobby konferenční stoly", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 4, cena: 35000 },
  { project_id: "Z-2201-002", item_name: "BA-001", nazev_prvku: "Barový pult", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 1, cena: 210000 },
  { project_id: "Z-2201-002", item_name: "BA-002", nazev_prvku: "Policový systém bar", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 1, cena: 145000 },
  { project_id: "Z-2201-002", item_name: "BA-003", nazev_prvku: "Barové židle — kůže", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 12, cena: 18000 },
  { project_id: "Z-2201-002", item_name: "RE-001", nazev_prvku: "Restaurace — jídelní stoly", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 20, cena: 22000 },
  { project_id: "Z-2201-002", item_name: "RE-002", nazev_prvku: "Restaurace — sedací boxy", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 8, cena: 38000 },
  { project_id: "Z-2201-002", item_name: "RE-003", nazev_prvku: "Wine display vitrína", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 2, cena: 85000 },

  // Z-2201-003 — Kanceláře Karlín Hub
  { project_id: "Z-2201-003", item_name: "KA-001", nazev_prvku: "Recepční pult — dýha dub", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 1, cena: 145000 },
  { project_id: "Z-2201-003", item_name: "KA-002", nazev_prvku: "Open-space přepážky", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 8, cena: 32000 },
  { project_id: "Z-2201-003", item_name: "KA-003", nazev_prvku: "Jednací stůl — konferenční", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 2, cena: 68000 },
  { project_id: "Z-2201-003", item_name: "KA-004", nazev_prvku: "Kancelářské stoly — výšk. nastav.", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 24, cena: 18000 },
  { project_id: "Z-2201-003", item_name: "KA-005", nazev_prvku: "Akustické panely stěna", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 16, cena: 12000 },
  { project_id: "Z-2201-003", item_name: "KA-006", nazev_prvku: "Meetingroom skříňky", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 4, cena: 42000 },
  { project_id: "Z-2201-003", item_name: "KA-007", nazev_prvku: "Kuchyňka kancelář", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 1, cena: 165000 },
  { project_id: "Z-2201-003", item_name: "KA-008", nazev_prvku: "Phone booth kabiny", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 6, cena: 55000 },

  // Z-2201-004 — Vila Bubeneč
  { project_id: "Z-2201-004", item_name: "PR-001", nazev_prvku: "Vestavěná skříň hala", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 2, cena: 98000 },
  { project_id: "Z-2201-004", item_name: "PR-002", nazev_prvku: "Knihovna obývák", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 1, cena: 165000 },
  { project_id: "Z-2201-004", item_name: "PA-001", nazev_prvku: "Šatní systém ložnice", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 1, cena: 112000 },
  { project_id: "Z-2201-004", item_name: "PA-002", nazev_prvku: "Dětský pokoj — sestava", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 2, cena: 78000 },
  { project_id: "Z-2201-004", item_name: "KU-001", nazev_prvku: "Kuchyně vila — masiv", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 1, cena: 420000 },
  { project_id: "Z-2201-004", item_name: "KU-002", nazev_prvku: "Spižní skříň", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 1, cena: 65000 },
  { project_id: "Z-2201-004", item_name: "OB-001", nazev_prvku: "Obývák — mediální stěna", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 1, cena: 195000 },
  { project_id: "Z-2201-004", item_name: "OB-002", nazev_prvku: "Krbová stěna — obklad", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 1, cena: 145000 },
  { project_id: "Z-2201-004", item_name: "TE-001", nazev_prvku: "Terasa — pergola dřevo", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 1, cena: 280000 },
  { project_id: "Z-2201-004", item_name: "KP-001", nazev_prvku: "Koupelna master — nábytek", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 1, cena: 185000 },
  { project_id: "Z-2201-004", item_name: "KP-002", nazev_prvku: "Koupelna host — nábytek", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 1, cena: 95000 },
  { project_id: "Z-2201-004", item_name: "SC-001", nazev_prvku: "Schodiště — dub/ocel", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 1, cena: 350000 },

  // Z-2201-005 — Showroom Smíchov City
  { project_id: "Z-2201-005", item_name: "SH-001", nazev_prvku: "Výstavní stěna A", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 3, cena: 55000 },
  { project_id: "Z-2201-005", item_name: "SH-002", nazev_prvku: "Pódium showroom", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 1, cena: 78000 },
  { project_id: "Z-2201-005", item_name: "SH-003", nazev_prvku: "Výstavní stěna B — otočná", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 2, cena: 72000 },
  { project_id: "Z-2201-005", item_name: "SH-004", nazev_prvku: "Prezentační vitríny", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 8, cena: 35000 },
  { project_id: "Z-2201-005", item_name: "SH-005", nazev_prvku: "Material library regál", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 1, cena: 125000 },
  { project_id: "Z-2201-005", item_name: "SH-006", nazev_prvku: "Zákaznický lounge", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 1, cena: 195000 },
  { project_id: "Z-2201-005", item_name: "SH-007", nazev_prvku: "Recepce showroom", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 1, cena: 165000 },
];

// Total target: ~2500h across all projects
const PRODUCTION_INBOX = [
  // Z-2201-001 — Rezidence Vinohrady (~480h)
  { project_id: "Z-2201-001", item_name: "Kuchyňská linka — dub", item_code: "KU-001", estimated_hours: 96, estimated_czk: 185000 },
  { project_id: "Z-2201-001", item_name: "Ostrůvek s deskou Dekton", item_code: "KU-002", estimated_hours: 64, estimated_czk: 95000 },
  { project_id: "Z-2201-001", item_name: "TV stěna — ořech", item_code: "OB-001", estimated_hours: 48, estimated_czk: 72000 },
  { project_id: "Z-2201-001", item_name: "Komoda pod TV", item_code: "OB-002", estimated_hours: 32, estimated_czk: 48000 },
  { project_id: "Z-2201-001", item_name: "Šatní skříň ložnice", item_code: "LO-001", estimated_hours: 80, estimated_czk: 184000 },
  { project_id: "Z-2201-001", item_name: "Noční stolky — pár", item_code: "LO-002", estimated_hours: 24, estimated_czk: 56000 },
  { project_id: "Z-2201-001", item_name: "Koupelnový nábytek", item_code: "KP-001", estimated_hours: 72, estimated_czk: 115000 },
  { project_id: "Z-2201-001", item_name: "Předsíňová stěna", item_code: "PR-001", estimated_hours: 64, estimated_czk: 68000 },

  // Z-2201-002 — Hotel Mánes (~680h)
  { project_id: "Z-2201-002", item_name: "Recepční pult — mosaz/mramor", item_code: "LO-001", estimated_hours: 120, estimated_czk: 320000 },
  { project_id: "Z-2201-002", item_name: "Obkladový panel lobby", item_code: "LO-002", estimated_hours: 96, estimated_czk: 336000 },
  { project_id: "Z-2201-002", item_name: "Lobby sedací boxy", item_code: "LO-003", estimated_hours: 72, estimated_czk: 270000 },
  { project_id: "Z-2201-002", item_name: "Lobby konferenční stoly", item_code: "LO-004", estimated_hours: 48, estimated_czk: 140000 },
  { project_id: "Z-2201-002", item_name: "Barový pult", item_code: "BA-001", estimated_hours: 88, estimated_czk: 210000 },
  { project_id: "Z-2201-002", item_name: "Policový systém bar", item_code: "BA-002", estimated_hours: 56, estimated_czk: 145000 },
  { project_id: "Z-2201-002", item_name: "Barové židle — kůže", item_code: "BA-003", estimated_hours: 48, estimated_czk: 216000 },
  { project_id: "Z-2201-002", item_name: "Restaurace — jídelní stoly", item_code: "RE-001", estimated_hours: 80, estimated_czk: 440000 },
  { project_id: "Z-2201-002", item_name: "Restaurace — sedací boxy", item_code: "RE-002", estimated_hours: 40, estimated_czk: 304000 },
  { project_id: "Z-2201-002", item_name: "Wine display vitrína", item_code: "RE-003", estimated_hours: 32, estimated_czk: 170000 },

  // Z-2201-003 — Kanceláře Karlín Hub (~520h)
  { project_id: "Z-2201-003", item_name: "Recepční pult — dýha dub", item_code: "KA-001", estimated_hours: 64, estimated_czk: 145000 },
  { project_id: "Z-2201-003", item_name: "Open-space přepážky", item_code: "KA-002", estimated_hours: 96, estimated_czk: 256000 },
  { project_id: "Z-2201-003", item_name: "Jednací stůl — konferenční", item_code: "KA-003", estimated_hours: 48, estimated_czk: 136000 },
  { project_id: "Z-2201-003", item_name: "Kancelářské stoly — výšk. nastav.", item_code: "KA-004", estimated_hours: 96, estimated_czk: 432000 },
  { project_id: "Z-2201-003", item_name: "Akustické panely stěna", item_code: "KA-005", estimated_hours: 64, estimated_czk: 192000 },
  { project_id: "Z-2201-003", item_name: "Meetingroom skříňky", item_code: "KA-006", estimated_hours: 40, estimated_czk: 168000 },
  { project_id: "Z-2201-003", item_name: "Kuchyňka kancelář", item_code: "KA-007", estimated_hours: 72, estimated_czk: 165000 },
  { project_id: "Z-2201-003", item_name: "Phone booth kabiny", item_code: "KA-008", estimated_hours: 40, estimated_czk: 330000 },

  // Z-2201-004 — Vila Bubeneč (~580h)
  { project_id: "Z-2201-004", item_name: "Vestavěná skříň hala", item_code: "PR-001", estimated_hours: 56, estimated_czk: 196000 },
  { project_id: "Z-2201-004", item_name: "Knihovna obývák", item_code: "PR-002", estimated_hours: 48, estimated_czk: 165000 },
  { project_id: "Z-2201-004", item_name: "Šatní systém ložnice", item_code: "PA-001", estimated_hours: 40, estimated_czk: 112000 },
  { project_id: "Z-2201-004", item_name: "Dětský pokoj — sestava", item_code: "PA-002", estimated_hours: 56, estimated_czk: 156000 },
  { project_id: "Z-2201-004", item_name: "Kuchyně vila — masiv", item_code: "KU-001", estimated_hours: 120, estimated_czk: 420000 },
  { project_id: "Z-2201-004", item_name: "Spižní skříň", item_code: "KU-002", estimated_hours: 24, estimated_czk: 65000 },
  { project_id: "Z-2201-004", item_name: "Obývák — mediální stěna", item_code: "OB-001", estimated_hours: 56, estimated_czk: 195000 },
  { project_id: "Z-2201-004", item_name: "Krbová stěna — obklad", item_code: "OB-002", estimated_hours: 40, estimated_czk: 145000 },
  { project_id: "Z-2201-004", item_name: "Terasa — pergola dřevo", item_code: "TE-001", estimated_hours: 64, estimated_czk: 280000 },
  { project_id: "Z-2201-004", item_name: "Koupelna master — nábytek", item_code: "KP-001", estimated_hours: 48, estimated_czk: 185000 },
  { project_id: "Z-2201-004", item_name: "Koupelna host — nábytek", item_code: "KP-002", estimated_hours: 32, estimated_czk: 95000 },
  { project_id: "Z-2201-004", item_name: "Schodiště — dub/ocel", item_code: "SC-001", estimated_hours: 96, estimated_czk: 350000 },

  // Z-2201-005 — Showroom Smíchov (~280h)
  { project_id: "Z-2201-005", item_name: "Výstavní stěna A", item_code: "SH-001", estimated_hours: 48, estimated_czk: 165000 },
  { project_id: "Z-2201-005", item_name: "Pódium showroom", item_code: "SH-002", estimated_hours: 32, estimated_czk: 78000 },
  { project_id: "Z-2201-005", item_name: "Výstavní stěna B — otočná", item_code: "SH-003", estimated_hours: 40, estimated_czk: 144000 },
  { project_id: "Z-2201-005", item_name: "Prezentační vitríny", item_code: "SH-004", estimated_hours: 56, estimated_czk: 280000 },
  { project_id: "Z-2201-005", item_name: "Material library regál", item_code: "SH-005", estimated_hours: 32, estimated_czk: 125000 },
  { project_id: "Z-2201-005", item_name: "Zákaznický lounge", item_code: "SH-006", estimated_hours: 40, estimated_czk: 195000 },
  { project_id: "Z-2201-005", item_name: "Recepce showroom", item_code: "SH-007", estimated_hours: 32, estimated_czk: 165000 },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const steps: string[] = [];

    // Safety check: verify no production projects use Z-2201-XXX prefix
    const { data: conflictCheck } = await adminClient
      .from("projects")
      .select("project_id")
      .like("project_id", "Z-2201-%")
      .eq("is_test", false);

    if (conflictCheck && conflictCheck.length > 0) {
      return new Response(JSON.stringify({
        error: "SAFETY ABORT: Production projects found with Z-2201- prefix. Aborting to protect data.",
        conflicting_ids: conflictCheck.map((p: any) => p.project_id),
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Create or find test user
    let testUserId: string;
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u: any) => u.email === TEST_EMAIL);

    if (existing) {
      testUserId = existing.id;
      steps.push(`User ${TEST_EMAIL} already exists (${testUserId})`);
    } else {
      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: TEST_FULL_NAME },
      });
      if (createErr) throw new Error(`Create user failed: ${createErr.message}`);
      testUserId = newUser.user.id;
      steps.push(`Created user ${TEST_EMAIL} (${testUserId})`);
    }

    // 2. Ensure profile
    await adminClient.from("profiles").upsert({
      id: testUserId,
      email: TEST_EMAIL,
      full_name: TEST_FULL_NAME,
      is_active: true,
      password_set: true,
    }, { onConflict: "id" });
    steps.push("Profile upserted");

    // 3. Ensure admin role
    const { data: existingRole } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("user_id", testUserId)
      .single();

    if (existingRole) {
      await adminClient.from("user_roles").update({ role: "admin" }).eq("user_id", testUserId);
      steps.push("Role updated to admin");
    } else {
      await adminClient.from("user_roles").insert({ user_id: testUserId, role: "admin" });
      steps.push("Role assigned: admin");
    }

    // 4. Seed projects (skip existing)
    for (const p of PROJECTS) {
      const { data: exists } = await adminClient
        .from("projects")
        .select("project_id")
        .eq("project_id", p.project_id)
        .single();

      if (!exists) {
        await adminClient.from("projects").insert(p);
        steps.push(`Project ${p.project_id} created`);
      } else {
        steps.push(`Project ${p.project_id} already exists, skipped`);
      }
    }

    // 5. Seed stages
    for (const s of STAGES) {
      const { data: exists } = await adminClient
        .from("project_stages")
        .select("id")
        .eq("project_id", s.project_id)
        .eq("stage_name", s.stage_name)
        .single();

      if (!exists) {
        await adminClient.from("project_stages").insert(s);
        steps.push(`Stage ${s.project_id}${s.stage_name} created`);
      } else {
        steps.push(`Stage ${s.project_id}${s.stage_name} exists, skipped`);
      }
    }

    // 6. Seed TPV items
    for (const t of TPV_ITEMS) {
      const { data: exists } = await adminClient
        .from("tpv_items")
        .select("id")
        .eq("project_id", t.project_id)
        .eq("item_name", t.item_name)
        .single();

      if (!exists) {
        await adminClient.from("tpv_items").insert(t);
        steps.push(`TPV ${t.item_name} created`);
      } else {
        steps.push(`TPV ${t.item_name} exists, skipped`);
      }
    }

    // 7. Seed production inbox
    for (const pi of PRODUCTION_INBOX) {
      const { data: exists } = await adminClient
        .from("production_inbox")
        .select("id")
        .eq("project_id", pi.project_id)
        .eq("item_code", pi.item_code)
        .single();

      if (!exists) {
        await adminClient.from("production_inbox").insert({
          ...pi,
          sent_by: testUserId,
          status: "pending",
        });
        steps.push(`Inbox ${pi.item_code} created`);
      } else {
        steps.push(`Inbox ${pi.item_code} exists, skipped`);
      }
    }

    return new Response(JSON.stringify({ success: true, steps }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Seed error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
