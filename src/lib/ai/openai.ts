// Utilitários para chamadas de chat na OpenAI.
//
// Modelos da família GPT-5 (reasoning) rejeitam o parâmetro `temperature`;
// só o enviamos para modelos que o aceitam. Se o modelo escolhido não estiver
// liberado na conta (403/404) ou falhar, caímos para o FALLBACK_MODEL para o
// atendimento nunca parar.

export const FALLBACK_MODEL = "gpt-4.1-mini";

// Lista de modelos do seletor no Estúdio de IA. Claude (Anthropic) primeiro —
// é o cérebro padrão da conversa; os GPT ficam como alternativa.
export const conversationModels = [
  { value: "claude-sonnet-5", label: "Claude Sonnet 5 · segue o roteiro melhor (recomendado)" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 · mais rápido e econômico" },
  { value: "claude-opus-4-8", label: "Claude Opus 4.8 · máxima qualidade" },
  { value: "gpt-5-mini", label: "GPT-5 mini · alternativa OpenAI" },
  { value: "gpt-4.1", label: "GPT-4.1 · alternativa OpenAI" },
  { value: "gpt-4o", label: "GPT-4o · alternativa OpenAI" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 mini · alternativa econômica" },
];

export function supportsTemperature(model: string) {
  return model.startsWith("gpt-4") || model.includes("chat");
}

// Modelos GPT-5 (reasoning) "pensam" antes de responder, o que adiciona
// latência. Para um SDR de chat o esforço mínimo já basta e deixa a resposta
// muito mais rápida.
export function isReasoningModel(model: string) {
  return model.startsWith("gpt-5") || model.startsWith("o1") || model.startsWith("o3");
}

export function buildChatBody(
  model: string,
  temperature: number | null | undefined,
  rest: Record<string, unknown>,
) {
  return {
    model,
    ...(temperature != null && supportsTemperature(model) ? { temperature } : {}),
    ...(isReasoningModel(model) ? { reasoning_effort: "low" } : {}),
    ...rest,
  };
}

export async function chatCompletionWithFallback({
  apiKey,
  model,
  temperature,
  body,
}: {
  apiKey: string;
  model: string;
  temperature: number | null | undefined;
  body: Record<string, unknown>;
}): Promise<{ payload: Record<string, unknown> & { choices?: { message?: { content?: string } }[] }; modelUsed: string }> {
  const call = async (useModel: string) =>
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildChatBody(useModel, temperature, body)),
    });

  let response = await call(model);
  let modelUsed = model;
  if (!response.ok && model !== FALLBACK_MODEL) {
    // Modelo indisponível na conta, nome errado ou parâmetro rejeitado:
    // tenta uma única vez com o modelo padrão para não derrubar o fluxo.
    response = await call(FALLBACK_MODEL);
    modelUsed = FALLBACK_MODEL;
  }
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI respondeu ${response.status}: ${errorBody.slice(0, 300)}`);
  }
  return { payload: await response.json(), modelUsed };
}
