import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json; charset=utf-8"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:corsHeaders});
function extractAssistantText(events:any[]):string{
  for(const event of [...events].reverse()){
    if(event?.type!=="assistant_message") continue;
    const content=event.assistant_message?.content;
    if(typeof content==="string"&&content.trim()) return content.trim();
    if(content&&typeof content.text==="string"&&content.text.trim()) return content.text.trim();
    if(Array.isArray(content)){
      const text=content.map((part:any)=>typeof part==="string"?part:part?.text??part?.content??"").join("").trim();
      if(text) return text;
    }
  }
  return "";
}
async function manus(path:string,init:RequestInit={}){
  const key=Deno.env.get("MANUS_API_KEY");
  if(!key) throw new Error("MANUS_API_KEY belum dipasang di Supabase Edge Function Secrets.");
  const authHeader=key.startsWith("Bearer ")?{Authorization:key}:{"x-manus-api-key":key};const response=await fetch(`https://api.manus.ai${path}`,{...init,headers:{...authHeader,"Content-Type":"application/json",...(init.headers??{})}});
  const data=await response.json();
  if(!response.ok||data?.ok===false) throw new Error(data?.error?.message||`Manus API error (${response.status})`);
  return data;
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return json({error:"Method tidak didukung."},405);
  let stage="mulai";
  try{
    stage="validasi sesi";
    const auth=req.headers.get("Authorization");
    if(!auth?.startsWith("Bearer ")) return json({error:"Sesi login diperlukan."},401);
    const supabase=createClient(Deno.env.get("SUPABASE_URL")??"",Deno.env.get("SUPABASE_ANON_KEY")??"",{global:{headers:{Authorization:auth}}});
    const {data:{user},error:userError}=await supabase.auth.getUser();
    if(userError||!user) return json({error:"Sesi login tidak valid."},401);
    const body=await req.json();
    const question=typeof body?.question==="string"?body.question.trim():"";
    if(!question) return json({error:"Pertanyaan tidak boleh kosong."},400);
    if(question.length>12000) return json({error:"Pertanyaan terlalu panjang."},400);
    stage="membaca data Vault";
    const {data:items,error:itemsError}=await supabase.from("items").select("id,type,name,value,category,favorite,created_at,mime_type,size").order("created_at",{ascending:false}).limit(500);
    if(itemsError) throw itemsError;
    // Keep the prompt safely below Manus' request limit while retaining every item title and metadata.
    let context="";
    for(const item of (items??[])){
      const row=JSON.stringify({id:item.id,type:item.type,name:item.name,content_or_url:String(item.value??"").slice(0,300),category:item.category,favorite:item.favorite,created_at:item.created_at,mime_type:item.mime_type,size:item.size});
      if(context.length+row.length+1>8000) break;
      context+=row+"\n";
    }
    const prompt=`Kamu adalah asisten AI pribadi di aplikasi Vault. Jawab pertanyaan pengguna secara utuh dan fleksibel; jangan membatasi percakapan hanya pada pencarian file. Kamu boleh menjawab pertanyaan umum, membantu menulis, merangkum, menjelaskan, dan menggunakan konteks Vault bila relevan.\n\nAturan data Vault:\n- Konteks di bawah hanya milik pengguna ini.\n- Jangan mengarang file atau isi yang tidak ada.\n- Jika pertanyaan berkaitan dengan Vault, sebutkan nama item yang relevan dan jelaskan bila tidak ada hasil.\n- Jangan menghapus, mengubah, atau mengklaim telah melakukan tindakan pada data.\n- Jawab dalam bahasa Indonesia kecuali pengguna meminta bahasa lain.\n\nKONTEKS VAULT PENGGUNA:\n${context||"(Belum ada item.)"}\n\nPERTANYAAN PENGGUNA:\n${question}`;
    stage="menghubungi Manus";
    const created=await manus("/v2/task.create",{method:"POST",body:JSON.stringify({message:{content:prompt},locale:"id",agent_profile:"lite",hide_in_task_list:true,share_visibility:"private",title:"Vault AI Chat"})});
    const taskId=created.task_id;
    if(!taskId) throw new Error("Manus tidak mengembalikan task_id.");
    const deadline=Date.now()+55000;
    stage="menunggu jawaban Manus";
    while(Date.now()<deadline){
      const result=await manus(`/v2/task.listMessages?task_id=${encodeURIComponent(taskId)}&order=desc&limit=50`);
      const answer=extractAssistantText(result.messages??result.data??[]);
      if(answer) return json({answer,task_id:taskId});
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
    return json({error:"AI masih memproses. Tunggu sebentar lalu kirim pertanyaan lagi.",task_id:taskId},504);
  }catch(error){
    console.error(error);
    const message=error instanceof Error?error.message:"Gagal menghubungi AI.";
    return json({error:`AI gagal pada tahap ${stage}: ${message}`},500);
  }
});
