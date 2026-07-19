import type { SupabaseClient } from "@supabase/supabase-js";
import {
  combineSkills,
  evaluate,
  levelDescriptions,
  levelLabels,
  listeningResult,
  skillLabels,
  type SkillKey,
  type SkillResult,
  type TestAnswers,
  type TestLevel,
} from "@/lib/level-test";

export type SkillsPayload = Partial<Record<SkillKey, (SkillResult & { feedback?: string }) | null>>;

export function computeSkills(answers: TestAnswers): SkillsPayload {
  const reading = evaluate(answers.grammar);
  const listening = answers.listening.length ? listeningResult(answers.listening) : null;
  const writing = answers.writing
    ? { score: answers.writing.score, cefr: answers.writing.cefr }
    : null;
  const speaking =
    answers.speaking && !("skipped" in answers.speaking)
      ? { score: answers.speaking.score, cefr: answers.speaking.cefr }
      : null;
  return {
    reading: { score: reading.score, cefr: reading.cefr },
    listening,
    writing,
    speaking,
  };
}

export async function finalizeTest(
  supabase: SupabaseClient,
  test: { id: string; lead_id: string | null },
  answers: TestAnswers,
) {
  const skills = computeSkills(answers);
  const combined = combineSkills(skills);
  await supabase
    .from("level_tests")
    .update({
      answers,
      skills,
      status: "completed",
      cefr_level: combined.cefr,
      score: combined.score,
      completed_at: new Date().toISOString(),
    })
    .eq("id", test.id);
  if (test.lead_id) {
    await Promise.all([
      supabase
        .from("leads")
        .update({
          level: `${combined.cefr} · ${levelLabels[combined.cefr]} (teste de nível)`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", test.lead_id),
      supabase.from("lead_events").insert({
        lead_id: test.lead_id,
        event_type: "level_test_completed",
        metadata: { cefr_level: combined.cefr, score: combined.score, skills },
      }),
    ]);
  }
  return { combined, skills };
}

export function resultPayload(input: {
  cefr: TestLevel;
  score: number;
  skills: SkillsPayload;
}) {
  return {
    done: true,
    result: {
      cefr_level: input.cefr,
      label: levelLabels[input.cefr],
      description: levelDescriptions[input.cefr],
      score: input.score,
      skills: (Object.keys(skillLabels) as SkillKey[]).map((key) => ({
        key,
        label: skillLabels[key],
        result: input.skills[key] || null,
      })),
    },
  };
}
