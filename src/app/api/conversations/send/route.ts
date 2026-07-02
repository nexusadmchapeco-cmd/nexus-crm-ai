import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { lead_id, message } = await request.json();
    if (!lead_id || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "lead_id e message são obrigatórios" }, { status: 400 });
    }
    const supabase = createAdminClient();
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations").select("*").eq("lead_id", lead_id).single();
    if (conversationError) throw conversationError;
    const { data, error } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      lead_id,
      sender_type: "human",
      content: message.trim(),
      status: "sent",
      is_ai: false,
    }).select().single();
    if (error) throw error;
    await supabase.from("leads").update({ last_message_at: new Date().toISOString() }).eq("id", lead_id);
    return NextResponse.json({ message: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao salvar mensagem" }, { status: 500 });
  }
}
