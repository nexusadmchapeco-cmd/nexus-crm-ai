import { NextResponse } from "next/server";
import { currentPhase, normalizeAnswers, speakingPlan } from "@/lib/level-test";
import { evaluateOpenAnswer, transcribeAudio } from "@/lib/level-test-ai";
import { finalizeTest, resultPayload } from "@/lib/level-test-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envie o áudio como multipart/form-data." }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "Áudio não recebido; grave de novo." }, { status: 400 });
  }
  if (audio.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "Áudio muito longo; grave até ~1 minuto." }, { status: 413 });
  }

  const supabase = createAdminClient();
  const { data: test, error } = await supabase
    .from("level_tests")
    .select("id, lead_id, status, answers")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!test) return NextResponse.json({ error: "Teste não encontrado" }, { status: 404 });
  if (test.status === "completed") {
    return NextResponse.json({ error: "Teste já finalizado." }, { status: 409 });
  }

  const answers = normalizeAnswers(test.answers);
  if (currentPhase(id, answers) !== "speaking") {
    return NextResponse.json({ error: "Etapa fora de ordem; recarregue a página." }, { status: 409 });
  }

  const prompt = speakingPlan(id);
  try {
    // Guarda o áudio original no bucket privado antes de transcrever, para o
    // avaliador poder reouvir depois. Falha no upload não derruba o teste.
    let audioPath: string | undefined;
    try {
      const path = `${id}/${prompt.id}.webm`;
      const buffer = Buffer.from(await audio.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from("level-test-audio")
        .upload(path, buffer, {
          contentType: audio.type || "audio/webm",
          upsert: true,
        });
      if (!uploadError) audioPath = path;
    } catch {
      audioPath = undefined;
    }

    const transcript = (await transcribeAudio(audio, "en")).trim();
    const evaluation = await evaluateOpenAnswer({
      skill: "speaking",
      task: prompt.prompt,
      answer: transcript || "(nada compreensível foi dito)",
    });
    answers.speaking = { prompt_id: prompt.id, transcript, audio_path: audioPath, ...evaluation };
  } catch (speakingError) {
    return NextResponse.json(
      {
        error:
          speakingError instanceof Error
            ? speakingError.message
            : "Não consegui processar o áudio; tente de novo.",
      },
      { status: 502 },
    );
  }

  const { combined, skills } = await finalizeTest(supabase, test, answers);
  return NextResponse.json(resultPayload({ cefr: combined.cefr, score: combined.score, skills }));
}
