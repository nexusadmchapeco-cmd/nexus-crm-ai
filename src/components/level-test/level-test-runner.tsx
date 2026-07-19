"use client";

import { useEffect, useRef, useState } from "react";

type PublicQuestion = { id: string; level: string; prompt: string; options: string[] };
type ListeningItem = PublicQuestion & { audio_url: string };
type OpenPrompt = { id: string; prompt: string; helper: string };
type SkillRow = {
  key: string;
  label: string;
  result: { score: number; cefr: string; feedback?: string } | null;
};

type StepResponse = {
  done: boolean;
  phase?: "grammar" | "listening" | "writing" | "speaking" | "done";
  lead_name?: string | null;
  answered?: number;
  total?: number;
  question?: PublicQuestion;
  listening?: ListeningItem;
  open_prompt?: OpenPrompt;
  result?: {
    cefr_level: string;
    label: string;
    description: string;
    score: number;
    skills: SkillRow[];
  };
  error?: string;
};

const phaseLabels: Record<string, string> = {
  grammar: "Reading & Grammar",
  listening: "Listening",
  writing: "Writing",
  speaking: "Speaking",
};

export function LevelTestRunner({ testId }: { testId: string }) {
  const [state, setState] = useState<StepResponse | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [writingText, setWritingText] = useState("");
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [testId]);

  function applyResponse(data: StepResponse) {
    setState((current) => ({ ...data, lead_name: data.lead_name ?? current?.lead_name }));
    setSelected(null);
    setWritingText("");
    setAudioBlob(null);
    setRecordSeconds(0);
  }

  async function post(body: Record<string, unknown>) {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/level-test/${testId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as StepResponse;
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar.");
      applyResponse(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro ao enviar.");
      setSelected(null);
    } finally {
      setSending(false);
    }
  }

  async function answerChoice(questionId: string, choice: number) {
    setSelected(choice);
    await post({ question_id: questionId, choice });
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        setAudioBlob(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) clearInterval(timerRef.current);
      };
      recorderRef.current = recorder;
      recorder.start();
      setAudioBlob(null);
      setRecordSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        setRecordSeconds((seconds) => {
          if (seconds >= 59) {
            recorderRef.current?.stop();
            setRecording(false);
            return seconds;
          }
          return seconds + 1;
        });
      }, 1000);
    } catch {
      setError("Não consegui acessar o microfone. Libere a permissão ou pule esta etapa.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function submitSpeaking() {
    if (!audioBlob || sending) return;
    setSending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("audio", new File([audioBlob], "speaking.webm", { type: audioBlob.type }));
      const response = await fetch(`/api/level-test/${testId}/speaking`, { method: "POST", body: form });
      const data = (await response.json()) as StepResponse;
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar o áudio.");
      applyResponse(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro ao enviar o áudio.");
    } finally {
      setSending(false);
    }
  }

  const progress = state?.done
    ? 100
    : state?.answered != null && state?.total
      ? Math.round((state.answered / state.total) * 100)
      : 0;

  const choiceQuestion = state?.phase === "grammar" ? state.question : state?.listening;

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
              O teste avalia as 4 habilidades: leitura, escuta, escrita e fala. Ele se adapta a
              você — acertando, fica mais difícil. Leva uns 5 minutos. Se puder, use fones e fique
              num lugar tranquilo pra gravar sua voz no final.
            </p>
            <button className="level-test-start" onClick={() => setStarted(true)}>
              Começar o teste
            </button>
          </div>
        )}

        {state && !state.done && started && (
          <div className="level-test-question" key={`${state.phase}-${state.answered}`}>
            <div className="level-test-progress">
              <div className="level-test-progress-bar">
                <i style={{ width: `${Math.max(progress, 4)}%` }} />
              </div>
              <div className="level-test-progress-meta">
                <span>Etapa: {phaseLabels[state.phase || ""] || state.phase}</span>
                {choiceQuestion && <span className="level-test-chip">Nível {choiceQuestion.level}</span>}
              </div>
            </div>

            {state.phase === "listening" && state.listening && (
              <div className="level-test-audio">
                <p>Ouça o áudio (pode repetir quantas vezes quiser):</p>
                <audio controls preload="none" src={state.listening.audio_url} />
              </div>
            )}

            {choiceQuestion && (
              <>
                <h2>{choiceQuestion.prompt}</h2>
                <div className="level-test-options">
                  {choiceQuestion.options.map((option, index) => (
                    <button
                      key={index}
                      disabled={sending}
                      className={selected === index ? "picked" : ""}
                      onClick={() => void answerChoice(choiceQuestion.id, index)}
                    >
                      <b>{String.fromCharCode(65 + index)}</b>
                      {option}
                    </button>
                  ))}
                </div>
              </>
            )}

            {state.phase === "writing" && state.open_prompt && (
              <div className="level-test-open">
                <h2>{state.open_prompt.prompt}</h2>
                <p className="level-test-helper">{state.open_prompt.helper}</p>
                <textarea
                  value={writingText}
                  onChange={(event) => setWritingText(event.target.value)}
                  placeholder="Write here in English…"
                  rows={4}
                />
                <button
                  className="level-test-start"
                  disabled={sending || writingText.trim().length < 10}
                  onClick={() => void post({ text: writingText })}
                >
                  {sending ? "Avaliando…" : "Enviar resposta"}
                </button>
              </div>
            )}

            {state.phase === "speaking" && state.open_prompt && (
              <div className="level-test-open">
                <h2>{state.open_prompt.prompt}</h2>
                <p className="level-test-helper">{state.open_prompt.helper}</p>
                <div className="level-test-recorder">
                  {!recording && !audioBlob && (
                    <button className="level-test-record" onClick={() => void startRecording()}>
                      🎙️ Gravar resposta
                    </button>
                  )}
                  {recording && (
                    <button className="level-test-record recording" onClick={stopRecording}>
                      ⏹ Parar ({recordSeconds}s)
                    </button>
                  )}
                  {audioBlob && !recording && (
                    <>
                      <audio controls src={URL.createObjectURL(audioBlob)} />
                      <div className="level-test-recorder-actions">
                        <button className="level-test-start" disabled={sending} onClick={() => void submitSpeaking()}>
                          {sending ? "Avaliando sua fala…" : "Enviar áudio"}
                        </button>
                        <button className="level-test-again" disabled={sending} onClick={() => void startRecording()}>
                          Gravar de novo
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <button className="level-test-skip" disabled={sending} onClick={() => void post({ skip_speaking: true })}>
                  Não consigo gravar agora — finalizar sem o speaking
                </button>
              </div>
            )}
          </div>
        )}

        {state?.done && state.result && (
          <div className="level-test-result">
            <span className="level-test-result-kicker">Seu resultado</span>
            <div className="level-test-result-badge">{state.result.cefr_level}</div>
            <h1>{state.result.label}</h1>
            <p>{state.result.description}</p>
            <div className="level-test-skills">
              {state.result.skills.map((skill) => (
                <div key={skill.key} className="level-test-skill">
                  <div className="level-test-skill-head">
                    <span>{skill.label}</span>
                    <strong>{skill.result ? `${skill.result.cefr} · ${skill.result.score}` : "—"}</strong>
                  </div>
                  <div className="level-test-skill-bar">
                    <i style={{ width: `${skill.result?.score ?? 0}%` }} />
                  </div>
                </div>
              ))}
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
