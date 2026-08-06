// Régua automática de follow-up por etapa do Kanban (briefing §6).
// Tentativa 1 (~2h, dentro da janela de 24h) é a retomada LIVRE da IA — feita
// pelo job de nudges. As tentativas seguintes saem daqui: templates aprovados
// por etapa, com botões de resposta rápida roteados por payload fixo.
//
// Fallback: enquanto os templates novos (followup_<etapa>_N) não forem
// aprovados na Meta, cai nos followup_ctx_dia* já aprovados.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

export const REGUA_BUTTON_PAYLOADS = ["HANDOFF_CONSULTOR", "DUVIDA_IA", "ADIAR"];

// Cadência por role da etapa: delays (em horas) após a última mensagem do
// lead, a partir da 2ª tentativa (a 1ª é o nudge livre de 2h).
const CADENCIAS: Record<string, { key: string; delaysHours: number[] }> = {
  ai_service: { key: "contato", delaysHours: [24, 72, 168] },
  qualifying: { key: "info", delaysHours: [24, 72, 168] },
  hot_lead: { key: "qualificado", delaysHours: [24, 72, 168] },
  // Reengajamento de não qualificado: ~2 meses, tentativa única.
  not_qualified: { key: "naoqualif", delaysHours: [1440] },
};

const FALLBACK_TEMPLATES = ["followup_ctx_dia1", "followup_ctx_dia3", "followup_ctx_dia7"];

export function reguaConfigFor(stageRole: string) {
  return CADENCIAS[stageRole] || null;
}

export function templateNameFor(stageRole: string, attempt: number) {
  const config = CADENCIAS[stageRole];
  if (!config) return null;
  return `followup_${config.key}_${attempt}`;
}

// Envia a tentativa via template (novo por etapa; fallback nos aprovados).
export async function sendReguaTemplate(
  lead: { phone: string; name: string | null; objective: string | null },
  stageRole: string,
  attempt: number,
  languageCode: string,
): Promise<{ template: string }> {
  const primary = templateNameFor(stageRole, attempt);
  const objective = String(lead.objective || "").replace(/\s+/g, " ").trim();
  const contextPhrase = objective ? `pra ${objective}`.slice(0, 60) : "no seu dia a dia";
  const firstName = lead.name?.split(" ")[0] || "tudo bem";

  if (primary) {
    try {
      await sendWhatsAppTemplate(lead.phone, primary, languageCode, [firstName, contextPhrase], [
        "HANDOFF_CONSULTOR",
        "DUVIDA_IA",
        "ADIAR",
      ]);
      return { template: primary };
    } catch {
      // template ainda não aprovado — usa o fallback
    }
  }
  const fallback = FALLBACK_TEMPLATES[Math.min(attempt - 1, FALLBACK_TEMPLATES.length - 1)];
  await sendWhatsAppTemplate(lead.phone, fallback, languageCode, [firstName, contextPhrase]);
  return { template: fallback };
}

// Cancela follow-ups pendentes/enviados de um lead. Se houver um "enviado"
// aguardando resposta, marca como respondido (registra qual tentativa
// recuperou o lead — vira relatório).
export async function cancelPendingFollowups(
  supabase: SupabaseClient,
  leadId: string,
  reason: "respondeu" | "cancelado",
) {
  try {
    if (reason === "respondeu") {
      const { data: lastSent } = await supabase
        .from("followups")
        .select("id, attempt, stage_role")
        .eq("lead_id", leadId)
        .eq("status", "enviado")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastSent) {
        await supabase
          .from("followups")
          .update({ status: "respondido", responded_at: new Date().toISOString() })
          .eq("id", lastSent.id);
        await supabase.from("lead_events").insert({
          lead_id: leadId,
          event_type: "followup_recovered",
          metadata: { attempt: lastSent.attempt, stage_role: lastSent.stage_role },
        });
      }
    }
    await supabase
      .from("followups")
      .update({ status: "cancelado" })
      .eq("lead_id", leadId)
      .eq("status", "pendente");
  } catch {
    // tabela followups ainda sem migração — nada a fazer
  }
}
