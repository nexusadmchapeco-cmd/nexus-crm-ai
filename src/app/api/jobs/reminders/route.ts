import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWithin24hWindow } from "@/lib/whatsapp-window";
import { isAnyWhatsAppChannelReady, isWhatsAppConfigured, sendWhatsAppMessage, sendWhatsAppTemplate } from "@/lib/whatsapp";
import { renderTemplateAsText, zapiActive } from "@/lib/zapi";
import { parseOperationsSettings } from "@/lib/operations";

export const maxDuration = 60;

// Lembretes de confirmação de reunião (briefing §3.3): 2 por reunião.
// 1º na véspera (janela de 20h–28h antes), 2º ~2h antes (1h30–2h30).
// Dentro da janela de 24h vai texto livre com a pergunta; fora, o template
// aprovado "confirmacao_reuniao" com botões Sim/Preciso remarcar.
// Roda junto com o cron de 30 em 30 minutos.

const REMINDERS = [
  { stage: 1, minHours: 20, maxHours: 28 },
  { stage: 2, minHours: 1.5, maxHours: 2.5 },
];

function spDateTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!(await isAnyWhatsAppChannelReady())) {
    return NextResponse.json({ ok: true, sent: 0, reason: "WhatsApp não configurado" });
  }

  try {
    const supabase = createAdminClient();
    const now = Date.now();
    const horizon = new Date(now + 30 * 3600000).toISOString();

    const { data: appointments } = await supabase
      .from("appointments")
      .select("id, title, type, starts_at, status, lead:leads(id, name, phone, opted_out_at, blocked_at)")
      .in("status", ["scheduled", "confirmed"])
      .gte("starts_at", new Date(now).toISOString())
      .lte("starts_at", horizon)
      .limit(50);

    const { data: operationsRow } = await supabase
      .from("ai_settings")
      .select("global_prompt")
      .eq("name", "__operations__")
      .maybeSingle();
    const operations = parseOperationsSettings(operationsRow?.global_prompt);

    let sent = 0;
    const errors: string[] = [];

    for (const appointment of appointments || []) {
      const lead = appointment.lead as unknown as {
        id: string;
        name: string | null;
        phone: string;
        opted_out_at: string | null;
        blocked_at?: string | null;
      } | null;
      if (!lead || lead.opted_out_at || lead.blocked_at) continue;
      const hoursUntil = (new Date(appointment.starts_at).getTime() - now) / 3600000;

      for (const reminder of REMINDERS) {
        if (hoursUntil < reminder.minHours || hoursUntil > reminder.maxHours) continue;
        const { data: already } = await supabase
          .from("lead_events")
          .select("id")
          .eq("lead_id", lead.id)
          .eq("event_type", "appointment_reminder_sent")
          .contains("metadata", { appointment_id: appointment.id, stage: reminder.stage })
          .limit(1)
          .maybeSingle();
        if (already) continue;

        const quando = spDateTime(appointment.starts_at);
        const tipo = appointment.type === "closer_meeting" ? "reunião" : "aula experimental";
        try {
          const inWindow = await isWithin24hWindow(supabase, lead.id);
          if (inWindow) {
            const text =
              reminder.stage === 1
                ? `Oi${lead.name ? `, ${lead.name.split(" ")[0]}` : ""}! Passando pra confirmar sua ${tipo} amanhã: ${quando}. Posso confirmar sua presença? Se precisar remarcar, é só me avisar por aqui. 😊`
                : `Oi${lead.name ? `, ${lead.name.split(" ")[0]}` : ""}! Sua ${tipo} é daqui a pouco, às ${quando.slice(-5)}. Confirmada? Qualquer imprevisto me avisa que a gente remarca.`;
            await sendWhatsAppMessage(lead.phone, text);
            const { data: conversation } = await supabase
              .from("conversations")
              .select("id")
              .eq("lead_id", lead.id)
              .maybeSingle();
            if (conversation) {
              await supabase.from("messages").insert({
                conversation_id: conversation.id,
                lead_id: lead.id,
                sender_type: "ai",
                content: text,
                status: "sent",
                is_ai: true,
              });
            }
          } else {
            // Fora da janela: template aprovado com botões (payloads fixos
            // CONFIRMAR_PRESENCA / REMARCAR tratados no webhook).
            await sendWhatsAppTemplate(
              lead.phone,
              "confirmacao_reuniao",
              operations.language_code,
              [lead.name?.split(" ")[0] || "tudo bem", quando],
              ["CONFIRMAR_PRESENCA", "REMARCAR"],
            );
            const { data: reminderConversation } = await supabase
              .from("conversations")
              .select("id")
              .eq("lead_id", lead.id)
              .maybeSingle();
            if (reminderConversation) {
              await supabase.from("messages").insert({
                conversation_id: reminderConversation.id,
                lead_id: lead.id,
                sender_type: "ai",
                content: (await zapiActive())
                  ? renderTemplateAsText("confirmacao_reuniao", [
                      lead.name?.split(" ")[0] || "tudo bem",
                      quando,
                    ])
                  : `📅 Lembrete de confirmação enviado (modelo confirmacao_reuniao).`,
                status: "sent",
                is_ai: true,
              });
            }
          }
          await supabase.from("lead_events").insert({
            lead_id: lead.id,
            event_type: "appointment_reminder_sent",
            metadata: {
              appointment_id: appointment.id,
              stage: reminder.stage,
              starts_at: appointment.starts_at,
            },
          });
          sent += 1;
        } catch (sendError) {
          errors.push(`${lead.id}: ${sendError instanceof Error ? sendError.message : "erro"}`);
        }
      }
    }

    return NextResponse.json({ ok: true, sent, errors: errors.slice(0, 5) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro nos lembretes." },
      { status: 500 },
    );
  }
}
