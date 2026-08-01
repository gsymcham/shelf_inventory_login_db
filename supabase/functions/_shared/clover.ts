import { createClient } from "npm:@supabase/supabase-js@2";

export function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  const key = legacyKey || (secretKeys ? JSON.parse(secretKeys).default : null);
  if (!url || !key) throw new Error("Missing Supabase server credentials.");
  return createClient(url, key, { auth: { persistSession: false } });
}
export function cloverEnvironment() {
  return (Deno.env.get("CLOVER_ENVIRONMENT") || "sandbox").toLowerCase();
}
export function cloverUrls() {
  if (cloverEnvironment() === "production") {
    return { authorize: "https://www.clover.com/oauth/v2/authorize", api: "https://api.clover.com" };
  }
  return { authorize: "https://sandbox.dev.clover.com/oauth/v2/authorize", api: "https://apisandbox.dev.clover.com" };
}
function keyBytes() {
  const encoded = Deno.env.get("CLOVER_TOKEN_ENCRYPTION_KEY");
  if (!encoded) throw new Error("Missing CLOVER_TOKEN_ENCRYPTION_KEY.");
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("CLOVER_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  return bytes;
}
export async function encryptSecret(value: string) {
  const key = await crypto.subtle.importKey("raw", keyBytes(), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
  return { ciphertext: btoa(String.fromCharCode(...encrypted)), iv: btoa(String.fromCharCode(...iv)) };
}
export async function decryptSecret(ciphertext: string, ivValue: string) {
  const key = await crypto.subtle.importKey("raw", keyBytes(), "AES-GCM", false, ["decrypt"]);
  const iv = Uint8Array.from(atob(ivValue), c => c.charCodeAt(0));
  const encrypted = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted));
}
export async function sha256(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest).map(b => b.toString(16).padStart(2, "0")).join("");
}
export function safeReturnUrl(candidate: string | null) {
  const configured = Deno.env.get("SHELF2_RETURN_URL");
  if (!configured) throw new Error("Missing SHELF2_RETURN_URL.");
  const allowed = new URL(configured);
  if (!candidate) return allowed.toString();
  try {
    const parsed = new URL(candidate);
    return parsed.origin === allowed.origin ? parsed.toString() : allowed.toString();
  } catch { return allowed.toString(); }
}
export function htmlError(title: string, message: string, status = 400) {
  const escaped = message.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c] || c));
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font:16px system-ui;padding:32px;max-width:680px;margin:auto}div{border:1px solid #ddd;border-radius:14px;padding:24px}h1{font-size:24px}</style><div><h1>${title}</h1><p>${escaped}</p></div>`, { status, headers: { "content-type":"text/html; charset=utf-8" } });
}
