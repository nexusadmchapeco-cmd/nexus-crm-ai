import type { SkillResult, TestLevel } from "@/lib/level-test";

const evalSchema = {
  name: "level_test_skill_eval",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["cefr", "score", "feedback"],
    properties: {
      cefr: { type: "string", enum: ["A1", "A2", "B1", "B2"] },
      score: { type: "integer", minimum: 0, maximum: 100 },
      feedback: { type: "string" },
    },
  },
};

export async function evaluateOpenAnswer({
  skill,
  task,
  answer,
}: {
  skill: "writing" | "speaking";
  task: string;
  answer: string;
}): Promise<SkillResult & { feedback: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");

  const skillNote =
    skill === "speaking"
      ? "O texto é a TRANSCRIÇÃO de um áudio falado. Avalie fluência aparente, vocabulário, gramática e capacidade de se comunicar. Ignore pontuação e capitalização (vêm da transcrição automática). Respostas muito curtas (menos de ~15 palavras) indicam nível baixo."
      : "Avalie gramática, vocabulário, estrutura das frases e clareza. Respostas de 1-2 frases simples corretas ~A2; frases conectadas com bom vocabulário ~B1; estruturas complexas e naturais ~B2.";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.2,
      response_format: { type: "json_schema", json_schema: evalSchema },
      messages: [
        {
          role: "system",
          content: `Você é um avaliador CEFR de inglês (níveis A1, A2, B1, B2) de uma escola de idiomas. Avalie a resposta de um aluno brasileiro à tarefa dada. ${skillNote} Se a resposta estiver em português, vazia ou sem relação com inglês, dê A1 com score baixo (0-20). Seja justo: não infle nem derrube o nível. "feedback" = 1 frase curta em português, encorajadora e específica.`,
        },
        {
          role: "user",
          content: `Tarefa: ${task}\n\nResposta do aluno:\n${answer.slice(0, 2000)}`,
        },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI respondeu ${response.status}: ${body.slice(0, 200)}`);
  }
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Avaliação vazia da OpenAI");
  const parsed = JSON.parse(content) as { cefr: TestLevel; score: number; feedback: string };
  return { cefr: parsed.cefr, score: parsed.score, feedback: parsed.feedback };
}

export async function transcribeAudio(file: File): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");
  const form = new FormData();
  form.append("file", file, file.name || "speaking.webm");
  form.append("model", "whisper-1");
  form.append("language", "en");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Transcrição falhou (${response.status}): ${body.slice(0, 200)}`);
  }
  const payload = await response.json();
  return String(payload.text || "");
}

export async function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "tts-1", voice: "alloy", input: text, response_format: "mp3" }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`TTS falhou (${response.status}): ${body.slice(0, 200)}`);
  }
  return response.arrayBuffer();
}
