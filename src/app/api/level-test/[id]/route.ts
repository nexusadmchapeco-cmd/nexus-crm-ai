import { NextResponse } from "next/server";
import {
  answeredSteps,
  currentPhase,
  listeningPlan,
  nextStep,
  normalizeAnswers,
  questionBank,
  speakingPlan,
  totalSteps,
  writingPlan,
  type StoredAnswer,
  type TestAnswers,
  type TestLevel,
} from "@/lib/level-test";
import { evaluateOpenAnswer } from "@/lib/level-test-ai";
import { computeSkills, finalizeTest, resultPayload } from "@/lib/level-test-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

function phasePayload(testId: string, answers: TestAnswers, leadName: string | null) {
  const phase = currentPhase(testId, answers);
  const base = {
    done: false,
    phase,
    lead_name: leadName,
    answered: answeredSteps(answers),
    total: totalSteps,
  };
  if (phase === "grammar") {
    const step = nextStep(testId, answers.grammar);
    if (!step.done) {
      const { id, level, prompt, options } = step.question;
      return { ...base, question: { id, level, prompt, options } };
    }
  }
  if (phase === "listening") {
    const item = listeningPlan(testId)[answers.listening.length];
    return {
      ...base,
      listening: {
        id: item.id,
        level: item.level,
        prompt: item.prompt,
        options: item.options,
        audio_url: `/api/level-test/${testId}/audio?item=${item.id}`,
      },
    };
  }
  if (phase === "writing") {
    const prompt = writingPlan(testId);
    return { ...base, open_prompt: prompt };
  }
  if (phase === "speaking") {
    const prompt = speakingPlan(testId);
    return { ...base, open_prompt: prompt };
  }
  return base;
}

async function loadTest(id: string) {
  const supabase = createAdminClient();
  const { data: test, error } = await supabase
    .from("level_tests")
    .select("id, lead_id, status, cefr_level, score, answers, skills, leads(name)")
    .eq("id", id)
    .maybeSingle();
  return { supabase, test, error };
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { supabase, test, error } = await loadTest(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!test) return NextResponse.json({ error: "Teste não encontrado" }, { status: 404 });
  const leadRow = test.leads as unknown as { name: string | null } | null;

  if (test.status === "completed") {
    return NextResponse.json({
      ...resultPayload({
        cefr: (test.cefr_level || "A1") as TestLevel,
        score: test.score ?? 0,
        skills: test.skills || computeSkills(normalizeAnswers(test.answers)),
      }),
      lead_name: leadRow?.name || null,
    });
  }

  if (test.status === "pending") {
    await supabase
      .from("level_tests")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending");
  }

  const answers = normalizeAnswers(test.answers);
  return NextResponse.json(phasePayload(id, answers, leadRow?.name || null));
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: {
    question_id?: string;
    choice?: number;
    text?: string;
    skip_speaking?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { supabase, test, error } = await loadTest(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!test) return NextResponse.json({ error: "Teste não encontrado" }, { status: 404 });
  const leadRow = test.leads as unknown as { name: string | null } | null;
  if (test.status === "completed") {
    return NextResponse.json({
      ...resultPayload({
        cefr: (test.cefr_level || "A1") as TestLevel,
        score: test.score ?? 0,
        skills: test.skills || computeSkills(normalizeAnswers(test.answers)),
      }),
    });
  }

  const answers = normalizeAnswers(test.answers);
  const phase = currentPhase(id, answers);

  if (phase === "grammar") {
    const step = nextStep(id, answers.grammar);
    if (step.done || body.question_id !== step.question.id || typeof body.choice !== "number") {
      return NextResponse.json({ error: "Pergunta fora de ordem; recarregue a página." }, { status: 409 });
    }
    const bankQuestion = questionBank.find((question) => question.id === body.question_id)!;
    answers.grammar = [
      ...answers.grammar,
      {
        question_id: bankQuestion.id,
        choice: body.choice,
        correct: body.choice === bankQuestion.correct,
        level: bankQuestion.level,
      } satisfies StoredAnswer,
    ];
  } else if (phase === "listening") {
    const item = listeningPlan(id)[answers.listening.length];
    if (!item || body.question_id !== item.id || typeof body.choice !== "number") {
      return NextResponse.json({ error: "Pergunta fora de ordem; recarregue a página." }, { status: 409 });
    }
    answers.listening = [
      ...answers.listening,
      {
        question_id: item.id,
        choice: body.choice,
        correct: body.choice === item.correct,
        level: item.level,
      } satisfies StoredAnswer,
    ];
  } else if (phase === "writing") {
    const text = String(body.text || "").trim();
    if (text.length < 10) {
      return NextResponse.json({ error: "Escreve um pouquinho mais (pelo menos uma frase)." }, { status: 400 });
    }
    const prompt = writingPlan(id);
    try {
      const evaluation = await evaluateOpenAnswer({ skill: "writing", task: prompt.prompt, answer: text });
      answers.writing = { prompt_id: prompt.id, text, ...evaluation };
    } catch (evalError) {
      return NextResponse.json(
        { error: evalError instanceof Error ? evalError.message : "Erro ao avaliar; tente de novo." },
        { status: 502 },
      );
    }
  } else if (phase === "speaking") {
    if (!body.skip_speaking) {
      return NextResponse.json(
        { error: "Envie o áudio pela rota de speaking ou pule a etapa." },
        { status: 400 },
      );
    }
    answers.speaking = { prompt_id: speakingPlan(id).id, skipped: true };
  } else {
    return NextResponse.json({ error: "Teste já finalizado; recarregue a página." }, { status: 409 });
  }

  if (currentPhase(id, answers) === "done") {
    const { combined, skills } = await finalizeTest(supabase, test, answers);
    return NextResponse.json(resultPayload({ cefr: combined.cefr, score: combined.score, skills }));
  }

  const { error: updateError } = await supabase
    .from("level_tests")
    .update({ answers, status: "in_progress" })
    .eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json(phasePayload(id, answers, leadRow?.name || null));
}
