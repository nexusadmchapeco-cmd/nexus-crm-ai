import { NextResponse } from "next/server";
import { ANTHROPIC_DEFAULT_MODEL, anthropicToolCall, resolveAnthropicKey } from "@/lib/ai/anthropic";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWhatsAppConfigured, sendWhatsAppMessage } from "@/lib/whatsapp";

export const maxDuration = 60;

// Retomada de 2 horas (dentro da janela de 24h do WhatsApp): lead que parou
// de responder há 2h+ recebe UMA mensagem livre, escrita pela IA com o
// contexto da conversa. Depois de 24h de silêncio, quem assume é o cron de
// templates aprovados (/api/jobs/followups). Roda a cada 30 min (Vercel cron)
// no horário comercial.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!isWhatsAppConfigured()) {
    return NextResponse.json({ ok: true, sent: 0, reason: "WhatsApp não configurado" });
  }

  try {
    const supabase = createAdminClient();
    const now = Date.now();
    const twoHoursAgo = new Date(now - 2 * 3600000).toISOString();
    const dayAgo = new Date(now - 24 * 3600000).toISOString();

    // Só etapas em que a IA ainda conduz a conversa.
    const { data: stages } = await supabase
      .from("pipeline_stages")
      .select("id, role")
      .in("role", ["new_lead", "ai_service", "qualifying"]);
    const stageIds = (stages || []).map((s) => s.id);
    if (!stageIds.length) return NextResponse.json({ ok: true, sent: 0 });

    const { data: candidates } = await supabase
      .from("leads")
      .select("id, name, phone, objective, unit_interest, city, summary, stage_id")
      .in("stage_id", stageIds)
      .eq("human_takeover", false)
      .eq("ai_enabled", true)
      .is("opted_out_at", null)
      .lt("last_message_at", twoHoursAgo)
      .gte("last_message_at", dayAgo)
      .limit(30);

    const apiKey = await resolveAnthropicKey();
    let sent = 0;
    const errors: string[] = [];

    for (const lead of candidates || []) {
      // Um nudge por período de silêncio: se já houve nudge depois da última
      // mensagem do lead, pula.
      const [{ data: lastMessages }, { data: lastNudge }, { data: conversation }] =
        await Promise.all([
          supabase
            .from("messages")
            .select("sender_type, content, created_at")
            .eq("lead_id", lead.id)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("lead_events")
            .select("created_at")
            .eq("lead_id", lead.id)
            .eq("event_type", "followup_nudge_sent")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from("conversations").select("id").eq("lead_id", lead.id).maybeSingle(),
        ]);
      const messages = (lastMessages || []).reverse();
      if (!messages.length || !conversation) continue;
      const lastInbound = [...messages].reverse().find((m) => m.sender_type === "lead");
      if (!lastInbound) continue;
      // A última palavra é do lead? Então a Nina deve responder pelo fluxo
      // normal, não pelo nudge.
      if (messages[messages.length - 1].sender_type === "lead") continue;
      if (lastNudge && lastNudge.created_at > lastInbound.created_at) continue;

      let text =
        `Oi${lead.name ? `, ${lead.name.split(" ")[0]}` : ""}! Ficou alguma dúvida? ` +
        "Sigo por aqui pra te ajudar a destravar o inglês. 😊";
      if (apiKey) {
        try {
          const transcript = messages
            .map((m) => `${m.sender_type === "lead" ? "Lead" : "Nina"}: ${String(m.content).slice(0, 300)}`)
            .join("\n");
          const result = (await anthropicToolCall({
            apiKey,
            model: process.env.CONVERSATION_MODEL || ANTHROPIC_DEFAULT_MODEL,
            system:
              "Você é a Nina, SDR da Nexus English Center (escola de inglês). O lead parou de responder há " +
              "algumas horas. Escreva UMA mensagem curta de WhatsApp retomando a conversa exatamente de onde " +
              "parou — referencie o assunto pendente (ex.: a pergunta que ficou sem resposta). Tom leve e " +
              "humano, sem pressão, sem repetir o que já foi dito, no máximo 2 frases + 1 pergunta. Não " +
              "invente preços, promoções ou informações novas.",
            userContent: `Dados do lead: nome=${lead.name || "?"}, objetivo=${lead.objective || "?"}, unidade=${lead.unit_interest || lead.city || "?"}.\n\nConversa recente:\n${transcript}`,
            tool: {
              name: "mensagem_retomada",
              description: "Mensagem final de retomada para enviar no WhatsApp.",
              input_schema: {
                type: "object",
                properties: { message: { type: "string" } },
                required: ["message"],
              },
            },
            maxTokens: 300,
          })) as { message?: string };
          if (result?.message?.trim()) text = result.message.trim();
        } catch {
          // fallback já definido
        }
      }

      try {
        const sentMessage = await sendWhatsAppMessage(lead.phone, text);
        await Promise.all([
          supabase.from("messages").insert({
            conversation_id: conversation.id,
            lead_id: lead.id,
            sender_type: "ai",
            content: text,
            whatsapp_message_id: sentMessage?.messages?.[0]?.id || null,
            status: "sent",
            is_ai: true,
          }),
          supabase.from("lead_events").insert({
            lead_id: lead.id,
            event_type: "followup_nudge_sent",
            metadata: { message: text, last_inbound_at: lastInbound.created_at },
          }),
        ]);
        sent += 1;
      } catch (sendError) {
        errors.push(`${lead.id}: ${sendError instanceof Error ? sendError.message : "erro"}`);
      }
    }

    return NextResponse.json({ ok: true, sent, errors: errors.slice(0, 5) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro no job de retomada." },
      { status: 500 },
    );
  }
}
