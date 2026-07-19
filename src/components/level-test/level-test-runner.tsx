"use client";

import { useEffect, useState } from "react";

type PublicQuestion = { id: string; level: string; prompt: string; options: string[] };

type StepResponse = {
  done: boolean;
  lead_name?: string | null;
  position?: number;
  total?: number;
  answered?: number;
  question?: PublicQuestion;
  result?: {
    cefr_level: string;
    label: string;
    description: string;
    score: number;
    correct: number;
    answered: number;
  };
  error?: string;
};

const levelChipLabels: Record<string, string> = {
  A1: "Nível A1",
  A2: "Nível A2",
  B1: "Nível B1",
  B2: "Nível B2",
};

export function LevelTestRunner({ testId }: { testId: string }) {
  const [state, setState] = useState<StepResponse | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/level-test/${testId}`)
      .then(async (response) => {
        const data = (await response.json()) as StepResponse;
        if (!active) return;
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar o teste.");
        setState(data);
        if (data.done) setStarted(true);
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Erro ao carregar.");
      });
    return () => {
      active = false;
    };
  }, [testId]);

  async function answer(choice: number) {
    if (sending || !state?.question) return;
    setSelected(choice);
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/level-test/${testId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: state.question.id, choice }),
      });
      const data = (await response.json()) as StepResponse;
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar a resposta.");
      setState((current) => ({ ...data, lead_name: current?.lead_name }));
      setSelected(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro ao enviar.");
      setSelected(null);
    } finally {
      setSending(false);
    }
  }

  const progress = state?.done
    ? 100
    : state?.answered != null && state?.total
      ? Math.round((state.answered / state.total) * 100)
      : 0;

  return (
    <div className="level-test-page">
      <div className="level-test-card">
        <div className="level-test-brand">
          <span className="level-test-mark">N</span>
          <div>
            <strong>Nexus English Center</strong>
            <small>Teste de nível de inglês</small>
          </div>
        </div>

        {error && <div className="level-test-error">{error}</div>}

        {!state && !error && <p className="level-test-loading">Carregando seu teste…</p>}

        {state && !state.done && !started && (
          <div className="level-test-intro">
            <h1>
              {state.lead_name ? `${state.lead_name.split(" ")[0]}, vamos` : "Vamos"} descobrir seu
              nível de inglês?
            </h1>
            <p>
              São perguntas rápidas de múltipla escolha. O teste se adapta a você: acertando, as
              perguntas ficam mais difíceis. Leva uns 2 minutos.
            </p>
            <button className="level-test-start" onClick={() => setStarted(true)}>
              Começar o teste
            </button>
          </div>
        )}

        {state && !state.done && started && state.question && (
          <div className="level-test-question" key={state.question.id}>
            <div className="level-test-progress">
              <div className="level-test-progress-bar">
                <i style={{ width: `${Math.max(progress, 4)}%` }} />
              </div>
              <div className="level-test-progress-meta">
                <span>Pergunta {state.position}</span>
                <span className="level-test-chip">{levelChipLabels[state.question.level] || state.question.level}</span>
              </div>
            </div>
            <h2>{state.question.prompt}</h2>
            <div className="level-test-options">
              {state.question.options.map((option, index) => (
                <button
                  key={index}
                  disabled={sending}
                  className={selected === index ? "picked" : ""}
                  onClick={() => void answer(index)}
                >
                  <b>{String.fromCharCode(65 + index)}</b>
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}

        {state?.done && state.result && (
          <div className="level-test-result">
            <span className="level-test-result-kicker">Seu resultado</span>
            <div className="level-test-result-badge">{state.result.cefr_level}</div>
            <h1>{state.result.label}</h1>
            <p>{state.result.description}</p>
            <div className="level-test-result-stats">
              <div>
                <strong>{state.result.correct}/{state.result.answered}</strong>
                <span>acertos</span>
              </div>
              <div>
                <strong>{state.result.score}</strong>
                <span>pontuação</span>
              </div>
            </div>
            <p className="level-test-result-note">
              Prontinho! Já recebemos seu resultado — pode voltar pro WhatsApp que seguimos a
              conversa por lá. 😉
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
