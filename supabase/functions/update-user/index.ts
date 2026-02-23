import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    
    // Check caller role - allow owner or admin
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    const callerRoleValue = callerRole?.role;
    if (callerRoleValue !== "admin" && callerRoleValue !== "owner") {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { user_id, full_name, role, is_active, password, transfer_ownership_to } = body;

    // Handle ownership transfer
    if (transfer_ownership_to) {
      if (callerRoleValue !== "owner") {
        return new Response(JSON.stringify({ error: "Only the Owner can transfer ownership" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Set new owner
      await adminClient.from("user_roles").delete().eq("user_id", transfer_ownership_to);
      await adminClient.from("user_roles").insert({ user_id: transfer_ownership_to, role: "owner" });

      // Demote current owner to admin
      await adminClient.from("user_roles").delete().eq("user_id", caller.id);
      await adminClient.from("user_roles").insert({ user_id: caller.id, role: "admin" });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!user_id) {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent changing the owner's role via normal role update
    if (role !== undefined) {
      const { data: targetRole } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user_id)
        .single();
      if (targetRole?.role === "owner") {
        return new Response(JSON.stringify({ error: "Cannot change Owner role. Use Transfer Ownership instead." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update password if provided
    if (password !== undefined) {
      const { error: pwError } = await adminClient.auth.admin.updateUserById(user_id, { password });
      if (pwError) {
        return new Response(JSON.stringify({ error: pwError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Update profile
    if (full_name !== undefined || is_active !== undefined) {
      const updateData: Record<string, any> = {};
      if (full_name !== undefined) updateData.full_name = full_name;
      if (is_active !== undefined) updateData.is_active = is_active;
      
      await adminClient.from("profiles").update(updateData).eq("id", user_id);
    }

    // Update role if provided
    if (role !== undefined) {
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("user_roles").insert({ user_id, role });
    }

    // If deactivating, ban the user
    if (is_active === false) {
      await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "876600h" });
    } else if (is_active === true) {
      await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "none" });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
