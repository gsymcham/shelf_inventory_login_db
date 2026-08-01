import { createClient } from "npm:@supabase/supabase-js@2";
import { getAdminClient, cloverUrls, decryptSecret } from "../_shared/clover.ts";
const cors={"access-control-allow-origin":"*","access-control-allow-headers":"authorization, x-client-info, apikey, content-type","access-control-allow-methods":"POST, OPTIONS"};
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const auth=req.headers.get("authorization");
    if(!auth)return Response.json({ok:false,error:"Authentication required."},{status:401,headers:cors});
    const url=Deno.env.get("SUPABASE_URL")!;
    const anon=Deno.env.get("SUPABASE_ANON_KEY")||JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}").default;
    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const {data:{user},error:userError}=await userClient.auth.getUser();
    if(userError||!user)return Response.json({ok:false,error:"Invalid session."},{status:401,headers:cors});
    const admin=getAdminClient();
    const {data:profile}=await admin.from("profiles").select("role").eq("id",user.id).maybeSingle();
    if(profile?.role!=="admin")return Response.json({ok:false,error:"Admin access required."},{status:403,headers:cors});
    const {data:connection,error}=await admin.from("clover_connections").select("*").order("updated_at",{ascending:false}).limit(1).maybeSingle();
    if(error)throw error;
    if(!connection)return Response.json({ok:false,error:"Clover is not connected."},{status:404,headers:cors});
    const token=await decryptSecret(connection.access_token_ciphertext,connection.access_token_iv);
    const response=await fetch(`${cloverUrls().api}/v3/merchants/${encodeURIComponent(connection.merchant_id)}`,{
      headers:{Authorization:`Bearer ${token}`,Accept:"application/json"}
    });
    if(!response.ok){
      await admin.from("clover_connections").update({last_error:`Clover returned ${response.status}`,updated_at:new Date().toISOString()}).eq("merchant_id",connection.merchant_id);
      return Response.json({ok:false,error:`Clover rejected the token (${response.status}).`},{status:502,headers:cors});
    }
    const merchant=await response.json();
    await admin.from("clover_connections").update({
      merchant_name:merchant?.name||merchant?.businessName||connection.merchant_name,
      last_verified_at:new Date().toISOString(),last_error:null,updated_at:new Date().toISOString()
    }).eq("merchant_id",connection.merchant_id);
    return Response.json({ok:true,merchant:{id:connection.merchant_id,name:merchant?.name||merchant?.businessName||"Clover merchant"},environment:connection.environment},{headers:{...cors,"cache-control":"no-store"}});
  }catch(error){
    console.error("clover-test",error);
    return Response.json({ok:false,error:error instanceof Error?error.message:"Unexpected error."},{status:500,headers:cors});
  }
});
