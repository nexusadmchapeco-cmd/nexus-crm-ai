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
    },
  },
};

export async function runSdr({
  lead,
  messages,
  settings,
  stagePrompt,
}: {
  lead: Lead;
  messages: Message[];
  settings: AiSettings;
  stagePrompt?: string | null;
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
