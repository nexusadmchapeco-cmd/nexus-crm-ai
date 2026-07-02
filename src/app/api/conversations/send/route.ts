import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWhatsAppConfigured, sendWhatsAppMessage } from "@/lib/whatsapp";

export async function POST(request: Request) {
  try {
    const { lead_id, message } = await request.json();
    if (!lead_id || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "lead_id e message são obrigatórios" }, { status: 400 });
    }
    const supabase = createAdminClient();
    const [{ data: conversation, error: conversationError }, { data: lead, error: leadError }] =
      await Promise.all([
        supabase.from("conversations").select("*").eq("lead_id", lead_id).single(),
        supabase.from("leads").select("phone").eq("id", lead_id).single(),
      ]);
    if (conversationError) throw conversationError;
    if (leadError) throw leadError;

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
