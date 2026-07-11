import type {
  CampaignAudienceLead,
  CampaignFilters,
  Lead,
  Message,
  PipelineStage,
} from "@/lib/types";

export const emptyCampaignFilters: CampaignFilters = {
  stage_ids: [],
  cities: [],
  created_from: null,
  created_to: null,
  interacted_with_ai: false,
  did_not_advance: false,
  never_replied: false,
  exclude_won: true,
};

export function buildCampaignAudience({
  leads,
  messages,
  stages,
  filters,
}: {
  leads: Lead[];
  messages: Message[];
  stages: PipelineStage[];
  filters: CampaignFilters;
}): CampaignAudienceLead[] {
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const messagesByLead = new Map<string, Message[]>();
  for (const message of messages) {
    const current = messagesByLead.get(message.lead_id) || [];
    current.push(message);
    messagesByLead.set(message.lead_id, current);
  }

  return leads
    .filter((lead) => {
      const stage = stageById.get(lead.stage_id);
      const leadMessages = messagesByLead.get(lead.id) || [];
      const inboundCount = leadMessages.filter((message) => message.sender_type === "lead").length;
      const aiCount = leadMessages.filter((message) => message.sender_type === "ai").length;
      if (filters.stage_ids.length && !filters.stage_ids.includes(lead.stage_id)) return false;
      if (
        filters.cities.length &&
        !filters.cities.some(
          (city) => lead.city?.toLocaleLowerCase("pt-BR") === city.toLocaleLowerCase("pt-BR"),
        )
      ) return false;
      if (filters.created_from && lead.created_at < `${filters.created_from}T00:00:00`) return false;
      if (filters.created_to && lead.created_at > `${filters.created_to}T23:59:59`) return false;
      if (filters.interacted_with_ai && !(aiCount > 0 && inboundCount > 0)) return false;
      if (filters.never_replied && !(aiCount > 0 && inboundCount <= 1)) return false;
      if (filters.did_not_advance && (stage?.position || 99) > 3) return false;
      if (filters.exclude_won && stage?.role === "won") return false;
      return true;
    })
    .map((lead) => {
      const stage = stageById.get(lead.stage_id);
      const leadMessages = messagesByLead.get(lead.id) || [];
      const inboundCount = leadMessages.filter((message) => message.sender_type === "lead").length;
      const aiCount = leadMessages.filter((message) => message.sender_type === "ai").length;
      return {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        city: lead.city,
        stage_id: lead.stage_id,
        stage_name: stage?.name || "Sem etapa",
        created_at: lead.created_at,
        last_message_at: lead.last_message_at,
        reason: `${aiCount} respostas da IA · ${inboundCount} mensagens do lead`,
      };
    });
}

export function normalizeCampaignFilters(
  input: Partial<CampaignFilters>,
  stages: PipelineStage[],
): CampaignFilters {
  const validStageIds = new Set(stages.map((stage) => stage.id));
  return {
    stage_ids: Array.isArray(input.stage_ids)
      ? input.stage_ids.filter((id) => validStageIds.has(id))
      : [],
    cities: Array.isArray(input.cities)
      ? input.cities.map(String).map((city) => city.trim()).filter(Boolean)
      : [],
    created_from: input.created_from || null,
    created_to: input.created_to || null,
    interacted_with_ai: Boolean(input.interacted_with_ai),
    did_not_advance: Boolean(input.did_not_advance),
    never_replied: Boolean(input.never_replied),
    exclude_won: input.exclude_won !== false,
  };
}
