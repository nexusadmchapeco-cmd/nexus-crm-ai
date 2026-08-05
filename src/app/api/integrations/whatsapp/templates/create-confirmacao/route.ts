import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";

// Template de lembrete de reunião com botões de resposta rápida (briefing
// §3.3). Payloads fixos roteados no webhook: CONFIRMAR_PRESENCA / REMARCAR.
const TEMPLATE = {
  name: "confirmacao_reuniao",
  text:
    "Oi, {{1}}! Passando pra confirmar seu horário com a Nexus English Center: {{2}}. Podemos confirmar sua presença?",
  example: ["Maria", "quinta-feira, 07/08 às 19:00"],
  buttons: [
    { type: "QUICK_REPLY", text: "Sim, confirmado ✅" },
    { type: "QUICK_REPLY", text: "Preciso remarcar" },
  ],
};

export async function GET(request: Request) {
  const confirm = new URL(request.url).searchParams.get("confirm");
  if (confirm !== "sim") {
    return NextResponse.json({
      warning: "Isso envia o modelo confirmacao_reuniao (lembrete com botões) para aprovação da Meta.",
      template: TEMPLATE,
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
            { type: "BODY", text: TEMPLATE.text, example: { body_text: [TEMPLATE.example] } },
            { type: "BUTTONS", buttons: TEMPLATE.buttons },
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
    return NextResponse.json({ ok: true, submitted: TEMPLATE.name, status: payload?.status || "PENDING" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar o modelo." },
      { status: 500 },
    );
  }
}
