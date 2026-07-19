// Teste de nível adaptativo baseado no Quadro Comum Europeu (CEFR).
// Começa no A1 e sobe de nível conforme a pessoa acerta; errar 2 de 3 no
// nível encerra o teste. Questões mais difíceis valem mais pontos.

export type TestLevel = "A1" | "A2" | "B1" | "B2";

export const testLevels: TestLevel[] = ["A1", "A2", "B1", "B2"];

export const levelWeights: Record<TestLevel, number> = { A1: 1, A2: 2, B1: 3, B2: 4 };

export const levelLabels: Record<TestLevel, string> = {
  A1: "Básico",
  A2: "Intermediário inicial",
  B1: "Intermediário",
  B2: "Avançado",
};

export const levelDescriptions: Record<TestLevel, string> = {
  A1: "Você entende frases simples do dia a dia e está construindo a base do inglês.",
  A2: "Você se vira em situações comuns e entende conversas simples do cotidiano.",
  B1: "Você conversa com autonomia sobre temas variados e entende a maior parte do que ouve.",
  B2: "Você se comunica com fluência e naturalidade na grande maioria das situações.",
};

export type Question = {
  id: string;
  level: TestLevel;
  prompt: string;
  options: string[];
  correct: number;
};

const QUESTIONS_PER_LEVEL = 3;
const PASS_THRESHOLD = 2;

export const questionBank: Question[] = [
  // A1
  { id: "a1-1", level: "A1", prompt: "Complete: “My name ___ John.”", options: ["are", "is", "am", "be"], correct: 1 },
  { id: "a1-2", level: "A1", prompt: "O que significa “apple”?", options: ["Abacaxi", "Uva", "Maçã", "Laranja"], correct: 2 },
  { id: "a1-3", level: "A1", prompt: "Complete: “I ___ from Brazil.”", options: ["is", "are", "be", "am"], correct: 3 },
  { id: "a1-4", level: "A1", prompt: "Qual é o plural de “book”?", options: ["bookes", "books", "bookies", "book"], correct: 1 },
  { id: "a1-5", level: "A1", prompt: "“Good morning” significa:", options: ["Boa noite", "Boa tarde", "Bom dia", "Até logo"], correct: 2 },
  { id: "a1-6", level: "A1", prompt: "Complete: “She ___ a teacher.”", options: ["is", "are", "am", "have"], correct: 0 },
  // A2
  { id: "a2-1", level: "A2", prompt: "Complete: “Yesterday I ___ to the beach.”", options: ["go", "goed", "went", "gone"], correct: 2 },
  { id: "a2-2", level: "A2", prompt: "Complete: “There ___ many people at the party last night.”", options: ["was", "were", "is", "be"], correct: 1 },
  { id: "a2-3", level: "A2", prompt: "Qual frase está correta?", options: ["She don't like coffee.", "She doesn't likes coffee.", "She doesn't like coffee.", "She not like coffee."], correct: 2 },
  { id: "a2-4", level: "A2", prompt: "Complete: “I'm taller ___ my brother.”", options: ["that", "then", "as", "than"], correct: 3 },
  { id: "a2-5", level: "A2", prompt: "Em “I usually wake up at 7”, “usually” significa:", options: ["raramente", "geralmente", "nunca", "cedo"], correct: 1 },
  { id: "a2-6", level: "A2", prompt: "Complete: “We ___ watching TV when you called.”", options: ["was", "are", "were", "is"], correct: 2 },
  // B1
  { id: "b1-1", level: "B1", prompt: "Complete: “If it rains tomorrow, I ___ at home.”", options: ["will stay", "would stay", "stayed", "stay"], correct: 0 },
  { id: "b1-2", level: "B1", prompt: "Complete: “I've lived here ___ 2019.”", options: ["for", "since", "from", "during"], correct: 1 },
  { id: "b1-3", level: "B1", prompt: "Qual frase está correta?", options: ["I never been to London.", "I've never gone London.", "I've never been to London.", "I never was in London."], correct: 2 },
  { id: "b1-4", level: "B1", prompt: "Complete: “She said she ___ tired.”", options: ["is", "be", "was", "were"], correct: 2 },
  { id: "b1-5", level: "B1", prompt: "“I'm looking forward to seeing you” expressa:", options: ["medo", "expectativa positiva", "dúvida", "desinteresse"], correct: 1 },
  { id: "b1-6", level: "B1", prompt: "Complete: “You ___ smoke here. It's forbidden.”", options: ["don't have to", "shouldn't need", "mustn't", "couldn't"], correct: 2 },
  // B2
  { id: "b2-1", level: "B2", prompt: "Complete: “If I had studied more, I ___ the test.”", options: ["would pass", "would have passed", "will pass", "had passed"], correct: 1 },
  { id: "b2-2", level: "B2", prompt: "Complete: “The report ___ by the team yesterday.”", options: ["was written", "wrote", "has written", "is writing"], correct: 0 },
  { id: "b2-3", level: "B2", prompt: "“She's been working here for ages” — “for ages” significa:", options: ["há pouco tempo", "com dificuldade", "há muito tempo", "por obrigação"], correct: 2 },
  { id: "b2-4", level: "B2", prompt: "Qual frase está correta?", options: ["Hardly I had arrived when the meeting started.", "Hardly had I arrived when the meeting started.", "Hardly I arrived when the meeting had started.", "I hardly had arrived when started the meeting."], correct: 1 },
  { id: "b2-5", level: "B2", prompt: "“To put off a meeting” significa:", options: ["cancelar a reunião", "encerrar a reunião", "adiar a reunião", "organizar a reunião"], correct: 2 },
  { id: "b2-6", level: "B2", prompt: "Complete: “I'd rather you ___ that to anyone.”", options: ["don't say", "didn't say", "won't say", "not say"], correct: 1 },
];

