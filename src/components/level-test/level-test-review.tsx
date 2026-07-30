"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import {
  levelLabels,
  listeningBank,
  normalizeAnswers,
  questionBank,
  skillLabels,
  type SkillKey,
  type StoredAnswer,
  type TestLevel,
} from "@/lib/level-test";
import type { LevelTest } from "@/lib/types";

const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"];

const questionMap = new Map(questionBank.map((question) => [question.id, question]));
const listeningMap = new Map(listeningBank.map((item) => [item.id, item]));

type SkillScore = { score: number; cefr: string };

export function LevelTestReview({ test }: { test: LevelTest }) {
  const answers = useMemo(() => normalizeAnswers(test.answers), [test.answers]);
  const skills = (test.skills || null) as Record<string, SkillScore> | null;

  const [reviewedLevel, setReviewedLevel] = useState(test.reviewed_level || "");
  const [reviewerName, setReviewerName] = useState(test.reviewed_by || "");
  const [reviewerNote, setReviewerNote] = useState(test.reviewer_note || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Player do speaking (signed URL sob demanda).
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);

  const speaking = answers.speaking;
  const speakingAudioPath =
    speaking && "audio_path" in speaking ? speaking.audio_path : undefined;

  async function playSpeaking() {
    if (!speakingAudioPath || loadingAudio) return;
    setLoadingAudio(true);
    try {
      const response = await fetch(
        `/api/level-test/${test.id}/audio-file?path=${encodeURIComponent(speakingAudioPath)}`,
      );
      const data = await response.json();
      if (data.url) setAudioUrl(data.url);
    } finally {
      setLoadingAudio(false);
    }
  }

  async function saveReview() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/level-test/${test.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewed_level: reviewedLevel || null,
          reviewed_by: reviewerName || null,
          reviewer_note: reviewerNote || null,
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Erro ao salvar.");
      setMessage("Correção salva. O nível ajustado passa a valer para o lead.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  function renderChoice(
    answer: StoredAnswer,
    prompt: string,
    options: string[],
    correct: number,
    extra?: React.ReactNode,
  ) {
    return (
      <div className="review-q" key={answer.question_id}>
        <div className="review-q-head">
          <span className={`review-q-mark ${answer.correct ? "ok" : "no"}`}>
            <Icon name={answer.correct ? "check" : "x"} size={11} />
          </span>
          <strong>{prompt}</strong>
          <span className="review-q-level">{answer.level}</span>
        </div>
        {extra}
        <ul className="review-options">
          {options.map((option, index) => {
            const chosen = index === answer.choice;
            const isCorrect = index === correct;
            return (
              <li
                key={index}
                className={`${isCorrect ? "correct" : ""} ${chosen && !isCorrect ? "wrong" : ""}`}
              >
                {option}
                {isCorrect && <span className="review-tag">correta</span>}
                {chosen && <span className="review-tag chosen">marcou</span>}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const aiLevel = test.cefr_level as TestLevel | null;

  return (
    <div className="review">
      <section className="review-header">
        <div className="review-head-item">
          <span>Nível sugerido pela IA</span>
          <strong>{aiLevel ? `${aiLevel} · ${levelLabels[aiLevel]}` : "—"}</strong>
        </div>
        <div className="review-head-item">
          <span>Nível corrigido</span>
          <strong>{test.reviewed_level || "—"}</strong>
        </div>
        <div className="review-head-item">
          <span>Nota geral</span>
          <strong>{test.score ?? "—"}</strong>
        </div>
        {skills &&
          (Object.keys(skillLabels) as SkillKey[]).map((key) =>
            skills[key] ? (
              <div className="review-head-item" key={key}>
                <span>{skillLabels[key]}</span>
                <strong>
                  {skills[key].cefr} · {skills[key].score}
                </strong>
              </div>
            ) : null,
          )}
      </section>

      {answers.grammar.length > 0 && (
        <section className="review-section">
          <h3>Reading &amp; Grammar</h3>
          {answers.grammar.map((answer) => {
            const question = questionMap.get(answer.question_id);
            if (!question) return null;
            return renderChoice(answer, question.prompt, question.options, question.correct);
          })}
        </section>
      )}

      {answers.listening.length > 0 && (
        <section className="review-section">
          <h3>Listening</h3>
          {answers.listening.map((answer) => {
            const item = listeningMap.get(answer.question_id);
            if (!item) return null;
            return renderChoice(
              answer,
              item.prompt,
              item.options,
              item.correct,
              <audio className="review-audio" controls src={`/api/level-test/${test.id}/audio?item=${item.id}`} />,
            );
          })}
        </section>
      )}

      {answers.writing && (
        <section className="review-section">
          <h3>Writing</h3>
          <div className="review-open">
            <div className="review-open-answer">
              <span>Resposta do aluno</span>
              <p>{answers.writing.text || "—"}</p>
            </div>
            <div className="review-open-eval">
              <span>Avaliação da IA</span>
              <strong>
                {answers.writing.cefr} · {answers.writing.score}
              </strong>
            </div>
          </div>
        </section>
      )}

      {speaking && (
        <section className="review-section">
          <h3>Speaking</h3>
          {"skipped" in speaking ? (
            <p className="review-empty">O aluno pulou o speaking.</p>
          ) : (
            <div className="review-open">
              <div className="review-open-answer">
                <span>Transcrição</span>
                <p>{speaking.transcript || "—"}</p>
                {speakingAudioPath ? (
                  audioUrl ? (
                    <audio className="review-audio" controls autoPlay src={audioUrl} />
                  ) : (
                    <button type="button" className="button-small" onClick={() => void playSpeaking()}>
                      {loadingAudio ? "Carregando..." : "Ouvir gravação"}
                    </button>
                  )
                ) : (
                  <em className="review-empty">Áudio não guardado neste teste.</em>
                )}
              </div>
              <div className="review-open-eval">
                <span>Avaliação da IA</span>
                <strong>
                  {speaking.cefr} · {speaking.score}
                </strong>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="review-section review-adjust">
        <h3>Ajuste manual</h3>
        <div className="review-adjust-row">
          <label>
            Nível CEFR final
            <select value={reviewedLevel} onChange={(event) => setReviewedLevel(event.target.value)}>
              <option value="">Manter sugestão da IA</option>
              {CEFR.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </label>
          <label>
            Avaliador
            <input value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} placeholder="Seu nome" />
          </label>
        </div>
        <textarea
          placeholder="Comentário da correção (opcional)"
          value={reviewerNote}
          onChange={(event) => setReviewerNote(event.target.value)}
        />
        {message && <div className="review-message">{message}</div>}
        <button type="button" className="button button-primary" disabled={saving} onClick={() => void saveReview()}>
          {saving ? "Salvando..." : "Salvar correção"}
        </button>
      </section>
    </div>
  );
}
