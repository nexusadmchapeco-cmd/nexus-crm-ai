import { NextResponse } from "next/server";
import { isAnthropicModel, resolveAnthropicKey } from "@/lib/ai/anthropic";
import { supportsTemperature } from "@/lib/ai/openai";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const startedAt = Date.now();
  try {
    const { data: settings, error } = await createAdminClient()
      .from("ai_settings")
      .select("model")
      .order("created_at")
      .limit(1)
      .single();
    if (error) throw error;
    const model = settings.model || process.env.CONVERSATION_MODEL || "claude-sonnet-5";

    // Modelo Claude: testa a conexão com a Anthropic.
    if (isAnthropicModel(model)) {
      const anthropicKey = await resolveAnthropicKey();
      if (!anthropicKey) {
        return NextResponse.json(
          { error: "Chave da Anthropic não configurada." },
          { status: 500 },
        );
      }
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 8,
          messages: [{ role: "user", content: "Responda somente OK." }],
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message || `Anthropic respondeu ${response.status}.`);
      }
      return NextResponse.json({ ok: true, model, latency_ms: Date.now() - startedAt });
    }

    // Modelo OpenAI (GPT).
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY não configurada." }, { status: 500 });
    }
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        // GPT-5 (reasoning) rejeita temperature e usa max_completion_tokens.
        ...(supportsTemperature(model)
          ? { temperature: 0, max_tokens: 5 }
          : { max_completion_tokens: 16 }),
        messages: [
          { role: "system", content: "Responda somente OK." },
          { role: "user", content: "Teste de conexão." },
        ],
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error?.message || `OpenAI respondeu ${response.status}.`);
    }
    return NextResponse.json({ ok: true, model, latency_ms: Date.now() - startedAt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao testar a conexão." },
      { status: 500 },
    );
  }
}
