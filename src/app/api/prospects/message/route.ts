import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const FALLBACK =
  "Olá! Aqui é da Nexus English Center. Estamos fechando convênios com empresas de [cidade] para oferecer inglês com condição especial aos colaboradores e clientes, sem custo para a empresa. Faz sentido eu te enviar como funciona?";

// Modelo de mensagem de prospecção — editável na Base de conhecimento
// (artigo interno). O texto é copiado/colado manualmente por quem prospecta.
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("knowledge_articles")
      .select("content")
      .eq("title", "Modelo de prospecção de parceiros")
      .maybeSingle();
    return NextResponse.json({ message: data?.content || FALLBACK });
  } catch {
    return NextResponse.json({ message: FALLBACK });
  }
}
