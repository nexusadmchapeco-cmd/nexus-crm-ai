import type { OperationsSettings } from "@/lib/types";

export const defaultOperationsSettings: OperationsSettings = {
  closer_enabled: false,
  closer_name: "Closer Nexus",
  closer_phone: "",
  closer_template_name: "",
  followup_template_name: "",
  language_code: "pt_BR",
};

export function parseOperationsSettings(value?: string | null): OperationsSettings {
  if (!value) return defaultOperationsSettings;
  try {
    const parsed = JSON.parse(value);
    return { ...defaultOperationsSettings, ...parsed };
  } catch {
    return defaultOperationsSettings;
  }
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}
