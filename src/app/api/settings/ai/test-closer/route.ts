import { NextResponse } from "next/server";
import { buildCloserNotification } from "@/lib/closer-notify";
import { parseOperationsSettings } from "@/lib/operations";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

// Teste REAL do encaminhamento por unidade: monta a notificação lead_quente
// com um lead fictício da unidade escolhida e envia pro WhatsApp do closer
// configurado — prova de ponta a ponta (template + roteamento + telefone).
// Admin-only (middleware /api/settings). Use:
//   ?unit=chapeco&confirm=sim      → testa o closer de Chapecó (Jaziel)
//   ?unit=passo_fundo&confirm=sim  → testa o closer de PF/Online (Lucas)

export async function GET(request: Request) {
  const url = new URL(request.url);
  const unit = url.searchParams.get("unit");
  const confirm = url.searchParams.get("confirm");
  if (!unit || !["chapeco", "passo_fundo"].includes(unit)) {
    return NextResponse.json(
      { error: "Informe ?unit=chapeco ou ?unit=passo_fundo." },
      { status: 400 },
    );
  }
  if (confirm !== "sim") {
    return NextResponse.json({
      warning: `Isso envia uma notificação de TESTE no WhatsApp do closer de ${unit === "chapeco" ? "Chapecó" : "Passo Fundo"}.`,
      howTo: "Chame novamente com &confirm=sim para enviar.",
    });
  }
  try {
    const supabase = createAdminClient();
    const { data: operationsRow } = await supabase
      .from("ai_settings")
      .select("global_prompt")
      .eq("name", "__operations__")
      .maybeSingle();
    const operations = parseOperationsSettings(operationsRow?.global_prompt);

    const unitLabel = unit === "chapeco" ? "Chapecó" : "Passo Fundo";
    const fakeLead = {
      name: `TESTE — pode ignorar (${unitLabel})`,
      phone: "5549999990000",
      objective: "Teste do encaminhamento",
      unit_interest: unitLabel,
      city: unitLabel,
      availability: null,
      summary: null,
    };

    const notification = buildCloserNotification(
      operations,
      fakeLead,
      "Mensagem de TESTE disparada pelo administrador para confirmar que o aviso de lead quente chega no closer certo desta unidade. Pode ignorar.",
    );
    if (!notification.phone) {
      return NextResponse.json(
        { error: `Nenhum WhatsApp de closer configurado para ${unitLabel} — preencha no Estúdio de IA (ou rode o seed).` },
        { status: 400 },
      );
    }

    await sendWhatsAppTemplate(
      notification.phone,
      notification.templateName,
      operations.language_code,
      notification.params,
    );
    return NextResponse.json({
      ok: true,
      unidade: unitLabel,
      enviado_para: notification.phone,
      template: notification.templateName,
      confira: "O closer deve receber a notificação de teste no WhatsApp agora.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao enviar o teste." },
      { status: 500 },
    );
  }
}
