// Qualificação por botões antes da IA (briefing §1): sequência FIXA —
// modalidade → para quem → idade (se outra pessoa) → nome → nível.
// SISTEMA EXCLUSIVO DE CHAPECÓ (decisão do diretor, 07/08): não existe mais
// pergunta de unidade — presencial é Chapecó, online é a turma online de
// Chapecó. As respostas vão para campos estruturados do lead; depois a
// IA assume com o prompt pós-qualificação (variáveis injetadas).
//
// O lead pode responder pelo botão (id fixo) ou por texto livre — o texto é
// interpretado; se não der para entender, repergunta com os botões.

import type { Lead } from "@/lib/types";

export type QualificationQuestion = {
  body: string;
  buttons: { id: string; title: string }[];
};

type StepResult = {
  // Atualizações a aplicar no lead (inclui o próximo qualification_step).
  updates: Record<string, unknown>;
  // Próxima pergunta a enviar (null = sequência concluída, IA assume).
  question: QualificationQuestion | null;
  // A resposta do lead foi entendida? (false = repergunta a mesma etapa)
  understood: boolean;
};

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const firstNameGreeting = (lead: Lead) => {
  const name = (lead.name || "").split(" ")[0];
  return name ? `, ${name}` : "";
};

export function questionFor(step: string, lead: Lead): QualificationQuestion | null {
  switch (step) {
    case "modalidade":
      return {
        body: `Oi${firstNameGreeting(lead)}! Eu sou a Nina, da Nexus English Center de Chapecó. 😊 Pra agilizar seu atendimento, me conta: você prefere estudar presencial ou online?`,
        buttons: [
          { id: "QUAL_MOD_PRESENCIAL", title: "Presencial" },
          { id: "QUAL_MOD_ONLINE", title: "Online" },
        ],
      };
    case "para_quem":
      return {
        body: "O curso é pra você mesmo ou pra outra pessoa?",
        buttons: [
          { id: "QUAL_QUEM_PROPRIA", title: "Pra mim" },
          { id: "QUAL_QUEM_OUTRA", title: "Pra outra pessoa" },
        ],
      };
    case "idade":
      return {
        body: "Legal! Qual a idade de quem vai estudar?",
        buttons: [],
      };
    case "nome":
      return {
        body: "E qual o nome de quem vai estudar?",
        buttons: [],
      };
    case "nivel":
      return {
        body: "Última perguntinha: qual o nível de inglês hoje?",
        buttons: [
          { id: "QUAL_NIVEL_BASICO", title: "Básico" },
          { id: "QUAL_NIVEL_INTER", title: "Intermediário" },
          { id: "QUAL_NIVEL_AVANCADO", title: "Avançado" },
        ],
      };
    default:
      return null;
  }
}

