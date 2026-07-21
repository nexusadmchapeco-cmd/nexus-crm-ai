import type { OperationsSettings } from "@/lib/types";

export const defaultOperationsSettings: OperationsSettings = {
  closer_enabled: false,
  closer_name: "Closer Nexus",
  closer_phone: "",
  closer_template_name: "resumo_closer",
  followup_template_name: "",
  followup_template_names: {
    // Templates com contexto (2 variáveis: nome + objetivo). Após aprovados
    // na Meta, o job envia o objetivo do lead para não repetir perguntas.
    "1440": "followup_ctx_dia1",
    "4320": "followup_ctx_dia3",
    "10080": "followup_ctx_dia7",
    "30240": "followup_ctx_dia21",
  },
  campaign_template_names: {
    // Sem modelo aprovado equivalente na Meta ainda; crie "reativacao_leads"
    // (ou outro nome) no Gerenciador do WhatsApp e aguarde aprovação.
    reactivation: "reativacao_leads",
    black_november: "black_november",
    next_month_classes: "turmas_proximo_mes",
  },
  language_code: "pt_BR",
  // Quando o lead manda áudio, a Nina responde com áudio (voz gerada por IA).
  voice_reply_enabled: true,
  voice_name: "nova",
  // Voz do ElevenLabs (usada quando ELEVENLABS_API_KEY está configurada).
  elevenlabs_voice_id: "21m00Tcm4TlvDq8ikWAM",
};

export function parseOperationsSettings(value?: string | null): OperationsSettings {
  if (!value) return defaultOperationsSettings;
  try {
    const parsed = JSON.parse(value);
    return {
      ...defaultOperationsSettings,
      ...parsed,
      followup_template_names: {
        ...defaultOperationsSettings.followup_template_names,
        ...(parsed.followup_template_names || {}),
      },
      campaign_template_names: {
        ...defaultOperationsSettings.campaign_template_names,
        ...(parsed.campaign_template_names || {}),
      },
    };
  } catch {
    return defaultOperationsSettings;
  }
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}
