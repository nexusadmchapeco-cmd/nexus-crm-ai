// Cérebro da conversa via Anthropic (Claude).
//
// A saída estruturada (o objeto AiDecision) é obtida com "tool use" forçado:
// declaramos uma ferramenta cujo input_schema é o formato desejado e obrigamos
// o modelo a chamá-la (tool_choice). Assim recebemos JSON validado, do mesmo
// jeito que o response_format:json_schema faz na OpenAI.
//
// A chave pode vir do banco (app_secrets.anthropic_api_key, prioridade) ou da
// env ANTHROPIC_API_KEY. Áudio (transcrição do lead) continua na OpenAI — a
// Anthropic não faz transcrição.

import { createAdminClient } from "@/lib/supabase/admin";

export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5";

export function isAnthropicModel(model: string) {
  return model.startsWith("claude");
}

let cachedKey: { value: string | null; fetchedAt: number } | null = null;
const KEY_CACHE_MS = 60_000;

export async function resolveAnthropicKey(): Promise<string | null> {
  if (cachedKey && Date.now() - cachedKey.fetchedAt < KEY_CACHE_MS) return cachedKey.value;
  let value: string | null = null;
  try {
    const { data } = await createAdminClient()
      .from("app_secrets")
      .select("value")
      .eq("name", "anthropic_api_key")
      .maybeSingle();
    value = data?.value?.trim() || null;
  } catch {
    value = null;
  }
  if (!value) value = process.env.ANTHROPIC_API_KEY?.trim() || null;
  cachedKey = { value, fetchedAt: Date.now() };
  return value;
}

type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/**
 * Chama a Messages API forçando uma ferramenta e devolve o input já parseado
 * (o objeto estruturado). Sem "thinking": para um SDR de chat a resposta
 * precisa ser rápida, e uso forçado de ferramenta não combina com thinking.
 */
export async function anthropicToolCall({
  apiKey,
  model,
  system,
  userContent,
  tool,
  maxTokens = 1500,
}: {
  apiKey: string;
  model: string;
  system: string;
  userContent: string;
  tool: AnthropicTool;
  maxTokens?: number;
}): Promise<Record<string, unknown>> {
  // Sem `temperature`: os modelos Claude atuais (Sonnet 5 em diante) a
  // depreciaram e retornam 400 se ela for enviada.
  //
  // Cache de prompt: o ponto de corte (cache_control) fica no fim do bloco do
  // sistema, então tudo que vem antes dele no prefixo — a ferramenta + todo o
  // roteiro/base de conhecimento/regras — é cacheado. Em turnos seguintes da
  // mesma conversa (janela de ~5 min) essa parte é lida a ~10% do preço, o que
  // barateia bastante cada resposta.
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userContent }],
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic respondeu ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    content?: { type: string; input?: Record<string, unknown> }[];
  };
  const toolUse = payload.content?.find((block) => block.type === "tool_use");
  if (!toolUse?.input) throw new Error("A Anthropic não retornou uma decisão estruturada");
  return toolUse.input;
}