// Interpreta a resposta da etapa atual e devolve as atualizações + próxima
// pergunta. `firstContact` = ainda não perguntamos nada (primeira mensagem).
export function advanceQualification(
  lead: Lead,
  messageText: string,
  buttonPayload: string | null,
  firstContact: boolean,
): StepResult {
  const step = lead.qualification_step || "modalidade";
  const text = normalize(messageText);

  // Primeira mensagem do lead ("oi", clique de anúncio...): só pergunta.
  if (firstContact) {
    return { updates: {}, question: questionFor(step, lead), understood: true };
  }

  const next = (updates: Record<string, unknown>, nextStep: string | null): StepResult => {
    const done = nextStep === null;
    return {
      updates: { ...updates, qualification_step: done ? "done" : nextStep },
      question: done ? null : questionFor(nextStep as string, lead),
      understood: true,
    };
  };
  const reask = (): StepResult => ({
    updates: {},
    question: questionFor(step, lead),
    understood: false,
  });

  // No canal não oficial os botões viram opções numeradas — o lead responde
  // "1", "2", "3" e o dígito precisa valer como clique.
  const digit = /^[123]$/.test(text) ? text : null;

  switch (step) {
    case "modalidade": {
      // Sistema exclusivo de Chapecó: presencial = unidade Chapecó direto,
      // online = turma online DE Chapecó. Não existe mais pergunta de unidade.
      const online =
        buttonPayload === "QUAL_MOD_ONLINE" || digit === "2" || /\bonline|a distancia|ead\b/.test(text);
      const presencial =
        buttonPayload === "QUAL_MOD_PRESENCIAL" || digit === "1" || /presencial|na escola|na unidade/.test(text);
      if (online) return next({ modalidade: "online", unit_interest: "Online" }, "para_quem");
      if (presencial) return next({ modalidade: "presencial", unit_interest: "Chapecó" }, "para_quem");
      return reask();
    }
    case "unidade": {
      // Etapa legada (leads que estavam no meio da sequência antiga): resolve
      // como Chapecó e segue.
      return next({ unit_interest: "Chapecó" }, "para_quem");
    }
    case "para_quem": {
      const propria =
        buttonPayload === "QUAL_QUEM_PROPRIA" || digit === "1" || /pra mim|para mim|\beu\b|proprio|mesma/.test(text);
      const outra =
        buttonPayload === "QUAL_QUEM_OUTRA" ||
        digit === "2" ||
        /outra|filh[oa]|espos[oa]|marido|mulher|amig[oa]|sobrinh[oa]|net[o|a]/.test(text);
      if (outra) return next({ para_quem: "outra" }, "idade");
      if (propria) return next({ para_quem: "propria" }, "nome");
      return reask();
    }
    case "idade": {
      const match = messageText.match(/\d{1,2}/);
      if (match) return next({ idade_aluno: match[0] }, "nome");
      if (text.length > 1) return next({ idade_aluno: messageText.trim().slice(0, 40) }, "nome");
      return reask();
    }
    case "nome": {
      const cleaned = messageText
        .replace(/^(meu nome e|me chamo|é|e o|o nome e|nome)\s+/i, "")
        .trim();
      if (cleaned.length >= 2 && cleaned.length <= 80) {
        const name = cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
        return next({ name }, "nivel");
      }
      return reask();
    }
    case "nivel": {
      const basico =
        buttonPayload === "QUAL_NIVEL_BASICO" || digit === "1" || /basic|iniciante|zero|nunca/.test(text);
      const inter =
        buttonPayload === "QUAL_NIVEL_INTER" || digit === "2" || /inter|medio|mais ou menos/.test(text);
      const avancado =
        buttonPayload === "QUAL_NIVEL_AVANCADO" || digit === "3" || /avanc|fluente/.test(text);
      if (basico) return next({ level: "básico" }, null);
      if (inter) return next({ level: "intermediário" }, null);
      if (avancado) return next({ level: "avançado" }, null);
      return reask();
    }
    default:
      return { updates: { qualification_step: "done" }, question: null, understood: true };
  }
}

