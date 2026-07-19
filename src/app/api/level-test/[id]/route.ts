import { NextResponse } from "next/server";
import {
  evaluate,
  levelDescriptions,
  levelLabels,
  nextStep,
  questionBank,
  totalQuestions,
  type StoredAnswer,
} from "@/lib/level-test";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

type RouteContext = { params: Promise<{ id: string }> };

function publicQuestion(question: { id: string; level: string; prompt: string; options: string[] }) {
  return { id: question.id, level: question.level, prompt: question.prompt, options: question.options };
}

function resultPayload(test: { cefr_level: string | null; score: number | null; answers: unknown }) {
  const answers = (test.answers || []) as StoredAnswer[];
  const cefr = (test.cefr_level || "A1") as keyof typeof levelLabels;
  return {
    done: true,
    result: {
      cefr_level: cefr,
      label: levelLabels[cefr],
      description: levelDescriptions[cefr],
      score: test.score ?? 0,
      correct: answers.filter((answer) => answer.correct).length,
      answered: answers.length,
    },
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = createAdminClient();
  const { data: test, error } = await supabase
    .from("level_tests")
    .select("id, status, cefr_level, score, answers, leads(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!test) return NextResponse.json({ error: "Teste não encontrado" }, { status: 404 });
  const leadRow = test.leads as unknown as { name: string | null } | null;

  if (test.status === "completed") {
    return NextResponse.json({ ...resultPayload(test), lead_name: leadRow?.name || null });
  }

  if (test.status === "pending") {
    await supabase
      .from("level_tests")
      .update({ status: "in_progress", started_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending");
  }

  const answers = (test.answers || []) as StoredAnswer[];
  const step = nextStep(id, answers);
  if (step.done) {
    return NextResponse.json({ error: "Estado inválido; recarregue a página." }, { status: 409 });
  }
  return NextResponse.json({
    done: false,
    lead_name: leadRow?.name || null,
    position: step.position,
    total: totalQuestions,
    answered: answers.length,
    question: publicQuestion(step.question),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: { question_id?: string; choice?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
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
    const { data: fresh } = await supabase
      .from("level_tests")
      .select("cefr_level, score, answers")
      .eq("id", id)
      .single();
    return NextResponse.json(resultPayload(fresh!));
  }

  const answers = (test.answers || []) as StoredAnswer[];
  const step = nextStep(id, answers);
  if (step.done) {
    return NextResponse.json({ error: "Teste já finalizado; recarregue a página." }, { status: 409 });
  }
  if (body.question_id !== step.question.id || typeof body.choice !== "number") {
    return NextResponse.json({ error: "Pergunta fora de ordem; recarregue a página." }, { status: 409 });
  }
  const bankQuestion = questionBank.find((question) => question.id === body.question_id)!;
  const updatedAnswers: StoredAnswer[] = [
    ...answers,
    {
      question_id: bankQuestion.id,
      choice: body.choice,
      correct: body.choice === bankQuestion.correct,
      level: bankQuestion.level,
    },
  ];

  const after = nextStep(id, updatedAnswers);
  if (!after.done) {
    const { error: updateError } = await supabase
      .from("level_tests")
      .update({ answers: updatedAnswers, status: "in_progress" })
      .eq("id", id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
    return NextResponse.json({
      done: false,
      position: after.position,
      total: totalQuestions,
      answered: updatedAnswers.length,
      question: publicQuestion(after.question),
    });
  }

  const { cefr, score } = evaluate(updatedAnswers);
  const { error: completeError } = await supabase
    .from("level_tests")
    .update({
      answers: updatedAnswers,
      status: "completed",
      cefr_level: cefr,
      score,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (completeError) return NextResponse.json({ error: completeError.message }, { status: 500 });

  await Promise.all([
    supabase
      .from("leads")
      .update({ level: `${cefr} · ${levelLabels[cefr]} (teste de nível)`, updated_at: new Date().toISOString() })
      .eq("id", test.lead_id),
    supabase.from("lead_events").insert({
      lead_id: test.lead_id,
      event_type: "level_test_completed",
      metadata: { cefr_level: cefr, score, answered: updatedAnswers.length },
    }),
  ]);

  return NextResponse.json(
    resultPayload({ cefr_level: cefr, score, answers: updatedAnswers }),
  );
}
