import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Mostra os últimos retornos de ENTREGA que a Meta mandou pelo webhook —
// sent / delivered / read, ou failed com o código e o motivo. É a prova de
// onde a mensagem parou. Admin-only (middleware /api/settings).
export async function GET() {
  try {
    const { data } = await createAdminClient()
      .from("app_secrets")
      .select("value, updated_at")
      .eq("name", "whatsapp_delivery_log")
      .maybeSingle();

    let entregas: unknown[] = [];
    try {
      entregas = JSON.parse(data?.value || "[]");
    } catch {
      entregas = [];
    }

    if (!entregas.length) {
      return NextResponse.json({
        entregas: [],
        aviso:
          "Nenhum retorno registrado ainda. Dispare um teste e recarregue em ~15s. Se continuar vazio, o webhook da Meta pode não estar assinando o campo 'messages' (statuses) — confira no App da Meta em Webhooks.",
      });
    }

    return NextResponse.json({
      atualizado_em: data?.updated_at || null,
      comoLer: {
        sent: "A Meta aceitou e enviou.",
        delivered: "Chegou no aparelho ✅",
        read: "Foi lida ✅",
        failed: "NÃO chegou — veja o código e a mensagem do erro.",
      },
      entregas,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao ler o histórico." },
      { status: 500 },
    );
  }
}
