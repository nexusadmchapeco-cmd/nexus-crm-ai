import { runSdr } from "@/lib/ai/sdr";
import { defaultStagePrompts } from "@/lib/ai/prompt-defaults";
import { removeNulls, resolveSuggestedStage } from "@/lib/ai/stages";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBlocked, slotRulesPrompt, validateSlotRules } from "@/lib/agenda-rules";
import {
  advanceQualification,
  DEFAULT_POST_QUALIFICATION_PROMPT,
  renderPostQualificationPrompt,
} from "@/lib/qualification";
import { buildCloserNotification } from "@/lib/closer-notify";
import { parseOperationsSettings } from "@/lib/operations";
import { cancelPendingFollowups } from "@/lib/regua";
import type { Lead, Message, PipelineStage } from "@/lib/types";
import { isAnyWhatsAppChannelReady, sendWhatsAppButtons, sendWhatsAppTemplate } from "@/lib/whatsapp";

export type InboundPayload = {
  phone: string;
  name?: string;
  message: string;
  source?: string;
  campaign?: string;
  ad_name?: string;
  whatsapp_message_id?: string;
  // Payload fixo do clique de botão (quick reply de template / interactive).
  button_payload?: string | null;
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
    // Lead novo entra na sequência de qualificação por botões (briefing §1).
    // Se a coluna ainda não existir (migração 015 pendente), refaz sem ela.
    const baseInsert = {
        phone,
        name: payload.name?.trim() || null,
        stage_id: newStage.id,
        source: payload.source || "simulador",
        campaign: payload.campaign || null,
        ad_name: payload.ad_name || null,
      };
    let created = await supabase
      .from("leads")
      .insert({ ...baseInsert, qualification_step: "modalidade" })
      .select()
      .single();
    if (created.error) {
      created = await supabase.from("leads").insert(baseInsert).select().single();
    }
    if (created.error) throw created.error;
    lead = created.data;
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

  // Qualquer resposta do lead cancela os follow-ups pendentes e registra a
  // tentativa que o recuperou (briefing §6.1).
  await cancelPendingFollowups(supabase, lead.id, "respondeu");

  // Link de indicação (briefing §5.2): a mensagem pré-preenchida do wa.me
  // identifica quem indicou — marca a origem e registra o indicador.
  const referralMatch = payload.message.match(/indicad[oa]\s+por\s+([^.!?\n]{2,60})/i);
  if (referralMatch && (!lead.source || !/indica/i.test(lead.source))) {
    const indicador = referralMatch[1].trim();
    await supabase
      .from("leads")
      .update({ source: "Indicação", campaign: `Indicado por ${indicador}` })
      .eq("id", lead.id);
    lead.source = "Indicação";
    await supabase.from("lead_events").insert({
      lead_id: lead.id,
      event_type: "referral_detected",
      metadata: { indicador },
    });
  }

  // Opt-out: se a mensagem for exatamente uma palavra de descadastro, marca o
  // lead e encerra aqui — não aciona a IA nem responde. (Bloqueia só marketing/
  // follow-up; atendimento iniciado pelo lead continua permitido.)
  const optOutWord = payload.message
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  // Cliques de botão com payload fixo (lembretes de reunião, régua de
  // follow-up). Roteia pela constante, nunca pelo texto visível.
  //
  // Canal não oficial: os botões viram opções numeradas — um dígito solto de
  // um lead JÁ QUALIFICADO é interpretado pelo contexto da última mensagem
  // que a Nina mandou (lembrete → confirmar/remarcar; régua → consultor/
  // dúvida/adiar). Em qualificação, o dígito é resposta de botão e fica.
  let buttonPayload = payload.button_payload || null;
  const bareDigit = payload.message.trim();
  if (!buttonPayload && /^[123]$/.test(bareDigit) && lead.qualification_step === "done") {
    const { data: lastAi } = await supabase
      .from("messages")
      .select("content")
      .eq("conversation_id", conversation.id)
      .eq("sender_type", "ai")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const contexto = lastAi?.content || "";
    if (/Preciso remarcar/i.test(contexto)) {
      buttonPayload = bareDigit === "1" ? "CONFIRMAR_PRESENCA" : bareDigit === "2" ? "REMARCAR" : null;
    } else if (/Falar com consultor/i.test(contexto)) {
      buttonPayload =
        bareDigit === "1" ? "HANDOFF_CONSULTOR" : bareDigit === "2" ? "DUVIDA_IA" : "ADIAR";
    }
  }
  if (buttonPayload === "CONFIRMAR_PRESENCA") {
    const { data: nextAppointment } = await supabase
      .from("appointments")
      .select("id")
      .eq("lead_id", lead.id)
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(1)
      .maybeSingle();
    if (nextAppointment) {
      await supabase
        .from("appointments")
        .update({ status: "confirmed", updated_at: new Date().toISOString() })
        .eq("id", nextAppointment.id);
      await supabase.from("lead_events").insert({
        lead_id: lead.id,
        event_type: "appointment_status_changed",
        metadata: { appointment_id: nextAppointment.id, status: "confirmed", via: "button" },
      });
    }
    const confirmReply = "Presença confirmada! 🎉 Até lá. Qualquer coisa é só chamar por aqui.";
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      lead_id: lead.id,
      sender_type: "ai",
      content: confirmReply,
      status: "sent",
      is_ai: true,
    });
    return { lead_id: lead.id, ai_reply: confirmReply, ai_reply_parts: [confirmReply] };
  }
  if (buttonPayload === "REMARCAR") {
    const { data: upcoming } = await supabase
      .from("appointments")
      .select("id")
      .eq("lead_id", lead.id)
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(1)
      .maybeSingle();
    if (upcoming) {
      await supabase
        .from("appointments")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", upcoming.id);
    }
    try {
      await supabase
        .from("leads")
        .update({ reschedule_count: (lead.reschedule_count || 0) + 1 })
        .eq("id", lead.id);
      lead.reschedule_count = (lead.reschedule_count || 0) + 1;
    } catch {
      // coluna ainda sem migração — segue sem contar
    }
    await supabase.from("lead_events").insert({
      lead_id: lead.id,
      event_type: "reschedule_requested",
      metadata: { via: "button", count: lead.reschedule_count || 0 },
    });
    // Segue para a IA com o pedido em texto (a regra do motor decide se
    // oferece horários ou transfere na 3ª vez).
  }


  // Botões da régua de follow-up (payloads fixos — briefing §6.3).
  if (buttonPayload === "HANDOFF_CONSULTOR") {
    const hotStage = stageByRole.get("hot_lead");
    if (hotStage && lead.stage_id !== hotStage.id) {
      await supabase
        .from("leads")
        .update({ stage_id: hotStage.id, updated_at: new Date().toISOString() })
        .eq("id", lead.id);
    }
    await cancelPendingFollowups(supabase, lead.id, "cancelado");
    const { data: operationsRowBtn } = await supabase
      .from("ai_settings")
      .select("global_prompt")
      .eq("name", "__operations__")
      .maybeSingle();
    const operationsBtn = parseOperationsSettings(operationsRowBtn?.global_prompt);
    const notificationBtn = buildCloserNotification(
      operationsBtn,
      lead,
      `RESPONDEU FOLLOW-UP — quer falar com o consultor. ${lead.summary || ""}`,
    );
    if (notificationBtn.phone && notificationBtn.templateName) {
      try {
        await sendWhatsAppTemplate(
          notificationBtn.phone,
          notificationBtn.templateName,
          operationsBtn.language_code,
          notificationBtn.params,
        );
        await supabase.from("lead_events").insert({
          lead_id: lead.id,
          event_type: "closer_notified",
          metadata: { via: "followup_button", closer_phone: notificationBtn.phone },
        });
      } catch {
        // notificação falhou; o lead segue na fila mesmo assim
      }
    }
    const handoffReply =
      "Perfeito! Já avisei nosso consultor — ele vai falar com você em instantes. 😊";
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      lead_id: lead.id,
      sender_type: "ai",
      content: handoffReply,
      status: "sent",
      is_ai: true,
    });
    return {
      lead,
      conversation,
      ai_reply: handoffReply,
      ai_reply_parts: [handoffReply],
      stage: newStage,
      skipped_ai: true,
    };
  }
  if (buttonPayload === "ADIAR") {
    await cancelPendingFollowups(supabase, lead.id, "cancelado");
    const nqStage = stageByRole.get("not_qualified");
    if (nqStage) {
      await supabase
        .from("leads")
        .update({ stage_id: nqStage.id, updated_at: new Date().toISOString() })
        .eq("id", lead.id);
    }
    try {
      await supabase.from("followups").insert({
        lead_id: lead.id,
        stage_role: "not_qualified",
        attempt: 1,
        scheduled_for: new Date(Date.now() + 60 * 86400000).toISOString(),
        status: "pendente",
      });
    } catch {
      // tabela ainda sem migração
    }
    const adiarReply =
      "Tranquilo! Vou deixar seu contato guardado e daqui um tempo volto pra saber se faz sentido. Qualquer coisa antes disso, é só chamar. 😊";
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      lead_id: lead.id,
      sender_type: "ai",
      content: adiarReply,
      status: "sent",
      is_ai: true,
    });
    return {
      lead,
      conversation,
      ai_reply: adiarReply,
      ai_reply_parts: [adiarReply],
      stage: newStage,
      skipped_ai: true,
    };
  }
  if (buttonPayload === "OPTOUT") {
    await Promise.all([
      supabase.from("leads").update({ blocked_at: new Date().toISOString() }).eq("id", lead.id),
      cancelPendingFollowups(supabase, lead.id, "cancelado"),
      supabase
        .from("lead_events")
        .insert({ lead_id: lead.id, event_type: "contact_blocked", metadata: { via: "button" } }),
    ]);
    const optoutReply = "Entendido! Não vou mais te mandar mensagens. Se mudar de ideia, é só chamar por aqui. 👋";
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      lead_id: lead.id,
      sender_type: "ai",
      content: optoutReply,
      status: "sent",
      is_ai: true,
    });
    return {
      lead,
      conversation,
      ai_reply: optoutReply,
      ai_reply_parts: [optoutReply],
      stage: newStage,
      skipped_ai: true,
    };
  }
  // DUVIDA_IA: segue direto para a IA responder (pendentes já cancelados).

  if (["sair", "parar", "cancelar", "descadastrar"].includes(optOutWord)) {
    const optedOutAt = new Date().toISOString();
    await Promise.all([
      supabase.from("leads").update({ opted_out_at: optedOutAt }).eq("id", lead.id),
      supabase
        .from("lead_events")
        .insert({ lead_id: lead.id, event_type: "opted_out", metadata: { keyword: optOutWord } }),
    ]);
    return {
      lead: { ...lead, opted_out_at: optedOutAt },
      conversation,
      ai_reply: null,
      ai_reply_parts: [] as string[],
      stage: newStage,
      skipped_ai: true,
    };
  }

  // ── Qualificação por botões (briefing §1): enquanto a sequência não
  // terminar, quem conversa é o fluxo fixo — a IA só assume depois.
  const qualStep = lead.qualification_step;
  if (qualStep && qualStep !== "done") {
    // Primeira interação = ainda não enviamos nenhuma pergunta.
    const { data: alreadyAsked } = await supabase
      .from("lead_events")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("event_type", "qualification_question_sent")
      .limit(1)
      .maybeSingle();
    const result = advanceQualification(
      lead,
      payload.message,
      buttonPayload,
      !alreadyAsked,
    );
    if (Object.keys(result.updates).length) {
      const { data: updatedLead, error: qualError } = await supabase
        .from("leads")
        .update({ ...result.updates, updated_at: new Date().toISOString() })
        .eq("id", lead.id)
        .select()
        .single();
      if (!qualError && updatedLead) lead = updatedLead;
    }
    if (result.question) {
      const optionsSuffix = result.question.buttons.length
        ? `\n${result.question.buttons.map((b) => `▫️ ${b.title}`).join("  ")}`
        : "";
      if (await isAnyWhatsAppChannelReady()) {
        try {
          if (result.question.buttons.length) {
            await sendWhatsAppButtons(lead.phone, result.question.body, result.question.buttons);
          } else {
            const { sendWhatsAppMessage } = await import("@/lib/whatsapp");
            await sendWhatsAppMessage(lead.phone, result.question.body);
          }
        } catch (sendError) {
          // Falha de envio não derruba o fluxo, mas deixa rastro no
          // diagnóstico (/api/settings/ai/whatsapp-status).
          const { zapiLogIssue } = await import("@/lib/zapi");
          await zapiLogIssue(
            `pergunta de qualificação não enviada: ${sendError instanceof Error ? sendError.message : String(sendError)}`,
            lead.phone,
          );
        }
      }
      await Promise.all([
        supabase.from("messages").insert({
          conversation_id: conversation.id,
          lead_id: lead.id,
          sender_type: "ai",
          content: `${result.question.body}${optionsSuffix}`,
          status: "sent",
          is_ai: true,
        }),
        supabase.from("lead_events").insert({
          lead_id: lead.id,
          event_type: "qualification_question_sent",
          metadata: { step: lead.qualification_step || qualStep, understood: result.understood },
        }),
      ]);
      return {
        lead,
        conversation,
        ai_reply: null,
        ai_reply_parts: [] as string[],
        stage: newStage,
        skipped_ai: true,
      };
    }
    // Sequência concluída neste turno: a IA assume já com os dados coletados.
  }

  if (!lead.ai_enabled || lead.human_takeover) {
    return {
      lead,
      conversation,
      ai_reply: null,
      ai_reply_parts: [] as string[],
      stage: stageByRole.get("closer_owns") || newStage,
      skipped_ai: true,
    };
  }

  // Debounce: o lead costuma mandar em pedaços. Espera alguns segundos; se
  // chegar mensagem mais nova nesse meio, esta execução para e deixa a
  // invocação da última mensagem responder — considerando todas juntas.
  // (No simulador não faz sentido; só vale para o WhatsApp real.)
  if (payload.source !== "simulador") {
    // Espera adaptativa: se a Nina acabou de fazer VÁRIAS perguntas, o lead
    // tende a responder picado e mais devagar — então esperamos bastante para
    // juntar todos os pedaços antes de responder. Numa troca normal, a espera
    // é curta para a resposta continuar rápida.
    const { data: lastAi } = await supabase
      .from("messages")
      .select("content")
      .eq("lead_id", lead.id)
      .eq("sender_type", "ai")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const questionCount = ((lastAi?.content || "").match(/\?/g) || []).length;
    const currentIsShort = payload.message.trim().length <= 25;
    // Nina fez 2+ perguntas, ou a mensagem atual parece um fragmento curto
    // (provável começo de uma resposta em pedaços): espera longa. Senão, curta.
    const DEBOUNCE_MS = questionCount >= 2 || currentIsShort ? 14000 : 6000;
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS));
    const { data: latestInbound } = await supabase
      .from("messages")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("sender_type", "lead")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestInbound && latestInbound.id !== insertedMessage.data.id) {
      return {
        lead,
        conversation,
        ai_reply: null,
        ai_reply_parts: [] as string[],
        stage: newStage,
        skipped_ai: true,
      };
    }
  }

  const stagePromptKey = `__stage__:${lead.stage_id}`;
  const [
    { data: settings, error: settingsError },
    { data: messages, error: messagesError },
    { data: stagePromptRow, error: stagePromptError },
  ] =
    await Promise.all([
      supabase.from("ai_settings").select("*").order("created_at").limit(1).single(),
      // As 30 mensagens MAIS RECENTES (ordem desc no banco); revertidas abaixo
      // para a ordem cronológica que o modelo espera.
      supabase
        .from("messages")
        .select("*")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("ai_settings")
        .select("global_prompt")
        .eq("name", stagePromptKey)
        .maybeSingle(),
    ]);
  if (settingsError) throw settingsError;
  if (messagesError) throw messagesError;
  if (stagePromptError) throw stagePromptError;
  const orderedMessages = ((messages as Message[]) || []).slice().reverse();

  try {
    const now = new Date().toISOString().slice(0, 10);
    const [{ data: knowledge }, { data: slots }] = await Promise.all([
      supabase
        .from("knowledge_articles")
        .select("title, category, content, unit, valid_from, valid_until, priority")
        .eq("status", "published")
        .eq("visibility", "customer")
        // Sistema exclusivo de Chapecó: artigos legados de Passo Fundo ficam
        // fora do contexto da IA (unit nula continua valendo pra todos).
        .or("unit.is.null,unit.not.ilike.%passo%")
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
    const slotsContext = `${slotRulesPrompt()}\n\nHorários da semana:\n${availableSlots}`;
    const { data: operationsPromptRow } = await supabase
      .from("ai_settings")
      .select("global_prompt")
      .eq("name", "__operations__")
      .maybeSingle();
    const operationsForPrompt = parseOperationsSettings(operationsPromptRow?.global_prompt);
    const decision = await runSdr({
      lead,
      settings,
      messages: orderedMessages,
      stagePrompt: `${
        lead.qualification_step === "done"
          ? `${renderPostQualificationPrompt(
              operationsForPrompt.post_qualification_prompt || DEFAULT_POST_QUALIFICATION_PROMPT,
              lead,
              operationsForPrompt.situational_prompts,
            )}\n\n`
          : ""
      }${
        stagePromptRow?.global_prompt ||
        defaultStagePrompts[
          (stages as PipelineStage[]).find((stage) => stage.id === lead.stage_id)?.role || ""
        ] ||
        ""
      }`,
      knowledgeContext: knowledgeContext || null,
      availableSlots: slotsContext,
    });
    const stageRole = resolveSuggestedStage(decision, lead);
    const targetStage = stageByRole.get(stageRole) || stageByRole.get("ai_service")!;
    // Sistema exclusivo de Chapecó: mesmo que o modelo escorregue, nunca
    // gravamos outra cidade como unidade.
    if (/passo/i.test(String(decision.extracted?.unit_interest || ""))) {
      decision.extracted.unit_interest = null;
    }
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

    // A Nina pode responder em 1-5 bolhas; grava cada uma como mensagem própria.
    const replyParts = decision.reply_messages;
    // Regra das 24h (FASE 0.1): o gatilho é sempre uma mensagem recente do lead,
    // então normalmente estamos dentro da janela. O guarda cobre o caso extremo
    // de atraso: fora da janela, grava como blocked_24h e NÃO envia (o webhook
    // só envia quando ai_reply volta preenchido).
    const withinWindow =
      Date.now() - new Date(insertedMessage.data.created_at).getTime() < 24 * 60 * 60 * 1000;
    const aiMessage = await supabase
      .from("messages")
      .insert(
        replyParts.map((content) => ({
          conversation_id: conversation.id,
          lead_id: lead.id,
          sender_type: "ai",
          content,
          status: withinWindow ? "sent" : "blocked_24h",
          is_ai: true,
        })),
      );
    if (aiMessage.error) throw aiMessage.error;
    if (!withinWindow) {
      await supabase.from("lead_events").insert({
        lead_id: lead.id,
        event_type: "window_expired",
        metadata: { blocked_parts: replyParts.length },
      });
    }
    await supabase.from("lead_events").insert({
      lead_id: lead.id,
      event_type: "ai_qualified",
      metadata: { stage: targetStage.name, stage_role: stageRole, temperature: decision.temperature },
    });

    // Etiquetas que forçam a transferência ao closer com destaque na
    // notificação (briefing §4): experimental e difícil agendamento.
    let forceCloserPrefix: string | null = null;
    const addTag = async (tag: string) => {
      try {
        const tags = Array.isArray(lead.tags) ? lead.tags : [];
        if (!tags.includes(tag)) {
          await supabase.from("leads").update({ tags: [...tags, tag] }).eq("id", lead.id);
          lead.tags = [...tags, tag];
        }
      } catch {
        // coluna ainda sem migração
      }
    };

    if (
      decision.appointment?.should_schedule &&
      decision.appointment.type === "experimental_class" &&
      !decision.appointment.starts_at
    ) {
      // Experimental: a IA não fecha horário — closer conduz (briefing §4.2).
      await addTag("Experimental");
      forceCloserPrefix = `AULA EXPERIMENTAL — turno preferido: ${lead.availability || "não informado"}. `;
    } else if (
      decision.appointment?.should_schedule &&
      decision.appointment.type &&
      decision.appointment.starts_at
    ) {
      const startsAt = new Date(decision.appointment.starts_at);
      const duration = 30;
      const ruleViolation = validateSlotRules(startsAt);
      if (
        !Number.isNaN(startsAt.getTime()) &&
        startsAt.getTime() > Date.now() &&
        !ruleViolation
      ) {
        const endsAt = new Date(startsAt.getTime() + duration * 60_000);
        const [{ data: conflict }, closed] = await Promise.all([
          supabase
            .from("appointments")
            .select("id")
            .lt("starts_at", endsAt.toISOString())
            .gt("ends_at", startsAt.toISOString())
            .in("status", ["scheduled", "confirmed"])
            .limit(1)
            .maybeSingle(),
          isBlocked(supabase, startsAt, endsAt),
        ]);
        // Já existe reunião futura? Então isto é uma REMARCAÇÃO.
        const { data: upcoming } = await supabase
          .from("appointments")
          .select("id")
          .eq("lead_id", lead.id)
          .in("status", ["scheduled", "confirmed"])
          .gte("starts_at", new Date().toISOString())
          .neq("starts_at", startsAt.toISOString())
          .limit(1)
          .maybeSingle();
        let allowBooking = !conflict && !closed;
        if (upcoming && allowBooking) {
          if ((lead.reschedule_count || 0) >= 2) {
            // 3ª remarcação: não agenda — transfere com etiqueta.
            allowBooking = false;
            await addTag("Difícil agendamento");
            forceCloserPrefix = "DIFÍCIL AGENDAMENTO (3ª remarcação) — ajudar o lead a fechar horário. ";
          } else {
            await supabase
              .from("appointments")
              .update({ status: "cancelled", updated_at: new Date().toISOString() })
              .eq("id", upcoming.id);
            try {
              await supabase
                .from("leads")
                .update({ reschedule_count: (lead.reschedule_count || 0) + 1 })
                .eq("id", lead.id);
            } catch {
              // coluna ainda sem migração
            }
          }
        }
        if (allowBooking) {
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

    // O teste de nível NÃO é mais enviado automaticamente pela IA. O closer
    // gera o link manualmente na aba "Testes de nível" quando fizer sentido.

    if (forceCloserPrefix) {
      // Move o lead para a fila do vendedor (Qualificado).
      const hotStage = (stages as PipelineStage[]).find((stage) => stage.role === "hot_lead");
      if (hotStage && lead.stage_id !== hotStage.id) {
        await supabase
          .from("leads")
          .update({ stage_id: hotStage.id, updated_at: new Date().toISOString() })
          .eq("id", lead.id);
      }
    }
    if (decision.should_handoff || stageRole === "handoff" || forceCloserPrefix) {
      const { data: operationsRow } = await supabase
        .from("ai_settings")
        .select("global_prompt")
        .eq("name", "__operations__")
        .maybeSingle();
      const operations = parseOperationsSettings(operationsRow?.global_prompt);
      const notification = buildCloserNotification(
        operations,
        lead,
        `${forceCloserPrefix || ""}${lead.summary || decision.summary || "Sem resumo"}`,
      );
      const closerPhone = notification.phone;
      if (operations.closer_enabled && closerPhone && notification.templateName) {
        const { data: alreadyNotified } = await supabase
          .from("lead_events")
          .select("id")
          .eq("lead_id", lead.id)
          .eq("event_type", "closer_notified")
          .limit(1)
          .maybeSingle();
        if (!alreadyNotified || forceCloserPrefix) {
          try {
            const sent = await sendWhatsAppTemplate(
              closerPhone,
              notification.templateName,
              operations.language_code,
              notification.params,
            );
            await supabase.from("lead_events").insert({
              lead_id: lead.id,
              event_type: "closer_notified",
              metadata: {
                closer_phone: closerPhone,
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

    return {
      lead,
      conversation,
      // Fora da janela de 24h não devolve resposta: fica gravada como
      // blocked_24h e o webhook não envia texto livre recusado pela Meta.
      ai_reply: withinWindow ? replyParts.join("\n\n") : null,
      ai_reply_parts: withinWindow ? replyParts : [],
      stage: targetStage,
      skipped_ai: false,
    };
  } catch (error) {
    await supabase.from("lead_events").insert({
      lead_id: lead.id,
      event_type: "ai_error",
      metadata: { message: error instanceof Error ? error.message : "Erro desconhecido" },
    });
    throw error;
  }
}
