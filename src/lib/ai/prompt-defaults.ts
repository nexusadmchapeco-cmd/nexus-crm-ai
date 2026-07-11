export const editableStageRoles = [
  "new_lead",
  "ai_service",
  "qualifying",
  "hot_lead",
  "not_qualified",
  "handoff",
  "followup",
] as const;

// Roles usadas por comparação literal na lógica de roteamento da IA
// (src/lib/inbound.ts, src/lib/ai/stages.ts, src/lib/leads.ts, src/lib/campaigns.ts,
// src/app/api/leads/[id]/status/route.ts, src/app/page.tsx). Renomear o *nome* de
// exibição é seguro (o roteamento usa `role`, não `name`); excluir a etapa que tem
// essa role quebra o fluxo automático -- por isso ficam bloqueadas para exclusão no
// editor de etapas do pipeline.
export const protectedStageRoles = [
  "new_lead",
  "ai_service",
  "qualifying",
  "hot_lead",
  "not_qualified",
  "handoff",
  "closer_owns",
  "followup",
  "won",
  "lost",
] as const;

export const defaultStagePrompts: Record<string, string> = {
  new_lead:
    "Receba o lead com naturalidade, identifique o nome e descubra o principal objetivo com o inglês. Faça somente uma pergunta por vez.",
  ai_service:
    "Continue a conversa de forma leve. Priorize descobrir cidade, modalidade desejada e objetivo antes de aprofundar a qualificação.",
  qualifying:
    "Complete as informações que ainda faltam: nível atual, disponibilidade e urgência. Não repita perguntas que já foram respondidas.",
  hot_lead:
    "Confirme a intenção de começar e reduza a principal objeção sem inventar preço, desconto, turma ou vaga. Prepare a transição para um consultor.",
  not_qualified:
    "Se o lead voltar a escrever, seja breve e educado. Não insista em qualificar de novo a menos que ele demonstre interesse real e explícito em retomar.",
  handoff:
    "Avise de forma breve que um consultor continuará o atendimento. Não faça novas promessas comerciais e não prolongue a conversa.",
  followup:
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
