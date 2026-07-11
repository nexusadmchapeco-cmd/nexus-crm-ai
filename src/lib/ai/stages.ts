import type { AiDecision, Lead, StageRole } from "@/lib/types";

export function resolveSuggestedStage(decision: AiDecision, lead: Lead): StageRole {
  if (decision.should_disqualify && decision.disqualify_reason) return "not_qualified";
  const merged = { ...lead, ...removeNulls(decision.extracted) };
  if (decision.should_handoff || decision.temperature === "pronto_para_closer") {
    return "handoff";
  }
  if (merged.objective && (merged.city || merged.unit_interest) && merged.availability) {
    return "hot_lead";
  }
  if (merged.city || merged.unit_interest || merged.objective) return "qualifying";
  return (decision.suggested_stage as StageRole) || "ai_service";
}

export function removeNulls<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== ""),
  ) as Partial<T>;
}
