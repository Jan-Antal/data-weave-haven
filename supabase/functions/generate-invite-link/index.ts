import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRODUCTION_ORIGIN = "https://projekty.am-interior.cz";
type InviteMode = "link" | "send_email";

const isAlreadyRegisteredError = (message?: string, code?: string) =>
  Boolean(message?.includes("already been registered") || code === "email_exists");

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
    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
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

    const payload = await req.json();
    const user_id: string | undefined = payload?.user_id;
    const origin_url: string | undefined = payload?.origin_url;
    const mode: InviteMode = payload?.mode === "send_email" ? "send_email" : "link";

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user email
    const { data: profile } = await adminClient
      .from("profiles")
      .select("email, full_name")
      .eq("id", user_id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const redirectTo = `${PRODUCTION_ORIGIN}/auth/callback`;

    if (mode === "send_email") {
      const { data: authUserData, error: authUserError } = await adminClient.auth.admin.getUserById(user_id);
      if (authUserError || !authUserData?.user) {
        return new Response(JSON.stringify({ error: authUserError?.message || "User not found in auth" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const isConfirmed = Boolean(authUserData.user.email_confirmed_at);

      if (isConfirmed) {
        const { error: resetError } = await adminClient.auth.resetPasswordForEmail(profile.email, {
          redirectTo,
        });

        if (resetError) {
          return new Response(JSON.stringify({ error: resetError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ mode: "password_reset", email: profile.email }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(profile.email, {
        redirectTo,
        data: { full_name: profile.full_name ?? "" },
      });

      if (inviteError) {
        const inviteErrorCode = (inviteError as { code?: string }).code;
        if (isAlreadyRegisteredError(inviteError.message, inviteErrorCode)) {
          const { error: resetError } = await adminClient.auth.resetPasswordForEmail(profile.email, {
            redirectTo,
          });
          if (resetError) {
            return new Response(JSON.stringify({ error: resetError.message }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ mode: "password_reset", email: profile.email }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ error: inviteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ mode: "invite", email: profile.email }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a direct action link for manual copy/share
    let actionLink: string | undefined;

    const { data: inviteLinkData, error: inviteLinkError } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email: profile.email,
      options: { redirectTo },
    });

    if (inviteLinkError) {
      const inviteErrorCode = (inviteLinkError as { code?: string }).code;
      if (isAlreadyRegisteredError(inviteLinkError.message, inviteErrorCode)) {
        const { data: recoveryData, error: recoveryError } = await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: profile.email,
          options: { redirectTo },
        });

        if (recoveryError) {
          return new Response(JSON.stringify({ error: recoveryError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        actionLink = recoveryData?.properties?.action_link;
      } else {
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
