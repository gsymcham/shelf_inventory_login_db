
import { createClient } from "npm:@supabase/supabase-js@2";

const cloverCors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  const key = legacyKey || (secretKeys ? JSON.parse(secretKeys).default : null);
  if (!url || !key) throw new Error("Missing Supabase server credentials.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function cloverEnvironment() {
  return (Deno.env.get("CLOVER_ENVIRONMENT") || "sandbox").toLowerCase();
}

function cloverApiBase() {
  return cloverEnvironment() === "production"
    ? "https://api.clover.com"
    : "https://apisandbox.dev.clover.com";
}

function keyBytes() {
  const encoded = Deno.env.get("CLOVER_TOKEN_ENCRYPTION_KEY");
  if (!encoded) throw new Error("Missing CLOVER_TOKEN_ENCRYPTION_KEY.");
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  if (bytes.length !== 32) {
    throw new Error("CLOVER_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return bytes;
}

async function decryptSecret(ciphertext: string, ivValue: string) {
  const key = await crypto.subtle.importKey("raw", keyBytes(), "AES-GCM", false, ["decrypt"]);
  const iv = Uint8Array.from(atob(ivValue), c => c.charCodeAt(0));
  const encrypted = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  return new TextDecoder().decode(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted),
  );
}

function elementsOf(value: any): any[] {
  return Array.isArray(value) ? value : (Array.isArray(value?.elements) ? value.elements : []);
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth) throw new Error("Authentication required.");

  const anon =
    Deno.env.get("SUPABASE_ANON_KEY") ||
    JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}").default;

  if (!anon) throw new Error("Missing Supabase anon/publishable key.");

  const client = createClient(Deno.env.get("SUPABASE_URL")!, anon, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("Authentication required.");

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") throw new Error("Admin access required.");

  return { admin, user };
}

async function latestCloverConnection(admin: any) {
  const { data, error } = await admin
    .from("clover_connections")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Clover not connected.");
  return data;
}

async function cloverFetch(token: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${cloverApiBase()}${path}`, { ...init, headers });
  const text = await response.text();

  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = text;
  }

  if (!response.ok) {
    const detail = typeof body === "string"
      ? body
      : (body?.message || body?.error || "request failed");
    throw new Error(`Clover API ${response.status}: ${detail}`);
  }

  return body;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cloverCors });

  try {
    const { admin } = await requireAdmin(req);
    const body = await req.json();

    const barcode = String(body?.barcode || "").trim();
    const quantity = Math.max(
      1,
      Math.min(25, Math.floor(Number(body?.quantity || 1))),
    );

    if (!barcode) throw new Error("Barcode is required.");

    const connection = await latestCloverConnection(admin);
    if (cloverEnvironment() !== "sandbox" || connection.environment !== "sandbox") {
      throw new Error("This V12.2 function is sandbox-only.");
    }

    if (
      connection.environment !== "sandbox" ||
      cloverEnvironment() !== "sandbox"
    ) {
      throw new Error("Sandbox test sale is disabled outside sandbox.");
    }

    const token = Deno.env.get("CLOVER_SANDBOX_API_TOKEN");
    if (!token) throw new Error("Missing CLOVER_SANDBOX_API_TOKEN.");

    let item: any = null;

    for (let offset = 0; offset < 10000 && !item; offset += 100) {
      const result = await cloverFetch(
        token,
        `/v3/merchants/${encodeURIComponent(connection.merchant_id)}/items?limit=100&offset=${offset}`,
      );

      const items = elementsOf(result);

      item = items.find(
        (candidate: any) =>
          String(candidate?.code || "").trim() === barcode,
      );

      if (items.length < 100) break;
    }

    if (!item) {
      throw new Error(`No Clover sandbox item found for Product Code ${barcode}.`);
    }

    const order = await cloverFetch(
      token,
      `/v3/merchants/${encodeURIComponent(connection.merchant_id)}/orders`,
      {
        method: "POST",
        body: JSON.stringify({
          state: "open",
          testMode: true,
          title: "TC's Liquor Sandbox Test Sale",
        }),
      },
    );

    let total = 0;

    for (let i = 0; i < quantity; i++) {
      const line = await cloverFetch(
        token,
        `/v3/merchants/${encodeURIComponent(connection.merchant_id)}/orders/${encodeURIComponent(order.id)}/line_items`,
        {
          method: "POST",
          body: JSON.stringify({ item: { id: item.id } }),
        },
      );

      total += Number(line?.price || item?.price || 0);
    }

    const tenders = elementsOf(
      await cloverFetch(
        token,
        `/v3/merchants/${encodeURIComponent(connection.merchant_id)}/tenders`,
      ),
    );

    const tender =
      tenders.find((candidate: any) =>
        /cash/i.test(String(candidate?.label || candidate?.name || ""))
      ) || tenders[0];

    if (!tender?.id) throw new Error("No sandbox tender found.");

    const payment = await cloverFetch(
      token,
      `/v3/merchants/${encodeURIComponent(connection.merchant_id)}/orders/${encodeURIComponent(order.id)}/payments`,
      {
        method: "POST",
        body: JSON.stringify({
          amount: total,
          tender: { id: tender.id },
        }),
      },
    );

    return Response.json({
      ok: true,
      sale: {
        order_id: order.id,
        payment_id: payment?.id || null,
        product_name: item?.name || barcode,
        barcode,
        quantity,
        total: total / 100,
      },
    }, { headers: cloverCors });
  } catch (error) {
    console.error("clover-test-sale", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500, headers: cloverCors },
    );
  }
});
