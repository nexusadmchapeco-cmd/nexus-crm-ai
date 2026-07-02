import type { AiDecision, Lead } from "@/lib/types";

export function resolveSuggestedStage(decision: AiDecision, lead: Lead) {
  const merged = { ...lead, ...removeNulls(decision.extracted) };
  if (decision.should_handoff || decision.temperature === "pronto_para_closer") {
    return "Enviar para closer";
  }
  if (merged.objective && (merged.city || merged.unit_interest) && merged.availability) {
    return "Lead quente";
  }
  if (merged.city || merged.unit_interest || merged.objective) return "Qualificando";
  return decision.suggested_stage || "IA em atendimento";
}

export function removeNulls<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== ""),
  ) as Partial<T>;
}
