import { NextResponse } from "next/server";
import { guardLead } from "@/lib/lead-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWithin24hWindow } from "@/lib/whatsapp-window";
import { isWhatsAppConfigured, sendWhatsAppMessage } from "@/lib/whatsapp";

export async function POST(request: Request) {
  try {
    const { lead_id, message } = await request.json();
    if (!lead_id || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "lead_id e message são obrigatórios" }, { status: 400 });
    }
    const guard = await guardLead(String(lead_id));
    if (guard.response) return guard.response;

    const supabase = createAdminClient();
    const [{ data: conversation, error: conversationError }, { data: lead, error: leadError }] =
      await Promise.all([
        supabase.from("conversations").select("*").eq("lead_id", lead_id).single(),
        supabase.from("leads").select("phone").eq("id", lead_id).single(),
      ]);
    if (conversationError) throw conversationError;
    if (leadError) throw leadError;

    // Regra das 24h: fora da janela, texto livre é recusado pela Meta (131047).
    // Avisa o atendente com 409 para ele usar um modelo aprovado.
    if (isWhatsAppConfigured() && !(await isWithin24hWindow(supabase, lead_id))) {
      return NextResponse.json(
        {
          error:
            "Passaram mais de 24h desde a última mensagem do lead. Use um modelo aprovado.",
          code: "window_expired",
        },
        { status: 409 },
      );
    }

    let whatsappMessageId: string | null = null;
    if (isWhatsAppConfigured()) {
      const sent = await sendWhatsAppMessage(lead.phone, message.trim());
      whatsappMessageId = sent?.messages?.[0]?.id || null;
    }

    const { data, error } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      lead_id,
      sender_type: "human",
      content: message.trim(),
      whatsapp_message_id: whatsappMessageId,
      status: isWhatsAppConfigured() ? "sent" : "saved",
      is_ai: false,
    }).select().single();
    if (error) throw error;
    await supabase.from("leads").update({ last_message_at: new Date().toISOString() }).eq("id", lead_id);
    return NextResponse.json({ message: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao salvar mensagem" }, { status: 500 });
  }
}
