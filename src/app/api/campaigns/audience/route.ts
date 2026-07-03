import { NextResponse } from "next/server";
import {
  buildCampaignAudience,
  emptyCampaignFilters,
  normalizeCampaignFilters,
} from "@/lib/campaigns";
import { getAiSettings, getLeads, getStages } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CampaignFilters, Message } from "@/lib/types";

async function interpretWithAi(instruction: string) {
  const stages = await getStages();
  const settings = await getAiSettings();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings?.model || "gpt-4.1-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Converta o pedido do usuário em filtros de CRM. Hoje é ${new Date()
            .toISOString()
            .slice(0, 10)}. Retorne somente JSON com: stage_names (array), cities (array), created_from (YYYY-MM-DD ou null), created_to, interacted_with_ai (boolean), did_not_advance (boolean), never_replied (boolean), exclude_won (boolean). Etapas disponíveis: ${stages
            .map((stage) => stage.name)
            .join(", ")}. "Não avançou" significa did_not_advance. "Não respondeu" significa never_replied. Campanhas para leads que não fecharam devem usar exclude_won=true.`,
        },
        { role: "user", content: instruction.slice(0, 1200) },
      ],
    }),
  });
  if (!response.ok) throw new Error("A IA não conseguiu interpretar esse público.");
  const body = await response.json();
  const parsed = JSON.parse(body.choices?.[0]?.message?.content || "{}");
  const stageIds = stages
    .filter((stage) =>
      (parsed.stage_names || []).some(
        (name: string) => name.toLowerCase() === stage.name.toLowerCase(),
      ),
    )
    .map((stage) => stage.id);
  return {
    filters: normalizeCampaignFilters(
      {
        stage_ids: stageIds,
        cities: parsed.cities,
        created_from: parsed.created_from,
        created_to: parsed.created_to,
        interacted_with_ai: parsed.interacted_with_ai,
        did_not_advance: parsed.did_not_advance,
        never_replied: parsed.never_replied,
        exclude_won: parsed.exclude_won,
      },
      stages,
    ),
    stages,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const aiResult = body.instruction?.trim()
      ? await interpretWithAi(body.instruction.trim())
      : null;
    const stages = aiResult?.stages || (await getStages());
    const filters = aiResult?.filters ||
      normalizeCampaignFilters(
        (body.filters || emptyCampaignFilters) as Partial<CampaignFilters>,
        stages,
      );
    const [leads, messagesResult] = await Promise.all([
      getLeads(),
      createAdminClient().from("messages").select("*").order("created_at"),
    ]);
    if (messagesResult.error) throw messagesResult.error;
    const audience = buildCampaignAudience({
      leads,
      messages: (messagesResult.data || []) as Message[],
      stages,
      filters,
    });
    return NextResponse.json({
      filters,
      count: audience.length,
      leads: audience.slice(0, 200),
      summary: audience.length
        ? `${audience.length} leads encontrados para este disparo.`
        : "Nenhum lead corresponde a estes filtros.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao montar o público" },
      { status: 500 },
    );
  }
}