// ── Engenharia situacional: para CADA combinação de variáveis coletadas nos
// botões, a Nina recebe a instrução de venda certa. Os textos abaixo são o
// PADRÃO; cada um pode ser sobrescrito no Estúdio de IA (aba Qualificação).
// Placeholders aceitos nos textos: {nome}, {idade}, {objetivo}.
export const SITUACOES: { key: string; label: string; default: string }[] = [
  {
    key: "modalidade_presencial",
    label: "Modalidade: Presencial",
    default:
      "MODALIDADE PRESENCIAL: venda a EXPERIÊNCIA — turmas pequenas, contato direto com o professor, imersão na escola. Convide para conhecer a unidade pessoalmente; a reunião com o consultor pode ser na própria escola.",
  },
  {
    key: "modalidade_online",
    label: "Modalidade: Online",
    default:
      "MODALIDADE ONLINE: venda a FLEXIBILIDADE — aula ao vivo com professor, de onde a pessoa estiver, sem deslocamento. Deixe claro que NÃO é curso gravado: é turma ao vivo. A reunião com o consultor acontece por videochamada (Google Meet).",
  },
  {
    key: "modalidade_indefinida",
    label: "Modalidade ainda não definida",
    default:
      "MODALIDADE AINDA NÃO DEFINIDA: descubra com naturalidade (presencial ou online) antes de falar de horários ou agendar.",
  },
  {
    key: "unidade_chapeco",
    label: "Unidade: Chapecó",
    default:
      "UNIDADE CHAPECÓ: a escola fica em Chapecó — endereço, turmas, horários e professores saem da base de conhecimento. Convide para conhecer a unidade pessoalmente.",
  },
  {
    key: "para_crianca",
    label: "Curso para criança (até 11 anos)",
    default:
      "CURSO PARA CRIANÇA ({idade} anos): você conversa com o RESPONSÁVEL, não com o aluno. Chame {nome} pelo nome ao falar da criança, pergunte sobre a rotina escolar e destaque o método para crianças (confira o curso certo na base de conhecimento), o acompanhamento próximo e o retorno que os pais recebem. A decisão é do responsável — construa CONFIANÇA antes de falar de valores.",
  },
  {
    key: "para_adolescente",
    label: "Curso para adolescente (12–17)",
    default:
      "CURSO PARA ADOLESCENTE ({idade} anos): quem decide é o responsável no WhatsApp. Conecte o inglês ao FUTURO de {nome}: escola, vestibular, intercâmbio, primeiras oportunidades de trabalho. Sugira horários compatíveis com a rotina escolar.",
  },
  {
    key: "para_outra_adulto",
    label: "Curso para outra pessoa (adulto)",
    default:
      "CURSO PARA OUTRA PESSOA (adulto): quem conversa não é quem vai estudar. Antes de agendar, confirme a disponibilidade de horários DO ALUNO ({nome}) e convide os dois para a reunião com o consultor.",
  },
  {
    key: "para_propria",
    label: "Curso para a própria pessoa",
    default:
      "CURSO PARA A PRÓPRIA PESSOA: fale diretamente com {nome} e amarre cada argumento ao objetivo DELE(A) com o inglês.",
  },
  {
    key: "nivel_basico",
    label: "Nível: Básico",
    default:
      'NÍVEL BÁSICO: acolha sem julgamento — muita gente tem vergonha de começar do zero. PITCH DE CONEXÃO: "Legal, {nome}! Então a Nexus vai ser ideal pra ti: nossas turmas de iniciantes começam do início DE VERDADE, com foco em já sair FALANDO desde as primeiras aulas — e temos vários alunos que chegaram exatamente como você, sem nunca ter estudado inglês." Evite termos em inglês nas suas mensagens. Não apresente teste de nivelamento como barreira.',
  },
  {
    key: "nivel_intermediario",
    label: "Nível: Intermediário",
    default:
      'NÍVEL INTERMEDIÁRIO: o inimigo aqui é a estagnação — a pessoa entende mas TRAVA na hora de falar. PITCH DE CONEXÃO: "Legal, {nome}! Então a Nexus vai ser ideal pra ti: nosso foco é justamente CONVERSAÇÃO — temos vários alunos que chegaram entendendo tudo mas travando na hora de falar, e é exatamente isso que a gente destrava." Ofereça o teste de nivelamento como forma de cair na turma exata, sem repetir conteúdo que já sabe.',
  },
  {
    key: "nivel_avancado",
    label: "Nível: Avançado",
    default:
      'NÍVEL AVANÇADO: fluência plena, conversação avançada e manutenção do nível. PITCH DE CONEXÃO: "Legal, {nome}! Então a Nexus vai ser ideal pra ti: temos turmas avançadas focadas em conversação de alto nível, com vários alunos no teu estágio que vêm pra manter e refinar a fluência." Se a base de conhecimento tiver preparação para certificações, cite. Ofereça o teste de nivelamento. Pode responder em inglês leve SE o lead puxar primeiro.',
  },
  {
    key: "objetivo",
    label: "Quando o objetivo já foi declarado",
    default:
      'OBJETIVO DECLARADO: "{objetivo}" — conecte benefícios, horários e o convite pra reunião a ESSE objetivo, não a argumentos genéricos.',
  },
  {
    key: "regras_fixas",
    label: "Regras fixas (sempre entram)",
    default:
      "REGRAS FIXAS: nunca invente preço, horário de turma, endereço ou nome de professor — tudo isso sai da base de conhecimento. O próximo passo é sempre UM só: agendar a reunião com o consultor (ou a aula experimental, quando o lead pedir).",
  },
];

