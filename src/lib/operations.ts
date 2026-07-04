import type { OperationsSettings } from "@/lib/types";

export const defaultOperationsSettings: OperationsSettings = {
  closer_enabled: false,
  closer_name: "Closer Nexus",
  closer_phone: "",
  closer_template_name: "",
  followup_template_name: "",
  followup_template_names: {
    "1440": "followup_d1",
    "4320": "followup_d3",
    "10080": "followup_d7",
    "30240": "followup_d21",
  },
  campaign_template_names: {
    reactivation: "reativacao_leads",
    black_november: "black_november_nexus",
    next_month_classes: "turmas_proximo_mes",
  },
  language_code: "pt_BR",
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
