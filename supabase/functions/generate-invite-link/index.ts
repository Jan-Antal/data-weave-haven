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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, anonKey, {
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
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (!roleData || (roleData.role !== "admin" && roleData.role !== "owner")) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, origin_url } = await req.json();
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user email
    const { data: profile } = await adminClient
      .from("profiles")
      .select("email")
      .eq("id", user_id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use dynamic redirect URL from the calling app
    const redirectTo = origin_url
      ? `${String(origin_url).replace(/\/$/, "")}/accept-invite`
      : `${req.headers.get("origin") || "https://projekty.am-interior.cz"}/accept-invite`;

    // Try invite first, fall back to recovery for already-registered users
    let actionLink: string | undefined;

    const { data: inviteLinkData, error: inviteLinkError } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email: profile.email,
      options: { redirectTo },
    });

    if (inviteLinkError) {
      // If user already exists, use recovery link instead (works the same for password setup)
      if (inviteLinkError.message?.includes("already been registered") || (inviteLinkError as any).code === "email_exists") {
        console.log("User already registered, generating recovery link instead");
        const { data: recoveryData, error: recoveryError } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: profile.email,
          options: { redirectTo },
        });

        if (recoveryError) {
          console.error("Recovery link error:", recoveryError);
          return new Response(JSON.stringify({ error: recoveryError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        actionLink = recoveryData?.properties?.action_link;
      } else {
        console.error("Generate link error:", inviteLinkError);
        return new Response(JSON.stringify({ error: inviteLinkError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      actionLink = inviteLinkData?.properties?.action_link;
    }

    if (!actionLink) {
      return new Response(JSON.stringify({ error: "Failed to generate link" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ link: actionLink }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Generate invite link error:", error);
    return new Response(JSON.stringify({ error: "An unexpected error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
