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
  const authHeader = req.headers.get("authorization");
  if (!authHeader) throw new Error("Authentication required.");

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon =
    Deno.env.get("SUPABASE_ANON_KEY") ||
    JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default;

  if (!anon) throw new Error("Missing Supabase publishable key.");

  const client = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("Authentication required.");

  const admin = serviceClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (profile?.role !== "admin" || profile?.is_active === false) {
    throw new Error("Admin access required.");
  }

  return { admin, currentUser: user };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { admin, currentUser } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body?.user_id || "").trim();

    if (!targetUserId) throw new Error("User ID is required.");
    if (targetUserId === currentUser.id) {
      throw new Error("You cannot delete your own account.");
    }

    const { data: targetProfile, error: targetProfileError } = await admin
      .from("profiles")
      .select("id,email,role,is_active")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetProfileError) throw targetProfileError;
    if (!targetProfile) throw new Error("User profile not found.");

    if (targetProfile.role === "admin") {
      const { count: adminCount, error: countError } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true);

      if (countError) throw countError;
      if ((adminCount || 0) <= 1) {
        throw new Error("The last active Admin cannot be deleted.");
      }
    }

    const email = String(targetProfile.email || "").trim().toLowerCase();

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(targetUserId);
    if (authDeleteError) throw authDeleteError;

    // Defensive cleanup in case your schema does not cascade profile deletion.
    await admin.from("profiles").delete().eq("id", targetUserId);

    // Clear any old access request so this email can request access again.
    if (email) {
      await admin.from("account_requests").delete().ilike("email", email);
    }

    return Response.json(
      { ok: true, deleted_user_id: targetUserId, email },
      { headers: cors },
    );
  } catch (error) {
    console.error("admin-delete-user", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 400, headers: cors },
    );
  }
});
