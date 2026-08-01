import { getAdminClient, cloverUrls, safeReturnUrl, sha256, htmlError } from "../_shared/clover.ts";
Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const appId = Deno.env.get("CLOVER_APP_ID");
    const callbackUrl = Deno.env.get("CLOVER_CALLBACK_URL");
    if (!appId || !callbackUrl) throw new Error("Clover OAuth secrets are not configured.");
    const returnUrl = safeReturnUrl(url.searchParams.get("return_url"));
    const merchantId = url.searchParams.get("merchant_id") || url.searchParams.get("merchantId");
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const nonce = btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
    const nonceHash = await sha256(nonce);
    const supabase = getAdminClient();
    const { error } = await supabase.from("clover_oauth_attempts").insert({
      nonce_hash: nonceHash, merchant_id: merchantId || null, return_url: returnUrl,
      expires_at: new Date(Date.now() + 600000).toISOString()
    });
    if (error) throw error;
    const authorize = new URL(cloverUrls().authorize);
    authorize.searchParams.set("client_id", appId);
    authorize.searchParams.set("redirect_uri", callbackUrl);
    return new Response(null, { status:302, headers:{
      location: authorize.toString(),
      "set-cookie": `shelf2_clover_oauth=${nonce}; Path=/functions/v1; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      "cache-control":"no-store"
    }});
  } catch (error) {
    console.error("clover-connect", error);
    return htmlError("Unable to start Clover connection", error instanceof Error ? error.message : "Unexpected error.", 500);
  }
});
