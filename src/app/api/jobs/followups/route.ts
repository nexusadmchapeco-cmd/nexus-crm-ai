import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/level-test";
import { parseOperationsSettings } from "@/lib/operations";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppMessage, sendWhatsAppTemplate } from "@/lib/whatsapp";

function labelForDelay(minutes: number) {
  if (minutes % 1440 === 0) return `D+${minutes / 1440}`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}min`;
}

function personalize(message: string, lead: Record<string, string | null>) {
  return message
    .replaceAll("{{nome}}", lead.name || "tudo bem")
    .replaceAll("{{objetivo}}", lead.objective || "seu objetivo")
    .replaceAll("{{cidade}}", lead.city || "sua cidade");
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    // Lembrete do teste de nível: quem recebeu o link há 18h+ e não concluiu
    // ganha um único lembrete. Mensagem livre: se a janela de 24h do WhatsApp
    // já fechou, a Meta rejeita e registramos o erro sem travar o job.
    let testRemindersSent = 0;
    try {
      const reminderWindowStart = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
      const reminderDue = new Date(Date.now() - 18 * 60 * 60_000).toISOString();
      const { data: pendingTests } = await supabase
        .from("level_tests")
        .select("id, lead_id, created_at, leads(id, name, phone)")
        .in("status", ["pending", "in_progress"])
        .gte("created_at", reminderWindowStart)
        .lte("created_at", reminderDue);
      for (const test of pendingTests || []) {
        const leadRow = test.leads as unknown as { id: string; name: string | null; phone: string | null } | null;
        if (!leadRow?.phone) continue;
        const { data: alreadyReminded } = await supabase
          .from("lead_events")
          .select("id")
          .eq("lead_id", test.lead_id)
          .eq("event_type", "level_test_reminder")
          .limit(1)
          .maybeSingle();
        if (alreadyReminded) continue;
        const testUrl = `${appBaseUrl()}/teste/${test.id}`;
        const reminderMessage = `Oi${leadRow.name ? `, ${String(leadRow.name).split(" ")[0]}` : ""}! Você chegou a fazer o teste de nível de inglês? É rapidinho (2 min) e ajuda a gente a montar o plano ideal pra você: ${testUrl}`;
        try {
          await sendWhatsAppMessage(leadRow.phone, reminderMessage);
          const { data: conversationRow } = await supabase
            .from("conversations")
            .select("id")
            .eq("lead_id", test.lead_id)
            .maybeSingle();
          await Promise.all([
            conversationRow
              ? supabase.from("messages").insert({
                  conversation_id: conversationRow.id,
                  lead_id: test.lead_id,
                  sender_type: "ai",
                  content: reminderMessage,
                  status: "sent",
                  is_ai: true,
                })
              : Promise.resolve(),
            supabase.from("lead_events").insert({
              lead_id: test.lead_id,
              event_type: "level_test_reminder",
              metadata: { level_test_id: test.id },
            }),
          ]);
          testRemindersSent += 1;
        } catch (reminderError) {
          await supabase.from("lead_events").insert({
            lead_id: test.lead_id,
            event_type: "level_test_reminder_error",
            metadata: {
              level_test_id: test.id,
              message: reminderError instanceof Error ? reminderError.message : "erro",
            },
          });
        }
      }
    } catch {
      // tabela level_tests ausente ou erro pontual: segue o job normalmente
    }

    const [
      { data: sequence, error: sequenceError },
      { data: operationsRow, error: operationsError },
    ] = await Promise.all([
      supabase
        .from("followup_sequences")
        .select("*")
        .eq("active", true)
        .order("created_at")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("ai_settings")
        .select("global_prompt")
        .eq("name", "__operations__")
        .maybeSingle(),
    ]);
    if (sequenceError) throw sequenceError;
    if (operationsError) throw operationsError;
    if (!sequence) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        level_test_reminders: testRemindersSent,
        reason: "Sequência pausada",
      });
    }

    const operations = parseOperationsSettings(operationsRow?.global_prompt);
    const [
      { data: steps, error: stepsError },
      { data: leads, error: leadsError },
      { data: notQualifiedStage, error: notQualifiedError },
    ] = await Promise.all([
      supabase
        .from("followup_steps")
        .select("*")
        .eq("sequence_id", sequence.id)
        .order("delay_minutes"),
      supabase
        .from("leads")
        .select("*")
        .eq("stage_id", sequence.trigger_stage_id)
        .eq("human_takeover", false),
      supabase.from("pipeline_stages").select("id").eq("role", "not_qualified").maybeSingle(),
    ]);
    if (stepsError) throw stepsError;
    if (leadsError) throw leadsError;
    if (notQualifiedError) throw notQualifiedError;

    let sentCount = 0;
    let disqualifiedCount = 0;
    const errors: string[] = [];
    for (const lead of leads || []) {
      const [
        { data: lastInbound },
        { data: sentEvents },
        { data: conversation },
      ] = await Promise.all([
        supabase
          .from("messages")
          .select("created_at")
          .eq("lead_id", lead.id)
          .eq("sender_type", "lead")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("lead_events")
          .select("metadata")
          .eq("lead_id", lead.id)
          .eq("event_type", "followup_sent"),
        supabase
          .from("conversations")
          .select("id")
          .eq("lead_id", lead.id)
          .maybeSingle(),
      ]);
      if (!lastInbound || !conversation) continue;

      const completedDelays = new Set(
        (sentEvents || []).map((event) => Number(event.metadata?.delay_minutes)),
      );
      const elapsedMinutes =
        (Date.now() - new Date(lastInbound.created_at).getTime()) / 60000;
      const dueStep = (steps || []).find(
        (step) =>
          step.delay_minutes <= elapsedMinutes &&
          !completedDelays.has(Number(step.delay_minutes)),
      );
      if (!dueStep) {
        const exhausted = (steps || []).length > 0 && completedDelays.size >= (steps || []).length;
        if (exhausted && notQualifiedStage) {
          const { error: disqualifyError } = await supabase
            .from("leads")
            .update({ stage_id: notQualifiedStage.id, updated_at: new Date().toISOString() })
            .eq("id", lead.id);
          if (!disqualifyError) {
            await supabase.from("lead_events").insert({
              lead_id: lead.id,
              event_type: "ai_disqualified",
              metadata: { reason: "no_response", followups_sent: completedDelays.size },
            });
            disqualifiedCount += 1;
          }
        }
        continue;
      }

      const message = personalize(dueStep.message, lead);
      const templateName =
        operations.followup_template_names[String(dueStep.delay_minutes)] ||
        operations.followup_template_name;
      if (!templateName) {
        errors.push(
          `${lead.id}: modelo não configurado para ${labelForDelay(dueStep.delay_minutes)}`,
        );
        continue;
      }
      try {
        const result = await sendWhatsAppTemplate(
          lead.phone,
          templateName,
          operations.language_code,
          [lead.name || "tudo bem"],
        );
        const whatsappMessageId = result?.messages?.[0]?.id || null;
        await Promise.all([
          supabase.from("messages").insert({
            conversation_id: conversation.id,
            lead_id: lead.id,
            sender_type: "ai",
            content: message,
            whatsapp_message_id: whatsappMessageId,
            status: "sent",
            is_ai: true,
          }),
          supabase.from("lead_events").insert({
            lead_id: lead.id,
            event_type: "followup_sent",
            metadata: {
              label: labelForDelay(dueStep.delay_minutes),
              delay_minutes: dueStep.delay_minutes,
              template_name: templateName,
              message,
              whatsapp_message_id: whatsappMessageId,
            },
          }),
        ]);
        sentCount += 1;
      } catch (error) {
        errors.push(`${lead.id}: ${error instanceof Error ? error.message : "erro"}`);
      }
    }

    return NextResponse.json({
      ok: true,
      sent: sentCount,
      disqualified: disqualifiedCount,
      level_test_reminders: testRemindersSent,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao processar follow-ups" },
      { status: 500 },
    );
  }
}