// Decide QUAIS situações se aplicam a este lead. Os textos vêm do padrão
// acima ou da versão editada no Estúdio (overrides).
function situationalInstructions(lead: Lead, overrides: Record<string, string>): string {
  const idade = Number.parseInt(lead.idade_aluno || "", 10);
  const unit = (lead.unit_interest || "").toLowerCase();
  const keys: string[] = [];

  if (lead.modalidade === "presencial") keys.push("modalidade_presencial");
  else if (lead.modalidade === "online") keys.push("modalidade_online");
  else keys.push("modalidade_indefinida");

  if (unit.includes("chapec") || lead.modalidade === "presencial") keys.push("unidade_chapeco");

  if (lead.para_quem === "outra") {
    if (!Number.isNaN(idade) && idade <= 11) keys.push("para_crianca");
    else if (!Number.isNaN(idade) && idade <= 17) keys.push("para_adolescente");
    else keys.push("para_outra_adulto");
  } else if (lead.para_quem === "propria") {
    keys.push("para_propria");
  }

  if (lead.level === "básico") keys.push("nivel_basico");
  else if (lead.level === "intermediário") keys.push("nivel_intermediario");
  else if (lead.level === "avançado") keys.push("nivel_avancado");

  if (lead.objective) keys.push("objetivo");
  keys.push("regras_fixas");

  const values: Record<string, string> = {
    nome: (lead.name || "").split(" ")[0] || "o aluno",
    idade: lead.idade_aluno || "não informada",
    objetivo: lead.objective || "",
  };
  const lines = keys
    .map((key) => {
      const situation = SITUACOES.find((s) => s.key === key);
      if (!situation) return null;
      const text = (overrides[key] || "").trim() || situation.default;
      return text.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? `{${k}}`);
    })
    .filter(Boolean);

  return `INSTRUÇÕES PARA ESTE PERFIL (siga à risca):\n- ${lines.join("\n- ")}`;
}

// Prompt pós-qualificação: template com variáveis preenchidas com o que os
// botões coletaram (editável no Estúdio de IA) + o bloco situacional da
// combinação exata de respostas deste lead (também editável, por situação).
export function renderPostQualificationPrompt(
  template: string,
  lead: Lead,
  situationalOverrides: Record<string, string> = {},
) {
  const values: Record<string, string> = {
    modalidade: lead.modalidade || "não informada",
    unidade: lead.unit_interest || "não informada",
    para_quem: lead.para_quem === "outra" ? "outra pessoa" : "a própria pessoa",
    idade: lead.idade_aluno || "não informada",
    nome: lead.name || "não informado",
    nivel: lead.level || "não informado",
  };
  const rendered = template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
  return `${rendered}\n\n${situationalInstructions(lead, situationalOverrides)}`;
}

export const DEFAULT_POST_QUALIFICATION_PROMPT =
  "DADOS DO LEAD ATÉ AGORA: modalidade: {modalidade} · unidade: {unidade} · curso para: {para_quem} · " +
  "idade: {idade} · nome do aluno: {nome} · nível: {nivel}. " +
  "O que estiver preenchido é DEFINITIVO — nunca pergunte de novo. O que estiver 'não informado', " +
  "descubra conversando com naturalidade (uma pergunta por vez, cedo na conversa). " +
  "Assim que souber o nível, faça o PITCH DE CONEXÃO: comece com \"Legal, {nome}!\" e diga por que a " +
  "Nexus é ideal PARA ESSE PERFIL (use o bloco de nível abaixo), citando que temos vários alunos em " +
  "situação parecida — no máximo 3 frases curtas, fechando com a pergunta se é isso que a pessoa busca. " +
  "Use os dados naturalmente na conversa inteira (chame pelo nome, personalize pelo nível e modalidade).";
