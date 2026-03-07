import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEST_EMAIL = "alfred@ami-test.cz";
const TEST_PASSWORD = "Alfred2026!";
const TEST_FULL_NAME = "Alfred Test (AMI)";

const PROJECTS = [
  {
    project_id: "Z-2601-001",
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
  },
  {
    project_id: "Z-2601-002",
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
  },
  {
    project_id: "Z-2601-003",
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
  },
  {
    project_id: "Z-2601-004",
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
  },
  {
    project_id: "Z-2601-005",
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
  },
];

const STAGES = [
  // Project 001 - 3 stages
  { project_id: "Z-2601-001", stage_name: "-A", display_name: "Kuchyně", status: "Projekce", datum_smluvni: "2026-05-01", stage_order: 1 },
  { project_id: "Z-2601-001", stage_name: "-B", display_name: "Obývací pokoj", status: "Kalkulace", datum_smluvni: "2026-06-01", stage_order: 2 },
  { project_id: "Z-2601-001", stage_name: "-C", display_name: "Ložnice", status: "Projekce", datum_smluvni: "2026-06-15", stage_order: 3 },
  // Project 002 - 2 stages
  { project_id: "Z-2601-002", stage_name: "-A", display_name: "Lobby", status: "Výroba", datum_smluvni: "2026-03-30", stage_order: 1 },
  { project_id: "Z-2601-002", stage_name: "-B", display_name: "Bar", status: "Projekce", datum_smluvni: "2026-04-30", stage_order: 2 },
  // Project 004 - 2 stages
  { project_id: "Z-2601-004", stage_name: "-A", display_name: "Přízemí", status: "Montáž", datum_smluvni: "2026-03-10", stage_order: 1 },
  { project_id: "Z-2601-004", stage_name: "-B", display_name: "Patro", status: "Výroba", datum_smluvni: "2026-03-20", stage_order: 2 },
];

const TPV_ITEMS = [
  // Project 001
  { project_id: "Z-2601-001", item_name: "KU-001", nazev_prvku: "Kuchyňská linka — dub", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 1, cena: 185000 },
  { project_id: "Z-2601-001", item_name: "KU-002", nazev_prvku: "Ostrůvek s deskou Dekton", status: "Připomínky k zapracování", konstrukter: "Svoboda Petr", pocet: 1, cena: 95000 },
  { project_id: "Z-2601-001", item_name: "OB-001", nazev_prvku: "TV stěna — ořech", status: "Nový", konstrukter: "Svoboda Petr", pocet: 1, cena: 72000 },
  // Project 002
  { project_id: "Z-2601-002", item_name: "LO-001", nazev_prvku: "Recepční pult — mosaz/mramor", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 1, cena: 320000 },
  { project_id: "Z-2601-002", item_name: "LO-002", nazev_prvku: "Obkladový panel lobby", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 12, cena: 28000 },
  { project_id: "Z-2601-002", item_name: "BA-001", nazev_prvku: "Barový pult", status: "V řešení", konstrukter: "Horák Tomáš", pocet: 1, cena: 210000 },
  { project_id: "Z-2601-002", item_name: "BA-002", nazev_prvku: "Policový systém bar", status: "Nový", konstrukter: "Horák Tomáš", pocet: 1, cena: 145000 },
  // Project 004
  { project_id: "Z-2601-004", item_name: "PR-001", nazev_prvku: "Vestavěná skříň hala", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 2, cena: 98000 },
  { project_id: "Z-2601-004", item_name: "PR-002", nazev_prvku: "Knihovna obývák", status: "Schváleno", konstrukter: "Horák Tomáš", pocet: 1, cena: 165000 },
  { project_id: "Z-2601-004", item_name: "PA-001", nazev_prvku: "Šatní systém ložnice", status: "Připomínky k zapracování", konstrukter: "Horák Tomáš", pocet: 1, cena: 112000 },
  // Project 005
  { project_id: "Z-2601-005", item_name: "SH-001", nazev_prvku: "Výstavní stěna A", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 3, cena: 55000 },
  { project_id: "Z-2601-005", item_name: "SH-002", nazev_prvku: "Pódium showroom", status: "Schváleno", konstrukter: "Svoboda Petr", pocet: 1, cena: 78000 },
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

    // 1. Create test user
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
        await adminClient.from("projects").insert({ ...p, is_test: true });
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
