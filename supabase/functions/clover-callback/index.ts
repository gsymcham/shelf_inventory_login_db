import { getAdminClient, cloverUrls, cloverEnvironment, encryptSecret, safeReturnUrl, sha256, htmlError } from "../_shared/clover.ts";
function cookie(req: Request, name: string) {
  const part = (req.headers.get("cookie") || "").split(";").map(x=>x.trim()).find(x=>x.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}
Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const merchantId = url.searchParams.get("merchant_id") || url.searchParams.get("merchantId");
    const returnedClientId = url.searchParams.get("client_id");
    const appId = Deno.env.get("CLOVER_APP_ID");
    const appSecret = Deno.env.get("CLOVER_APP_SECRET");
    if (!code || !merchantId) throw new Error("Clover did not return an authorization code and merchant ID.");
    if (!appId || !appSecret) throw new Error("Clover OAuth secrets are not configured.");
    if (returnedClientId && returnedClientId !== appId) throw new Error("Clover client ID did not match this app.");
    const nonce = cookie(req, "shelf2_clover_oauth");
    if (!nonce) throw new Error("OAuth session cookie is missing or expired.");
    const supabase = getAdminClient();
    const { data: attempt, error: attemptError } = await supabase.from("clover_oauth_attempts")
      .select("id,merchant_id,return_url,expires_at,used_at").eq("nonce_hash", await sha256(nonce)).maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt || attempt.used_at || new Date(attempt.expires_at).getTime() < Date.now()) throw new Error("OAuth session is invalid or expired.");
    if (attempt.merchant_id && attempt.merchant_id !== merchantId) throw new Error("Merchant ID did not match the original Clover launch.");
    const tokenResponse = await fetch(`${cloverUrls().api}/oauth/v2/token`, {
      method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify({ client_id:appId, client_secret:appSecret, code })
    });
    const tokenBody = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenBody.access_token) throw new Error(tokenBody.message || tokenBody.error || `Clover token exchange failed (${tokenResponse.status}).`);
    const merchantResponse = await fetch(`${cloverUrls().api}/v3/merchants/${encodeURIComponent(merchantId)}`, {
      headers:{Authorization:`Bearer ${tokenBody.access_token}`,Accept:"application/json"}
    });
    const merchant = merchantResponse.ok ? await merchantResponse.json() : null;
    const access = await encryptSecret(tokenBody.access_token);
    const refresh = tokenBody.refresh_token ? await encryptSecret(tokenBody.refresh_token) : null;
    const { error: saveError } = await supabase.from("clover_connections").upsert({
      merchant_id:merchantId, merchant_name:merchant?.name || merchant?.businessName || null,
      environment:cloverEnvironment(), access_token_ciphertext:access.ciphertext, access_token_iv:access.iv,
      refresh_token_ciphertext:refresh?.ciphertext || null, refresh_token_iv:refresh?.iv || null,
      access_token_expires_at:tokenBody.access_token_expiration ? new Date(Number(tokenBody.access_token_expiration)*1000).toISOString() : null,
      refresh_token_expires_at:tokenBody.refresh_token_expiration ? new Date(Number(tokenBody.refresh_token_expiration)*1000).toISOString() : null,
      updated_at:new Date().toISOString(), last_verified_at:merchantResponse.ok ? new Date().toISOString() : null,
      last_error:merchantResponse.ok ? null : `Merchant lookup failed (${merchantResponse.status})`
    }, { onConflict:"merchant_id" });
    if (saveError) throw saveError;
    await supabase.from("clover_oauth_attempts").update({ used_at:new Date().toISOString() }).eq("id",attempt.id);
    const returnUrl = new URL(safeReturnUrl(attempt.return_url));
    returnUrl.searchParams.set("clover","connected");
    return new Response(null,{status:302,headers:{
      location:returnUrl.toString(),
      "set-cookie":"shelf2_clover_oauth=; Path=/functions/v1; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
      "cache-control":"no-store"
    }});
  } catch (error) {
    console.error("clover-callback", error);
    return htmlError("Clover connection failed", error instanceof Error ? error.message : "Unexpected error.", 400);
  }
});
