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
  const stageByName = new Map(
    (stages as PipelineStage[]).map((stage) => [stage.name, stage]),
  );
  const newStage = stageByName.get("Novo lead");
  if (!newStage) throw new Error("Execute a migration: etapa Novo lead não encontrada");

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
      stage: stageByName.get("Closer assumiu") || newStage,
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
    const decision = await runSdr({
      lead,
      settings,
      messages: messages as Message[],
      stagePrompt:
        stagePromptRow?.global_prompt ||
        defaultStagePrompts[
          (stages as PipelineStage[]).find((stage) => stage.id === lead.stage_id)?.name || ""
        ] ||
        null,
    });
    const stageName = resolveSuggestedStage(decision, lead);
    const targetStage = stageByName.get(stageName) || stageByName.get("IA em atendimento")!;
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
      metadata: { stage: stageName, temperature: decision.temperature },
    });

    if (decision.should_handoff || stageName === "Enviar para closer") {
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
          ].join("\n").slice(0, 1000);
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
