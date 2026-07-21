import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";

// Follow-ups com contexto: {{1}} = nome, {{2}} = trecho do objetivo do lead
// (ex.: "pra viagem", "no seu dia a dia"). Não repetem perguntas já feitas.
const TEMPLATES = [
  {
    name: "followup_ctx_dia1",
    text: "Hello, {{1}}! Passando aqui pra saber se você ainda quer seguir com o inglês {{2}}. Posso retomar teu atendimento por aqui, é rapidinho.",
    example: ["Maria", "pra viagem"],
  },
  {
    name: "followup_ctx_dia3",
    text: "Hello, {{1}}! Tô montando as próximas turmas e lembrei de você. Ainda quer destravar o inglês {{2}}? Posso te mostrar as opções que encaixam.",
    example: ["Maria", "pra trabalho"],
  },
  {
    name: "followup_ctx_dia7",
    text: "Hello, {{1}}! Que tal a gente agilizar com uma aula experimental? Assim você sente na prática como funciona o inglês {{2}}. O que acha?",
    example: ["Maria", "pra viagem"],
  },
  {
    name: "followup_ctx_dia21",
    text: "Hello, {{1}}! Vou pausar teu atendimento por enquanto, mas seu interesse no inglês {{2}} fica anotado aqui. Quando quiser retomar, é só chamar.",
    example: ["Maria", "no seu dia a dia"],
  },
];

export async function GET(request: Request) {
  const confirm = new URL(request.url).searchParams.get("confirm");
  if (confirm !== "sim") {
    return NextResponse.json({
      warning: "Isso envia 4 modelos de follow-up (com variável de contexto) para aprovação da Meta.",
      templates: TEMPLATES.map((template) => ({ name: template.name, text: template.text })),
      howTo: "Chame novamente com ?confirm=sim para enviar.",
    });
  }

  try {
    const token = requireEnv("WHATSAPP_TOKEN");
    const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "189064657634130";
    const apiVersion = process.env.WHATSAPP_API_VERSION || "v25.0";

    const results = [];
    for (const template of TEMPLATES) {
      const response = await fetch(
        `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            name: template.name,
            language: "pt_BR",
            category: "MARKETING",
            components: [
              {
                type: "BODY",
                text: template.text,
                example: { body_text: [template.example] },
              },
            ],
          }),
        },
      );
      const body = await response.json();
      results.push({ name: template.name, ok: response.ok, status: body?.status || null, result: body });
    }
    return NextResponse.json({ ok: results.every((entry) => entry.ok), wabaId, results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar os modelos." },
      { status: 500 },
    );
  }
}
