// Qualificação por botões antes da IA (briefing §1): sequência FIXA —
// modalidade → unidade (se presencial) → para quem → idade (se outra pessoa)
// → nome → nível. As respostas vão para campos estruturados do lead; depois a
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
        body: `Oi${firstNameGreeting(lead)}! Eu sou a Nina, da Nexus English Center. 😊 Pra agilizar seu atendimento, me conta: você prefere estudar presencial ou online?`,
        buttons: [
          { id: "QUAL_MOD_PRESENCIAL", title: "Presencial" },
          { id: "QUAL_MOD_ONLINE", title: "Online" },
        ],
      };
    case "unidade":
      return {
        body: "Perfeito! Qual unidade fica melhor pra você?",
        buttons: [
          { id: "QUAL_UNI_CHAPECO", title: "Chapecó" },
          { id: "QUAL_UNI_PASSO_FUNDO", title: "Passo Fundo" },
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

  switch (step) {
    case "modalidade": {
      const online = buttonPayload === "QUAL_MOD_ONLINE" || /\bonline|a distancia|ead\b/.test(text);
      const presencial =
        buttonPayload === "QUAL_MOD_PRESENCIAL" || /presencial|na escola|na unidade/.test(text);
      if (online) return next({ modalidade: "online", unit_interest: "Online" }, "para_quem");
      if (presencial) return next({ modalidade: "presencial" }, "unidade");
      return reask();
    }
    case "unidade": {
      const chapeco = buttonPayload === "QUAL_UNI_CHAPECO" || text.includes("chapec");
      const passo = buttonPayload === "QUAL_UNI_PASSO_FUNDO" || text.includes("passo");
      if (chapeco) return next({ unit_interest: "Chapecó" }, "para_quem");
      if (passo) return next({ unit_interest: "Passo Fundo" }, "para_quem");
      return reask();
    }
    case "para_quem": {
      const propria =
        buttonPayload === "QUAL_QUEM_PROPRIA" || /pra mim|para mim|\beu\b|proprio|mesma/.test(text);
      const outra =
        buttonPayload === "QUAL_QUEM_OUTRA" ||
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
      const basico = buttonPayload === "QUAL_NIVEL_BASICO" || /basic|iniciante|zero|nunca/.test(text);
      const inter = buttonPayload === "QUAL_NIVEL_INTER" || /inter|medio|mais ou menos/.test(text);
      const avancado = buttonPayload === "QUAL_NIVEL_AVANCADO" || /avanc|fluente/.test(text);
      if (basico) return next({ level: "básico" }, null);
      if (inter) return next({ level: "intermediário" }, null);
      if (avancado) return next({ level: "avançado" }, null);
      return reask();
    }
    default:
      return { updates: { qualification_step: "done" }, question: null, understood: true };
  }
}

// Prompt pós-qualificação: template com variáveis preenchidas com o que os
// botões coletaram (editável no Estúdio de IA).
export function renderPostQualificationPrompt(template: string, lead: Lead) {
  const values: Record<string, string> = {
    modalidade: lead.modalidade || "não informada",
    unidade: lead.unit_interest || "não informada",
    para_quem: lead.para_quem === "outra" ? "outra pessoa" : "a própria pessoa",
    idade: lead.idade_aluno || "não informada",
    nome: lead.name || "não informado",
    nivel: lead.level || "não informado",
  };
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}

export const DEFAULT_POST_QUALIFICATION_PROMPT =
  "DADOS COLETADOS NA QUALIFICAÇÃO (o lead JÁ respondeu — NUNCA pergunte de novo): " +
  "modalidade: {modalidade} · unidade: {unidade} · curso para: {para_quem} · idade: {idade} · " +
  "nome do aluno: {nome} · nível: {nivel}. " +
  "Use essas informações naturalmente na conversa (chame pelo nome, personalize pelo nível e modalidade) " +
  "e siga o roteiro a partir do objetivo do lead com o inglês.";
