import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request:Request){
  try{const body=await request.json();if(!body.title?.trim()||!body.content?.trim())return NextResponse.json({error:"Título e conteúdo são obrigatórios."},{status:400});
    const {data,error}=await createAdminClient().from("knowledge_articles").insert({title:body.title.trim(),category:body.category||"Geral",content:body.content.trim(),unit:body.unit||null,visibility:body.visibility||"customer",status:body.status||"draft",valid_until:body.valid_until||null}).select().single();if(error)throw error;return NextResponse.json(data);
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Erro ao salvar."},{status:500});}
}