export type StoredAnswer = {
  question_id: string;
  choice: number;
  correct: boolean;
  level: TestLevel;
};

function seededShuffle(seed: string, size: number): number[] {
  let hash = 5381;
  for (const char of seed) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
  let state = hash || 1;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const indexes = Array.from({ length: size }, (_, index) => index);
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  return indexes;
}

/** Plano determinístico do teste: 3 questões por nível, sorteadas pelo id do teste. */
export function buildPlan(testId: string): Record<TestLevel, Question[]> {
  const plan = {} as Record<TestLevel, Question[]>;
  for (const level of testLevels) {
    const pool = questionBank.filter((question) => question.level === level);
    const order = seededShuffle(`${testId}:${level}`, pool.length);
    plan[level] = order.slice(0, QUESTIONS_PER_LEVEL).map((index) => pool[index]);
  }
  return plan;
}

export const totalQuestions = testLevels.length * QUESTIONS_PER_LEVEL;

type Progress =
  | { done: false; question: Question; position: number }
  | { done: true };

/** Recalcula, a partir das respostas salvas, qual é a próxima pergunta. */
export function nextStep(testId: string, answers: StoredAnswer[]): Progress {
  const plan = buildPlan(testId);
  let position = 0;
  for (const level of testLevels) {
    const levelAnswers = answers.filter((answer) => answer.level === level);
    if (levelAnswers.length < QUESTIONS_PER_LEVEL) {
      return { done: false, question: plan[level][levelAnswers.length], position: position + levelAnswers.length + 1 };
    }
    position += QUESTIONS_PER_LEVEL;
    const correctCount = levelAnswers.filter((answer) => answer.correct).length;
    if (correctCount < PASS_THRESHOLD) return { done: true };
  }
  return { done: true };
}

export function evaluate(answers: StoredAnswer[]): {
  cefr: TestLevel;
  score: number;
  passedAny: boolean;
} {
  let cefr: TestLevel = "A1";
  let passedAny = false;
  for (const level of testLevels) {
    const levelAnswers = answers.filter((answer) => answer.level === level);
    if (levelAnswers.length < QUESTIONS_PER_LEVEL) break;
    const correctCount = levelAnswers.filter((answer) => answer.correct).length;
    if (correctCount >= PASS_THRESHOLD) {
      cefr = level;
      passedAny = true;
    } else {
      break;
    }
  }
  const asked = answers.reduce((sum, answer) => sum + levelWeights[answer.level], 0);
  const earned = answers.reduce(
    (sum, answer) => sum + (answer.correct ? levelWeights[answer.level] : 0),
    0,
  );
  const score = asked > 0 ? Math.round((earned / asked) * 100) : 0;
  return { cefr, score, passedAny };
}

export function appBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "https://nexus-crm-ai-azure.vercel.app";
}
