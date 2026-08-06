import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";

// Templates da régua de follow-up por etapa (briefing §6.2) — RASCUNHOS para
// aprovação do Guilherme antes de submeter (?confirm=sim envia todos).
// Todos com botões de resposta rápida; os payloads fixos (HANDOFF_CONSULTOR,
// DUVIDA_IA, ADIAR) são definidos no envio de cada mensagem.
const BUTTONS = [
  { type: "QUICK_REPLY", text: "Falar com consultor" },
  { type: "QUICK_REPLY", text: "Tenho uma dúvida" },
  { type: "QUICK_REPLY", text: "Agora não" },
];

const TEMPLATES = [
  // Contato feito — o lead sumiu logo no começo.
  { name: "followup_contato_1", text: "Oi, {{1}}! Vi que a gente começou a conversar sobre inglês {{2}} e ficou pela metade. Posso continuar te ajudando?", example: ["Maria", "pra viagem"] },
  { name: "followup_contato_2", text: "Oi, {{1}}! Ainda dá tempo de destravar o inglês {{2}} — me conta o que você precisa que eu te ajudo por aqui. 😊", example: ["Maria", "pra trabalho"] },
  { name: "followup_contato_3", text: "Oi, {{1}}! Vou deixar seu atendimento em pausa, mas seu interesse no inglês {{2}} fica guardado. Quando quiser retomar, é só chamar!", example: ["Maria", "no seu dia a dia"] },
  // Informações passadas — recebeu explicação e parou.
  { name: "followup_info_1", text: "Oi, {{1}}! Te passei as informações do curso {{2}} — ficou alguma dúvida? Posso te explicar valores, turmas e horários.", example: ["Maria", "pra viagem"] },
  { name: "followup_info_2", text: "Oi, {{1}}! As turmas estão fechando e lembrei de você. Quer que eu te mostre as opções de horário pro inglês {{2}}?", example: ["Maria", "pra trabalho"] },
  { name: "followup_info_3", text: "Oi, {{1}}! Última chamada por enquanto: se quiser seguir com o inglês {{2}}, me chama que retomo seu atendimento na hora. 😊", example: ["Maria", "no seu dia a dia"] },
  // Qualificado — pronto para o consultor e sumiu.
  { name: "followup_qualificado_1", text: "Oi, {{1}}! Nosso consultor está pronto pra falar com você sobre o inglês {{2}}. Podemos continuar?", example: ["Maria", "pra viagem"] },
  { name: "followup_qualificado_2", text: "Oi, {{1}}! Não quero que você perca a condição que conversamos pro inglês {{2}}. Vamos fechar os detalhes?", example: ["Maria", "pra trabalho"] },
  { name: "followup_qualificado_3", text: "Oi, {{1}}! Vou pausar por aqui, mas sua vaga pro inglês {{2}} segue possível. Quando quiser, é só me chamar. 😊", example: ["Maria", "no seu dia a dia"] },
  // Não qualificado — reengajamento ~2 meses depois.
  { name: "followup_naoqualif_1", text: "Oi, {{1}}! Faz um tempinho que conversamos sobre inglês {{2}}. As condições mudaram por aqui — quer dar uma nova olhada?", example: ["Maria", "pra viagem"] },
];

export async function GET(request: Request) {
  const confirm = new URL(request.url).searchParams.get("confirm");
  if (confirm !== "sim") {
    return NextResponse.json({
      warning: "RASCUNHOS da régua de follow-up. Revise os textos com o Guilherme; ?confirm=sim submete os 10 à Meta.",
      buttons: BUTTONS.map((b) => b.text),
      templates: TEMPLATES.map((t) => ({ name: t.name, text: t.text })),
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
              { type: "BODY", text: template.text, example: { body_text: [template.example] } },
              { type: "BUTTONS", buttons: BUTTONS },
            ],
          }),
        },
      );
      const payload = await response.json();
      results.push({
        name: template.name,
        ok: response.ok,
        status: payload?.status || payload?.error?.message || response.status,
      });
    }
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar modelos." },
      { status: 500 },
    );
  }
}
