import { chatCompletionWithFallback, FALLBACK_MODEL } from "@/lib/ai/openai";
import type { AiDecision, AiSettings, Lead, Message } from "@/lib/types";

const schema = {
  name: "nexus_sdr_decision",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "reply",
      "extracted",
      "temperature",
      "should_handoff",
      "suggested_stage",
      "should_disqualify",
      "disqualify_reason",
      "summary",
      "next_action",
      "appointment",
    ],
    properties: {
      reply: { type: "string" },
      extracted: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "city",
          "unit_interest",
          "course_interest",
          "objective",
          "level",
          "availability",
          "urgency",
          "objection",
        ],
        properties: Object.fromEntries(
          [
            "name",
            "city",
            "unit_interest",
            "course_interest",
            "objective",
            "level",
            "availability",
            "urgency",
            "objection",
          ].map((key) => [key, { type: ["string", "null"] }]),
        ),
      },
      temperature: {
        type: "string",
        enum: ["frio", "morno", "quente", "pronto_para_closer", "perdido", "cliente"],
      },
      should_handoff: { type: "boolean" },
      suggested_stage: {
        type: "string",
        enum: ["ai_service", "qualifying", "hot_lead", "handoff"],
      },
      should_disqualify: { type: "boolean" },
      disqualify_reason: {
        type: ["string", "null"],
        enum: ["explicit_no", "out_of_profile", "invalid_contact", null],
      },
      summary: { type: "string" },
      next_action: { type: "string" },
      appointment: {
        type: "object",
        additionalProperties: false,
        required: ["should_schedule", "type", "starts_at", "duration_minutes"],
        properties: {
          should_schedule: { type: "boolean" },
          type: {
            type: ["string", "null"],
            enum: ["experimental_class", "closer_meeting", null],
          },
          starts_at: { type: ["string", "null"] },
          duration_minutes: { type: ["integer", "null"], enum: [30, null] },
        },
      },
    },
  },
};

export async function runSdr({
  lead,
  messages,
  settings,
  stagePrompt,
  knowledgeContext,
  availableSlots,
}: {
  lead: Lead;
  messages: Message[];
  settings: AiSettings;
  stagePrompt?: string | null;
  knowledgeContext?: string | null;
  availableSlots?: string | null;
}): Promise<AiDecision> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");

  const context = {
    lead: {
      name: lead.name,
      phone: lead.phone,
      city: lead.city,
      unit_interest: lead.unit_interest,
      objective: lead.objective,
      level: lead.level,
      availability: lead.availability,
      urgency: lead.urgency,
      objection: lead.objection,
      temperature: lead.temperature,
    },
    recent_messages: messages.slice(-12).map((message) => ({
      sender: message.sender_type,
      content: message.content,
    })),
  };

  const { payload } = await chatCompletionWithFallback({
    apiKey,
    model: settings.model || process.env.OPENAI_MODEL || FALLBACK_MODEL,
    temperature: settings.temperature,
    body: {
      response_format: { type: "json_schema", json_schema: schema },
      messages: [
        {
          role: "system",
          content: [
            settings.global_prompt,
            stagePrompt
              ? `\nINSTRUÇÃO ESPECÍFICA DA ETAPA ATUAL:\n${stagePrompt}`
              : "",
            knowledgeContext
              ? `\n\nBASE DE CONHECIMENTO APROVADA:\n${knowledgeContext}\nResponda informações comerciais somente com base neste conteúdo. Se faltar informação, diga que a equipe confirmará.`
              : "",
            availableSlots
              ? `\n\nJANELAS DE DISPONIBILIDADE:\n${availableSlots}\nUse-as para sugerir opções. Só marque appointment.should_schedule=true quando o lead confirmar explicitamente um dia e horário exatos. Use starts_at em ISO 8601 com fuso -03:00 e duration_minutes=30. Reunião comercial é closer_meeting; aula experimental é experimental_class.`
              : "",
            "\n\nREGRA DE SEGURANÇA DA AGENDA: nunca invente disponibilidade e nunca confirme um agendamento sem confirmação explícita do cliente. Caso ainda esteja negociando o horário, deixe should_schedule=false e os demais campos de appointment como null.",
            "\n\nDESQUALIFICAÇÃO: marque should_disqualify=true apenas quando UM destes casos ficar claro na conversa, e preencha disqualify_reason:\n" +
              '- explicit_no: o lead recusou explicitamente ("não tenho interesse", "para de mandar mensagem", "não quero", etc.).\n' +
              "- out_of_profile: o lead não se encaixa no público da Nexus (cidade fora das unidades atendidas, sem qualquer condição de pagar, ou fora do perfil de idade/objetivo do curso).\n" +
              "- invalid_contact: o contato é claramente inválido, spam, teste ou sem sentido (nome falso óbvio, mensagem incoerente).\n" +
              "Na dúvida, NÃO desqualifique: deixe should_disqualify=false e disqualify_reason=null, e continue qualificando normalmente. Nunca desqualifique só por o lead demorar para responder.",
          ].join(""),
        },
        {
          role: "user",
          content: `Analise a conversa e gere a próxima resposta e decisão operacional.\n${JSON.stringify(context)}`,
        },
      ],
    },
  });

  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("A OpenAI não retornou uma decisão");
  return JSON.parse(content) as AiDecision;
}
