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
        enum: [
          "IA em atendimento",
          "Qualificando",
          "Lead quente",
          "Enviar para closer",
        ],
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
          duration_minutes: { type: ["integer", "null"] },
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

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: settings.temperature,
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
              ? `\n\nJANELAS DE DISPONIBILIDADE:\n${availableSlots}\nUse-as para sugerir opções. Só marque appointment.should_schedule=true quando o lead confirmar explicitamente um dia e horário exatos. Use starts_at em ISO 8601 com fuso -03:00. Reunião comercial é closer_meeting; aula experimental é experimental_class.`
              : "",
            "\n\nREGRA DE SEGURANÇA DA AGENDA: nunca invente disponibilidade e nunca confirme um agendamento sem confirmação explícita do cliente. Caso ainda esteja negociando o horário, deixe should_schedule=false e os demais campos de appointment como null.",
          ].join(""),
        },
        {
          role: "user",
          content: `Analise a conversa e gere a próxima resposta e decisão operacional.\n${JSON.stringify(context)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI respondeu ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("A OpenAI não retornou uma decisão");
  return JSON.parse(content) as AiDecision;
}
