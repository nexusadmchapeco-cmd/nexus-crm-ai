import type { PipelineStage } from "@/lib/types";

// O funil do CLOSER não é só o board_group "closer": os leads chegam pra ele
// já em "Qualificado" (hot_lead) e "Reunião Agendada" (handoff), que ficaram
// marcadas como grupo IA na migração 004. Sem elas o vendedor abria o
// Pipeline e não via lead nenhum — a fila dele mora justamente ali.
export const CLOSER_ENTRY_ROLES = ["hot_lead", "handoff"];

export function isCloserStage(stage: Pick<PipelineStage, "board_group" | "role">) {
  return stage.board_group === "closer" || CLOSER_ENTRY_ROLES.includes(stage.role || "");
}
