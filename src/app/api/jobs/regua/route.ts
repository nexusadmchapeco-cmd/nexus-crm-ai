import { NextResponse } from "next/server";
import { parseOperationsSettings } from "@/lib/operations";
import { cancelPendingFollowups, reguaConfigFor, sendReguaTemplate } from "@/lib/regua";
import { createAdminClient } from "@/lib/supabase/admin";
import { isWhatsAppConfigured } from "@/lib/whatsapp";

export const maxDuration = 60;

// Régua automática por etapa (briefing §6.1/6.2). Roda a cada 30 min:
// 1) agenda tentativas para leads elegíveis (última mensagem foi da IA e o
//    tempo da cadência passou);
// 2) envia as tentativas vencidas via template aprovado.
// A tentativa 1 (livre, ~2h) é do job de nudges; aqui começam da 2ª.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  if (!isWhatsAppConfigured()) {
    return NextResponse.json({ ok: true, sent: 0, reason: "WhatsApp não configurado" });
  }

  try {
    const supabase = createAdminClient();
    const now = new Date();

    const { data: stages } = await supabase.from("pipeline_stages").select("id, role");
    const roleById = new Map((stages || []).map((s) => [s.id, s.role]));

    const { data: operationsRow } = await supabase
      .from("ai_settings")
      .select("global_prompt")
      .eq("name", "__operations__")
      .maybeSingle();
    const operations = parseOperationsSettings(operationsRow?.global_prompt);

    // ── 1) Agendar próximas tentativas
    const { data: candidates, error: candidatesError } = await supabase
      .from("leads")
      .select("id, name, phone, objective, stage_id, last_message_at, human_takeover, opted_out_at, blocked_at")
      .eq("human_takeover", false)
      .is("opted_out_at", null)
      .is("blocked_at", null)
      .lt("last_message_at", new Date(now.getTime() - 20 * 3600000).toISOString())
      .gte("last_message_at", new Date(now.getTime() - 90 * 86400000).toISOString())
      .limit(200);
    if (candidatesError) {
      return NextResponse.json(
        { ok: false, reason: "Tabela/colunas da régua ausentes — rode a migração 015." },
        { status: 200 },
      );
    }

    let scheduled = 0;
    for (const lead of candidates || []) {
      const role = roleById.get(lead.stage_id) || "";
      const config = reguaConfigFor(role);
      if (!config) continue;

      // Já tem tentativa pendente/enviada para este ciclo?
      const { data: existing } = await supabase
        .from("followups")
        .select("id, attempt, status, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Última mensagem precisa ser da IA/equipe (lead sem resposta).
      const { data: lastMessage } = await supabase
        .from("messages")
        .select("sender_type, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastMessage || lastMessage.sender_type === "lead") continue;

      const cycleStart = new Date(lead.last_message_at).getTime();
      const nextAttempt =
        existing && existing.created_at > lead.last_message_at && existing.status !== "cancelado"
          ? existing.status === "pendente"
            ? null // já agendada
            : existing.attempt + 1
          : 1;
      if (nextAttempt === null) continue;
      if (nextAttempt > config.delaysHours.length) continue;

      const dueAt = new Date(cycleStart + config.delaysHours[nextAttempt - 1] * 3600000);
      const { error: insertError } = await supabase.from("followups").insert({
        lead_id: lead.id,
        stage_role: role,
        attempt: nextAttempt,
        scheduled_for: dueAt.toISOString(),
        status: "pendente",
      });
      if (!insertError) scheduled += 1;
    }

    // ── 2) Enviar tentativas vencidas
    const { data: due } = await supabase
      .from("followups")
      .select("id, lead_id, stage_role, attempt, lead:leads(id, name, phone, objective, stage_id, human_takeover, opted_out_at, blocked_at)")
      .eq("status", "pendente")
      .lte("scheduled_for", now.toISOString())
      .limit(40);

    let sent = 0;
    const errors: string[] = [];
    for (const followup of due || []) {
      const lead = followup.lead as unknown as {
        id: string;
        name: string | null;
        phone: string;
        objective: string | null;
        stage_id: string;
        human_takeover: boolean;
        opted_out_at: string | null;
        blocked_at: string | null;
      } | null;
      if (!lead || lead.opted_out_at || lead.blocked_at || lead.human_takeover) {
        await supabase.from("followups").update({ status: "cancelado" }).eq("id", followup.id);
        continue;
      }
      // Lead mudou de etapa para fora da régua? cancela.
      const currentRole = roleById.get(lead.stage_id) || "";
      if (!reguaConfigFor(currentRole)) {
        await supabase.from("followups").update({ status: "cancelado" }).eq("id", followup.id);
        continue;
      }
      try {
        const { template } = await sendReguaTemplate(
          lead,
          followup.stage_role,
          followup.attempt,
          operations.language_code,
        );
        await Promise.all([
          supabase
            .from("followups")
            .update({ status: "enviado", sent_at: new Date().toISOString(), template_name: template })
            .eq("id", followup.id),
          supabase.from("lead_events").insert({
            lead_id: lead.id,
            event_type: "followup_sent",
            metadata: {
              regua: true,
              attempt: followup.attempt,
              stage_role: followup.stage_role,
              template_name: template,
              delay_minutes: followup.attempt * 1440,
            },
          }),
        ]);
        sent += 1;
      } catch (sendError) {
        errors.push(`${lead.id}: ${sendError instanceof Error ? sendError.message : "erro"}`);
      }
    }

    return NextResponse.json({ ok: true, scheduled, sent, errors: errors.slice(0, 5) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro na régua." },
      { status: 500 },
    );
  }
}
