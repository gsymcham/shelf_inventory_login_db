import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const service =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default;

  if (!url || !service) throw new Error("Missing Supabase server credentials.");
  return createClient(url, service, { auth: { persistSession: false } });
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth) throw new Error("Authentication required.");

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon =
    Deno.env.get("SUPABASE_ANON_KEY") ||
    JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default;

  if (!anon) throw new Error("Missing Supabase publishable key.");

  const client = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("Authentication required.");

  const admin = serviceClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin" || profile?.is_active === false) {
    throw new Error("Admin access required.");
  }

  return { admin, user };
}

function safeRedirect(requested: string | null) {
  const fallback = Deno.env.get("SHELF2_RETURN_URL") || "";
  const candidate = requested || fallback;
  if (!candidate) throw new Error("Missing invitation return URL.");

  const url = new URL(candidate);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";

  let configured = false;
  if (fallback) {
    try {
      const allowed = new URL(fallback);
      configured = url.origin === allowed.origin;
    } catch {}
  }

  if (!local && !configured) {
    throw new Error("Invitation return URL is not allowed.");
  }

  return url.toString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { admin, user } = await requireAdmin(req);
    const body = await req.json();
    const requestId = String(body?.request_id || "");
    const redirectTo = safeRedirect(body?.redirect_to || null);

    if (!requestId) throw new Error("Request ID is required.");

    const { data: request, error: requestError } = await admin
      .from("account_requests")
      .select("*")
      .eq("id", requestId)
      .eq("status", "pending")
      .maybeSingle();

    if (requestError) throw requestError;
    if (!request) throw new Error("Pending access request not found.");

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      request.email,
      {
        redirectTo,
        data: {
          full_name: request.full_name,
          name: request.full_name,
          access_request_id: request.id,
          must_set_password: true,
        },
      },
    );

    if (inviteError) throw inviteError;
    if (!invited?.user?.id) throw new Error("Supabase did not return the invited user.");

    // Ensure the invited account starts as Staff without changing existing elevated users.
    await admin.from("profiles").upsert({
      id: invited.user.id,
      email: request.email,
      role: "staff",
      is_active: true,
    }, { onConflict: "id", ignoreDuplicates: true });

    const { error: updateError } = await admin
      .from("account_requests")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        invited_user_id: invited.user.id,
      })
      .eq("id", request.id);

    if (updateError) throw updateError;

    return Response.json({
      ok: true,
      email: request.email,
      user_id: invited.user.id,
    }, { headers: cors });
  } catch (error) {
    console.error("admin-invite-user", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 400, headers: cors },
    );
  }
});
