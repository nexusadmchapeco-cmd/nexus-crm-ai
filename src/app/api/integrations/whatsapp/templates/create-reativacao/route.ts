import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";

const TEMPLATE_BODY =
  "Oi, {{1}}! Tudo bem?\n\nHá algum tempo você entrou em contato com a gente para saber mais sobre as aulas de inglês.\n\nEstamos com algumas condições bem interessantes agora e lembrei de você. O que acha de conversarmos melhor?";

export async function GET(request: Request) {
  const confirm = new URL(request.url).searchParams.get("confirm");
  if (confirm !== "sim") {
    return NextResponse.json({
      warning: "Isso envia o modelo 'reativacao_leads' para aprovação da Meta.",
      body: TEMPLATE_BODY,
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
          name: "reativacao_leads",
          language: "pt_BR",
          category: "MARKETING",
          components: [
            {
              type: "BODY",
              text: TEMPLATE_BODY,
              example: { body_text: [["Maria"]] },
            },
          ],
        }),
      },
    );
    const result = await response.json();
    return NextResponse.json(
      { ok: response.ok, wabaId, result },
      { status: response.ok ? 200 : 502 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar o modelo." },
      { status: 500 },
    );
  }
}
