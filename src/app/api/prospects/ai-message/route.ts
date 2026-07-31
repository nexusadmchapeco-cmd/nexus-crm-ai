import { NextResponse } from "next/server";
import { ANTHROPIC_DEFAULT_MODEL, anthropicToolCall, resolveAnthropicKey } from "@/lib/ai/anthropic";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

const FALLBACK =
  "Olá! Aqui é da Nexus English Center. Estamos fechando convênios com empresas da região para oferecer inglês com condição especial aos colaboradores, sem custo para a empresa. Faz sentido eu te enviar como funciona?";

// A IA escreve a abordagem de parceria personalizada pelo segmento da empresa
// (spec seção 9). O vendedor revisa e envia pelo wa.me.
export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  let body: { name?: string; segment?: string; city?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const name = String(body.name || "").slice(0, 120);
  const segment = String(body.segment || "").slice(0, 120);
  const city = String(body.city || "").slice(0, 80);

  try {
    const apiKey = await resolveAnthropicKey();
    if (!apiKey) return NextResponse.json({ message: FALLBACK, fallback: true });

    // Contexto extra da Base de conhecimento, se existir.
    let template = "";
    try {
      const { data } = await createAdminClient()
        .from("knowledge_articles")
        .select("content")
        .eq("title", "Modelo de prospecção de parceiros")
        .maybeSingle();
      template = data?.content || "";
    } catch {
      template = "";
    }

    const result = (await anthropicToolCall({
      apiKey,
      model: process.env.CONVERSATION_MODEL || ANTHROPIC_DEFAULT_MODEL,
      system:
        "Você escreve mensagens curtas de WhatsApp para o vendedor da Nexus English Center " +
        "(escola de inglês em Chapecó-SC e Passo Fundo-RS) abrir conversa com empresas locais e " +
        "propor convênio corporativo: desconto em inglês para os funcionários, sem custo para a empresa. " +
        "Tom humano, direto, brasileiro, sem parecer spam; no máximo 3 frases curtas e uma pergunta final. " +
        "Personalize pelo segmento da empresa (por que inglês ajuda esse time). Não invente números nem descontos específicos." +
        (template ? `\n\nModelo base aprovado (adapte, não copie literal):\n${template}` : ""),
      userContent: `Empresa: ${name || "empresa local"}\nSegmento: ${segment || "não informado"}\nCidade: ${city || "não informada"}`,
      tool: {
        name: "mensagem_whatsapp",
        description: "Mensagem final de abordagem para enviar no WhatsApp da empresa.",
        input_schema: {
          type: "object",
          properties: { message: { type: "string", description: "A mensagem pronta para enviar." } },
          required: ["message"],
        },
      },
      maxTokens: 500,
    })) as { message?: string };

    return NextResponse.json({ message: result?.message?.trim() || FALLBACK });
  } catch {
    return NextResponse.json({ message: FALLBACK, fallback: true });
  }
}
