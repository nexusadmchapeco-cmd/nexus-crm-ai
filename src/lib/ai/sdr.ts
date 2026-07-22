import { chatCompletionWithFallback, FALLBACK_MODEL } from "@/lib/ai/openai";
import type { AiDecision, AiSettings, Lead, Message } from "@/lib/types";

const schema = {
  name: "nexus_sdr_decision",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "reply_messages",
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
      reply_messages: { type: "array", items: { type: "string" } },
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
            "\n\nFORMATO TÉCNICO (reply_messages): este campo é um array; cada item vira uma bolha separada no WhatsApp. Coloque o texto da etapa atual do roteiro acima, respeitando exatamente o que ele manda dizer e perguntar (se o roteiro pede várias perguntas numa mensagem, mantenha juntas). Quebre em 2 bolhas apenas quando o próprio texto tiver uma parte de fala e depois uma pergunta, e ficar mais natural separado. Não invente conteúdo novo nem contrarie o roteiro; este campo é só o formato de entrega.",
            "\n\nUNIDADE (unit_interest): Online é uma unidade como qualquer outra. Quando o lead escolher online, defina unit_interest='Online'. Quando for presencial, defina unit_interest com a unidade escolhida (ex.: 'Chapecó' ou 'Passo Fundo'). Sempre registre a unidade escolhida em unit_interest.",
            "\n\nREGRA DE SEGURANÇA DA AGENDA: nunca invente disponibilidade e nunca confirme um agendamento sem confirmação explícita do cliente. Caso ainda esteja negociando o horário, deixe should_schedule=false e os demais campos de appointment como null.",
            "\n\nTEMPERATURA E ENCAMINHAMENTO AO CLOSER — siga esta régua com rigor, NÃO acione cedo:\n" +
              "- frio: começo da conversa, ainda com pouca informação.\n" +
              "- morno: está qualificando (coletando nível, objetivo, dias/horários) ou tirando dúvidas. A maior parte da conversa fica aqui.\n" +
              "- quente / pronto_para_closer: use SOMENTE quando TODAS estas condições já aconteceram, nesta ordem: (1) você já explicou o curso/a Nexus, (2) o lead já recebeu todas as informações que precisava, (3) você já passou os valores e o lead ACEITOU/concordou em seguir, (4) o lead disse ok que um consultor vai entrar em contato, e (5) você já enviou a mensagem final de encaminhamento (confirmação + agradecimento + à disposição).\n" +
              "should_handoff=true e temperature='pronto_para_closer' devem ser marcados APENAS no turno em que você envia essa mensagem final de encaminhamento. Antes disso, mantenha should_handoff=false e temperature no máximo 'morno'. NUNCA acione o closer só porque a pessoa demonstrou interesse, pediu valores ou está qualificada — o disparo é só no final, depois do aceite dos valores e do agradecimento.",
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
  const decision = JSON.parse(content) as AiDecision;
  // Saneamento: mantém no máximo 3 mensagens não vazias; garante ao menos uma.
  const parts = (decision.reply_messages || [])
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .slice(0, 3);
  decision.reply_messages = parts.length ? parts : [decision.next_action || "Certo!"];
  return decision;
}
