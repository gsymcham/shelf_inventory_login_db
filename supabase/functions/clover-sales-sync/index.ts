
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
    const body = await req.json().catch(() => ({}));
    const connection = await latestCloverConnection(admin);
    if (cloverEnvironment() !== "sandbox" || connection.environment !== "sandbox") {
      throw new Error("This V12.2 function is sandbox-only.");
    }

    if (body.action === "status") {
      const { count: processed } = await admin
        .from("clover_sale_lines")
        .select("line_item_id", { count: "exact", head: true })
        .eq("merchant_id", connection.merchant_id)
        .eq("status", "processed");

      const { count: unmatched } = await admin
        .from("clover_sale_lines")
        .select("line_item_id", { count: "exact", head: true })
        .eq("merchant_id", connection.merchant_id)
        .eq("status", "unmatched");

      const { data: run } = await admin
        .from("clover_sync_runs")
        .select("*")
        .eq("merchant_id", connection.merchant_id)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return Response.json({
        ok: true,
        status: {
          last_sync_at: run?.finished_at || null,
          processed: processed || 0,
          unmatched: unmatched || 0,
          duplicates: run?.duplicates || 0,
        },
      }, { headers: cloverCors });
    }

    const token = Deno.env.get("CLOVER_SANDBOX_API_TOKEN");
    if (!token) throw new Error("Missing CLOVER_SANDBOX_API_TOKEN.");

    const since = Date.now() - 86400000;
    let processed = 0;
    let duplicates = 0;
    let unmatched = 0;
    let ordersScanned = 0;

    const orders = elementsOf(
      await cloverFetch(
        token,
        `/v3/merchants/${encodeURIComponent(connection.merchant_id)}/orders?filter=createdTime>=${since}&limit=100&expand=lineItems,payments`,
      ),
    );

    ordersScanned = orders.length;

    for (const order of orders) {
      const hasPayment = elementsOf(order.payments).some(
        (payment: any) => Number(payment.amount || 0) > 0,
      );
      if (!hasPayment) continue;

      for (const line of elementsOf(order.lineItems)) {
        if (!line?.id) continue;

        const { data: existing } = await admin
          .from("clover_sale_lines")
          .select("line_item_id")
          .eq("merchant_id", connection.merchant_id)
          .eq("order_id", order.id)
          .eq("line_item_id", line.id)
          .maybeSingle();

        if (existing) {
          duplicates++;
          continue;
        }

        const cloverItemId = line?.item?.id;
        if (!cloverItemId) {
          unmatched++;
          continue;
        }

        const item = await cloverFetch(
          token,
          `/v3/merchants/${encodeURIComponent(connection.merchant_id)}/items/${encodeURIComponent(cloverItemId)}`,
        );

        const barcode = String(item?.code || "").trim();

        const { data: inventoryItem } = await admin
          .from("inventory")
          .select("*")
          .eq("barcode", barcode)
          .maybeSingle();

        if (!inventoryItem) {
          unmatched++;

          await admin.from("clover_sale_lines").insert({
            merchant_id: connection.merchant_id,
            order_id: order.id,
            line_item_id: line.id,
            clover_item_id: cloverItemId,
            barcode,
            product_name: line?.name || item?.name || null,
            status: "unmatched",
          });

          continue;
        }

        const quantity = Math.max(1, Math.abs(Number(line?.quantitySold || 1)));
        const revenue =
          (Number(line?.price || item?.price || 0) * quantity) / 100;

        const { error } = await admin.rpc("apply_clover_sale_line", {
          p_merchant_id: connection.merchant_id,
          p_order_id: order.id,
          p_line_item_id: line.id,
          p_clover_item_id: cloverItemId,
          p_inventory_id: inventoryItem.id,
          p_barcode: barcode,
          p_product_name: inventoryItem.name,
          p_quantity: quantity,
          p_unit_price: revenue / quantity,
          p_unit_cost: Number(inventoryItem.cost || 0),
          p_revenue: revenue,
        });

        if (error) {
          console.error("apply_clover_sale_line", error);
          continue;
        }

        processed++;
      }
    }

    const now = new Date().toISOString();

    await admin.from("clover_sync_runs").insert({
      merchant_id: connection.merchant_id,
      started_at: now,
      finished_at: now,
      status: "success",
      orders_scanned: ordersScanned,
      processed,
      duplicates,
      unmatched,
    });

    return Response.json({
      ok: true,
      summary: {
        last_sync_at: now,
        processed,
        duplicates,
        unmatched,
        orders_scanned: ordersScanned,
      },
    }, { headers: cloverCors });
  } catch (error) {
    console.error("clover-sales-sync", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected error." },
      { status: 500, headers: cloverCors },
    );
  }
});
