import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";

// Novo modelo de notificação de lead quente para o closer (briefing seção 2):
// linhas separadas, com o telefone do lead e a modalidade. Substitui o
// resumo_closer de linha única. Depois de APROVADO na Meta, trocar o nome do
// modelo no Estúdio de IA (aba Encaminhamento) para "lead_quente".
//
// A Meta não aceita modelo terminando em variável, por isso a assinatura
// final fixa.
const TEMPLATE = {
  name: "lead_quente",
  text:
    "🔥 Lead quente esperando contato!\n\n" +
    "Nome: {{1}}\n" +
    "Número do celular: {{2}}\n" +
    "Objetivo: {{3}}\n" +
    "Unidade: {{4}}\n" +
    "Disponibilidade: {{5}}\n" +
    "Modalidade: {{6}}\n\n" +
    "Resumo da IA: {{7}}\n\n" +
    "Nexus CRM AI",
  example: [
    "Maria Souza",
    "+55 49 99999-0000",
    "Inglês para trabalho",
    "Chapecó",
    "Noite, após as 19h",
    "Presencial",
    "Quer começar em agosto, já fez teste de nível A1, prefere aulas 2x por semana.",
  ],
};

export async function GET(request: Request) {
  const confirm = new URL(request.url).searchParams.get("confirm");
  if (confirm !== "sim") {
    return NextResponse.json({
      warning: "Isso envia o modelo lead_quente (notificação do closer) para aprovação da Meta.",
      template: { name: TEMPLATE.name, text: TEMPLATE.text },
      howTo: "Chame novamente com ?confirm=sim para enviar.",
    });
  }

  try {
    const token = requireEnv("WHATSAPP_TOKEN");
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "189064657634130";
    const apiVersion = process.env.WHATSAPP_API_VERSION || "v25.0";

    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          name: TEMPLATE.name,
          language: "pt_BR",
          category: "UTILITY",
          components: [
            {
              type: "BODY",
              text: TEMPLATE.text,
              example: { body_text: [TEMPLATE.example] },
            },
          ],
        }),
      },
    );
    const payload = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: payload?.error?.message || `Meta respondeu ${response.status}`, detail: payload },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      submitted: TEMPLATE.name,
      status: payload?.status || "PENDING",
      nextStep:
        "Aguarde a aprovação no Gerenciador do WhatsApp e depois troque o modelo no Estúdio de IA (aba Encaminhamento) para lead_quente.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar o modelo." },
      { status: 500 },
    );
  }
}
