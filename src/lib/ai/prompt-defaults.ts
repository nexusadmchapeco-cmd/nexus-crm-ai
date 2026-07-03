export const editableStageNames = [
  "Novo lead",
  "IA em atendimento",
  "Qualificando",
  "Lead quente",
  "Enviar para closer",
  "Follow-up",
] as const;

export const defaultStagePrompts: Record<string, string> = {
  "Novo lead":
    "Receba o lead com naturalidade, identifique o nome e descubra o principal objetivo com o inglês. Faça somente uma pergunta por vez.",
  "IA em atendimento":
    "Continue a conversa de forma leve. Priorize descobrir cidade, modalidade desejada e objetivo antes de aprofundar a qualificação.",
  Qualificando:
    "Complete as informações que ainda faltam: nível atual, disponibilidade e urgência. Não repita perguntas que já foram respondidas.",
  "Lead quente":
    "Confirme a intenção de começar e reduza a principal objeção sem inventar preço, desconto, turma ou vaga. Prepare a transição para um consultor.",
  "Enviar para closer":
    "Avise de forma breve que um consultor continuará o atendimento. Não faça novas promessas comerciais e não prolongue a conversa.",
  "Follow-up":
    "Retome o contexto anterior sem pressionar. Relembre o objetivo do lead, faça uma pergunta simples e ofereça ajuda para avançar.",
};

export const defaultFollowupSteps = [
  {
    delay_minutes: 24 * 60,
    message:
      "Oi, {{nome}}! Passando para saber se você conseguiu pensar sobre seu objetivo com o inglês. Posso te ajudar a encontrar a melhor opção?",
  },
  {
    delay_minutes: 3 * 24 * 60,
    message:
      "Oi, {{nome}}! Lembrei que você quer aprender inglês para {{objetivo}}. Ainda faz sentido começar agora?",
  },
  {
    delay_minutes: 7 * 24 * 60,
    message:
      "Oi, {{nome}}! Vou encerrar nosso acompanhamento por enquanto, mas quando quiser retomar é só me chamar por aqui. Posso ajudar em algo antes disso?",
  },
];
