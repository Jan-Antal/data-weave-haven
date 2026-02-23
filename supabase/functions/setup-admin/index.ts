import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require a setup token for protection
    const setupToken = req.headers.get("X-Setup-Token");
    const expectedToken = Deno.env.get("SETUP_ADMIN_SECRET");
    if (!expectedToken || setupToken !== expectedToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check if any admin/owner exists
    const { data: existingAdmins } = await adminClient
      .from("user_roles")
      .select("id")
      .in("role", ["admin", "owner"])
      .limit(1);

    if (existingAdmins && existingAdmins.length > 0) {
      return new Response(JSON.stringify({ error: "Admin already exists. Use create-user instead." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, full_name } = await req.json();

    // Validate inputs
    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: "Missing required fields: email, password, full_name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof email !== "string" || !EMAIL_REGEX.test(email) || email.length > 255) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (typeof password !== "string" || password.length < 8 || password.length > 72) {
      return new Response(JSON.stringify({ error: "Password must be between 8 and 72 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trimmedName = String(full_name).trim();
    if (trimmedName.length < 1 || trimmedName.length > 100) {
      return new Response(JSON.stringify({ error: "Full name must be between 1 and 100 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: trimmedName },
    });

    if (createError) {
      console.error("Setup admin creation failed:", createError);
      return new Response(JSON.stringify({ error: "Unable to create admin user" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Assign admin role
    await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role: "admin" });

    return new Response(JSON.stringify({ success: true, user: newUser.user }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Setup admin error:", error);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
