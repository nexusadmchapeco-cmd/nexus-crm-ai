import { runSdr } from "@/lib/ai/sdr";
import { defaultStagePrompts } from "@/lib/ai/prompt-defaults";
import { removeNulls, resolveSuggestedStage } from "@/lib/ai/stages";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseOperationsSettings } from "@/lib/operations";
import type { Lead, Message, PipelineStage } from "@/lib/types";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

export type InboundPayload = {
  phone: string;
  name?: string;
  message: string;
  source?: string;
  campaign?: string;
  ad_name?: string;
  whatsapp_message_id?: string;
};

export async function processInbound(payload: InboundPayload) {
  const supabase = createAdminClient();
  const phone = payload.phone.replace(/\D/g, "");
  if (phone.length < 10) throw new Error("Telefone inválido");
  if (!payload.message.trim()) throw new Error("Mensagem é obrigatória");

  const { data: stages, error: stagesError } = await supabase
    .from("pipeline_stages")
    .select("*")
    .order("position");
  if (stagesError) throw stagesError;
  const stageByRole = new Map(
    (stages as PipelineStage[])
      .filter((stage) => stage.role)
      .map((stage) => [stage.role as string, stage]),
  );
  const newStage = stageByRole.get("new_lead");
  if (!newStage) throw new Error("Execute a migration: etapa com role new_lead não encontrada");

  const { data: existingLead, error: findError } = await supabase
    .from("leads")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();
  if (findError) throw findError;

  let lead: Lead;
  if (!existingLead) {
    const { data, error } = await supabase
      .from("leads")
      .insert({
        phone,
        name: payload.name?.trim() || null,
        stage_id: newStage.id,
        source: payload.source || "simulador",
        campaign: payload.campaign || null,
        ad_name: payload.ad_name || null,
      })
      .select()
      .single();
    if (error) throw error;
    lead = data;
  } else {
    const { data, error } = await supabase
      .from("leads")
      .update({
        name: existingLead.name || payload.name?.trim() || null,
        source: existingLead.source || payload.source || null,
        campaign: existingLead.campaign || payload.campaign || null,
        ad_name: existingLead.ad_name || payload.ad_name || null,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", existingLead.id)
      .select()
      .single();
    if (error) throw error;
    lead = data;
  }

  let { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("*")
    .eq("lead_id", lead.id)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) {
    const created = await supabase
      .from("conversations")
      .insert({ lead_id: lead.id, channel: "whatsapp" })
      .select()
      .single();
    if (created.error) throw created.error;
    conversation = created.data;
  }

  const insertedMessage = await supabase
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      lead_id: lead.id,
      sender_type: "lead",
      content: payload.message.trim(),
      whatsapp_message_id: payload.whatsapp_message_id || null,
      status: "received",
      is_ai: false,
    })
    .select()
    .single();
  if (insertedMessage.error) throw insertedMessage.error;

  await supabase
    .from("lead_events")
    .insert({ lead_id: lead.id, event_type: "message_received", metadata: { channel: "whatsapp" } });

  if (!lead.ai_enabled || lead.human_takeover) {
    return {
      lead,
      conversation,
      ai_reply: null,
      stage: stageByRole.get("closer_owns") || newStage,
      skipped_ai: true,
    };
  }

  const stagePromptKey = `__stage__:${lead.stage_id}`;
  const [
    { data: settings, error: settingsError },
    { data: messages, error: messagesError },
    { data: stagePromptRow, error: stagePromptError },
  ] =
    await Promise.all([
      supabase.from("ai_settings").select("*").order("created_at").limit(1).single(),
      supabase
        .from("messages")
        .select("*")
        .eq("lead_id", lead.id)
        .order("created_at")
        .limit(20),
      supabase
        .from("ai_settings")
        .select("global_prompt")
        .eq("name", stagePromptKey)
        .maybeSingle(),
    ]);
  if (settingsError) throw settingsError;
  if (messagesError) throw messagesError;
  if (stagePromptError) throw stagePromptError;

  try {
    const now = new Date().toISOString().slice(0, 10);
    const [{ data: knowledge }, { data: slots }] = await Promise.all([
      supabase
        .from("knowledge_articles")
        .select("title, category, content, unit, valid_from, valid_until, priority")
        .eq("status", "published")
        .eq("visibility", "customer")
        .order("priority", { ascending: false })
        .limit(30),
      supabase
        .from("availability_slots")
        .select("weekday, start_time, end_time, type, unit, owner_name")
        .eq("active", true)
        .order("weekday")
        .order("start_time"),
    ]);
    const applicableKnowledge = (knowledge || []).filter(
      (article) =>
        (!article.valid_from || article.valid_from <= now) &&
        (!article.valid_until || article.valid_until >= now),
    );
    const knowledgeContext = applicableKnowledge
      .map(
        (article) =>
          `[${article.category}] ${article.title}${article.unit ? ` (${article.unit})` : ""}\n${article.content}`,
      )
      .join("\n\n")
      .slice(0, 12000);
    const weekdays = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    const availableSlots = (slots || [])
      .map(
        (slot) =>
          `${weekdays[slot.weekday]} ${String(slot.start_time).slice(0, 5)}–${String(slot.end_time).slice(0, 5)} · ${
            slot.type === "closer_meeting" ? "reunião com closer" : "aula experimental"
          }${slot.owner_name ? ` · ${slot.owner_name}` : ""}${slot.unit ? ` · ${slot.unit}` : ""}`,
      )
      .join("\n")
      .slice(0, 6000);
    const decision = await runSdr({
      lead,
      settings,
      messages: messages as Message[],
      stagePrompt:
        stagePromptRow?.global_prompt ||
        defaultStagePrompts[
          (stages as PipelineStage[]).find((stage) => stage.id === lead.stage_id)?.role || ""
        ] ||
        null,
      knowledgeContext: knowledgeContext || null,
      availableSlots: availableSlots || null,
    });
    const stageRole = resolveSuggestedStage(decision, lead);
    const targetStage = stageByRole.get(stageRole) || stageByRole.get("ai_service")!;
    const updates = {
      ...removeNulls(decision.extracted),
      temperature: decision.temperature,
      stage_id: targetStage.id,
      summary: decision.summary,
      next_action: decision.next_action,
      updated_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    };
    const updated = await supabase
      .from("leads")
      .update(updates)
      .eq("id", lead.id)
      .select()
      .single();
    if (updated.error) throw updated.error;
    lead = updated.data;

    const aiMessage = await supabase
      .from("messages")
      .insert({
        conversation_id: conversation.id,
        lead_id: lead.id,
        sender_type: "ai",
        content: decision.reply,
        status: "sent",
        is_ai: true,
      })
      .select()
      .single();
    if (aiMessage.error) throw aiMessage.error;
    await supabase.from("lead_events").insert({
      lead_id: lead.id,
      event_type: "ai_qualified",
      metadata: { stage: targetStage.name, stage_role: stageRole, temperature: decision.temperature },
    });

    if (
      decision.appointment?.should_schedule &&
      decision.appointment.type &&
      decision.appointment.starts_at
    ) {
      const startsAt = new Date(decision.appointment.starts_at);
      const duration = 30;
      if (!Number.isNaN(startsAt.getTime()) && startsAt.getTime() > Date.now()) {
        const endsAt = new Date(startsAt.getTime() + duration * 60_000);
        const [{ data: conflict }, { data: closed }] = await Promise.all([
          supabase
            .from("appointments")
            .select("id")
            .lt("starts_at", endsAt.toISOString())
            .gt("ends_at", startsAt.toISOString())
            .in("status", ["scheduled", "confirmed"])
            .limit(1)
            .maybeSingle(),
          supabase
            .from("calendar_blocks")
            .select("id")
            .lt("starts_at", endsAt.toISOString())
            .gt("ends_at", startsAt.toISOString())
            .limit(1)
            .maybeSingle(),
        ]);
        if (!conflict && !closed) {
          const { data: appointment } = await supabase
            .from("appointments")
            .insert({
              lead_id: lead.id,
              type: decision.appointment.type,
              title:
                decision.appointment.type === "closer_meeting"
                  ? "Reunião comercial"
                  : "Aula experimental",
              starts_at: startsAt.toISOString(),
              ends_at: endsAt.toISOString(),
              status: "confirmed",
              owner_name:
                decision.appointment.type === "closer_meeting" ? "Closer Nexus" : "Equipe Nexus",
              created_by: "ai",
            })
            .select()
            .single();
          if (appointment) {
            await Promise.all([
              supabase.from("notifications").insert({
                appointment_id: appointment.id,
                title:
                  decision.appointment.type === "closer_meeting"
                    ? "Nova reunião agendada pela IA"
                    : "Nova aula experimental agendada",
                body: `${lead.name || lead.phone} · ${startsAt.toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  dateStyle: "short",
                  timeStyle: "short",
                })}`,
              }),
              supabase.from("lead_events").insert({
                lead_id: lead.id,
                event_type: "appointment_scheduled",
                metadata: {
                  appointment_id: appointment.id,
                  type: appointment.type,
                  starts_at: appointment.starts_at,
                  created_by: "ai",
                },
              }),
            ]);
          }
        }
      }
    }

    if (decision.should_handoff || stageRole === "handoff") {
      const { data: operationsRow } = await supabase
        .from("ai_settings")
        .select("global_prompt")
        .eq("name", "__operations__")
        .maybeSingle();
      const operations = parseOperationsSettings(operationsRow?.global_prompt);
      if (
        operations.closer_enabled &&
        operations.closer_phone &&
        operations.closer_template_name
      ) {
        const { data: alreadyNotified } = await supabase
          .from("lead_events")
          .select("id")
          .eq("lead_id", lead.id)
          .eq("event_type", "closer_notified")
          .limit(1)
          .maybeSingle();
        if (!alreadyNotified) {
          // Modelos do WhatsApp rejeitam quebra de linha/tab e 4+ espaços seguidos
          // dentro de uma variável -- por isso usamos " · " em vez de "\n" e
          // normalizamos qualquer espaço em branco remanescente.
          const closerSummary = [
            `Lead: ${lead.name || "Sem nome"}`,
            `WhatsApp: +${lead.phone}`,
            `Cidade: ${lead.city || "Não informada"}`,
            `Objetivo: ${lead.objective || "Não informado"}`,
            `Nível: ${lead.level || "Não informado"}`,
            `Disponibilidade: ${lead.availability || "Não informada"}`,
            `Temperatura: ${lead.temperature}`,
            `Resumo: ${lead.summary || decision.summary}`,
            `Próxima ação: ${lead.next_action || decision.next_action}`,
          ]
            .join(" · ")
            .replace(/\s+/g, " ")
            .slice(0, 1000);
          try {
            const sent = await sendWhatsAppTemplate(
              operations.closer_phone,
              operations.closer_template_name,
              operations.language_code,
              [closerSummary],
            );
            await supabase.from("lead_events").insert({
              lead_id: lead.id,
              event_type: "closer_notified",
              metadata: {
                closer_phone: operations.closer_phone,
                whatsapp_message_id: sent?.messages?.[0]?.id || null,
              },
            });
          } catch (notifyError) {
            await supabase.from("lead_events").insert({
              lead_id: lead.id,
              event_type: "closer_notification_error",
              metadata: {
                message: notifyError instanceof Error ? notifyError.message : "Erro desconhecido",
              },
            });
          }
        }
      }
    }

    return { lead, conversation, ai_reply: decision.reply, stage: targetStage, skipped_ai: false };
  } catch (error) {
    await supabase.from("lead_events").insert({
      lead_id: lead.id,
      event_type: "ai_error",
      metadata: { message: error instanceof Error ? error.message : "Erro desconhecido" },
    });
    throw error;
  }
}
