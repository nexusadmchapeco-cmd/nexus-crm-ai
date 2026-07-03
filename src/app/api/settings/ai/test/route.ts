import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const startedAt = Date.now();
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY não configurada." }, { status: 500 });
    }
    const { data: settings, error } = await createAdminClient()
      .from("ai_settings")
      .select("model")
      .order("created_at")
      .limit(1)
      .single();
    if (error) throw error;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: settings.model || process.env.OPENAI_MODEL || "gpt-4.1-mini",
        temperature: 0,
        max_tokens: 5,
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
    return NextResponse.json({
      ok: true,
      model: settings.model,
      latency_ms: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao testar a OpenAI." },
      { status: 500 },
    );
  }
}
