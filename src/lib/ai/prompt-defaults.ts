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
      "Hello, {{nome}}! Tudo bem?\n\nSe quiser agilizar seu atendimento, pode me contar rapidamente o que você está buscando. Assim, já te envio as informações mais importantes.\n\nSe preferir, também podemos combinar um horário melhor para conversarmos. O que fica mais fácil para você?",
  },
  {
    delay_minutes: 3 * 24 * 60,
    message:
      "Hello, {{nome}}! Tudo bem?\n\nEstou organizando as vagas dos novos alunos para o início do próximo mês e lembrei de você.\n\nFicou alguma dúvida ou posso retomar seu atendimento por aqui mesmo?",
  },
  {
    delay_minutes: 7 * 24 * 60,
    message:
      "{{nome}}, se preferir, podemos agendar diretamente uma aula experimental.\n\nPercebi que sua rotina está um pouco corrida e, assim, a gente ganha tempo: você conhece nossa escola, entende como as aulas funcionam e vê se faz sentido para você.\n\nO que acha?",
  },
  {
    delay_minutes: 21 * 24 * 60,
    message:
      "Oi, {{nome}}! Vou encerrar seu atendimento por enquanto.\n\nMas podemos organizar o início das suas aulas para os próximos meses, caso seja melhor para você. Se quiser, ainda posso te explicar como tudo funciona.\n\nCaso contrário, vou deixar seu contato salvo. Quando quiser retomar ou tiver alguma dúvida, é só chamar a gente por aqui.",
  },
];
