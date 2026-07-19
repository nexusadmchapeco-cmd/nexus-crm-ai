"use client";

import { useEffect, useState, type DragEvent } from "react";
import { conversationModels } from "@/lib/ai/openai";
import { voiceOptions } from "@/lib/voice";
import { Icon } from "@/components/ui/icon";
import type {
  AiSettings,
  FollowupSequence,
  OperationsSettings,
  PipelineStage,
  StagePrompt,
} from "@/lib/types";

type StudioTab = "principal" | "etapas" | "followup" | "encaminhamento";

type Props = {
  settings: AiSettings;
  stages: PipelineStage[];
  initialStagePrompts: StagePrompt[];
  initialFollowup: FollowupSequence;
  initialOperations: OperationsSettings;
};

function delayLabel(minutes: number) {
  if (minutes % 1440 === 0) return `D+${minutes / 1440}`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}min`;
}

export function PromptStudio({
  settings: initialSettings,
  stages,
  initialStagePrompts,
  initialFollowup,
  initialOperations,
}: Props) {
  const [tab, setTab] = useState<StudioTab>("principal");
  const [settings, setSettings] = useState(initialSettings);
  const [stagePrompts, setStagePrompts] = useState(initialStagePrompts);
  const [followup, setFollowup] = useState(initialFollowup);
  const [operations, setOperations] = useState(initialOperations);
  const [previewingVoice, setPreviewingVoice] = useState(false);
  const [voiceCatalog, setVoiceCatalog] = useState<{
    provider: string;
    voices: { id: string; name: string }[];
  } | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/settings/voices")
      .then(async (response) => {
        const data = await response.json();
        if (active && response.ok && data.voices?.length) setVoiceCatalog(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [draggedStepIndex, setDraggedStepIndex] = useState<number | null>(null);
  const [stepDropIndex, setStepDropIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function save() {
    setSaving(true);
    setNotice(null);
    const response = await fetch("/api/settings/ai/studio", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: settings.name,
        model: settings.model,
        global_prompt: settings.global_prompt,
        temperature: settings.temperature,
        stage_prompts: stagePrompts.map(({ stage_id, prompt }) => ({ stage_id, prompt })),
        followup,
        operations,
      }),
    });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) {
      setNotice({ type: "error", text: body.error || "Não foi possível salvar." });
      return;
    }
    setFollowup((current) => ({ ...current, id: body.sequence_id }));
    setNotice({ type: "ok", text: "Configurações salvas no Supabase." });
  }

  async function testConnection() {
    setTesting(true);
    setNotice(null);
    const response = await fetch("/api/settings/ai/test", { method: "POST" });
    const body = await response.json();
    setTesting(false);
    if (!response.ok) {
      setNotice({ type: "error", text: body.error || "A OpenAI não respondeu." });
      return;
    }
    setNotice({
      type: "ok",
      text: `OpenAI conectada · ${body.model} · ${body.latency_ms} ms`,
    });
  }

  function updateStagePrompt(stageId: string, prompt: string) {
    setStagePrompts((current) =>
      current.map((item) => (item.stage_id === stageId ? { ...item, prompt } : item)),
    );
  }

  function updateStep(index: number, patch: { delay_minutes?: number; message?: string }) {
    setFollowup((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...patch } : step,
      ),
    }));
  }

  function updateFollowupTemplate(delayMinutes: number, templateName: string) {
    setOperations((current) => ({
      ...current,
      followup_template_names: {
        ...current.followup_template_names,
        [String(delayMinutes)]: templateName,
      },
    }));
  }

  function addStep() {
    setFollowup((current) => ({
      ...current,
      steps: [
        ...current.steps,
        {
          position: current.steps.length,
          delay_minutes:
            (current.steps[current.steps.length - 1]?.delay_minutes || 0) + 24 * 60,
          message: "Oi, {{nome}}! Ainda posso te ajudar a avançar com seu inglês?",
        },
      ],
    }));
  }

  function removeStep(index: number) {
    setFollowup((current) => ({
      ...current,
      steps: current.steps
        .filter((_, stepIndex) => stepIndex !== index)
        .map((step, position) => ({ ...step, position })),
    }));
  }

  function reorderStep(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setFollowup((current) => {
      const delaySlots = current.steps.map((step) => step.delay_minutes);
      const next = [...current.steps];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return {
        ...current,
        steps: next.map((step, position) => ({
          ...step,
          position,
          delay_minutes: delaySlots[position],
        })),
      };
    });
    setDraggedStepIndex(null);
    setStepDropIndex(null);
  }

  function dropStep(event: DragEvent<HTMLElement>, toIndex: number) {
    event.preventDefault();
    const rawIndex = event.dataTransfer.getData("text/plain");
    const fromIndex = rawIndex === "" ? draggedStepIndex : Number(rawIndex);
    if (fromIndex !== null && Number.isInteger(fromIndex)) reorderStep(fromIndex, toIndex);
  }

  return (
    <div className="prompt-studio">
      <div className="studio-statusbar">
        <div>
          <span className="studio-live-dot" />
          <div>
            <strong>OpenAI conectada</strong>
            <small>Chave validada e pronta para responder</small>
          </div>
        </div>
        <button className="button" type="button" onClick={testConnection} disabled={testing}>
          <Icon name="flask" size={14} />
          {testing ? "Testando…" : "Testar conexão"}
        </button>
      </div>

      <div className="studio-tabs" role="tablist" aria-label="Configurações da IA">
        <button className={tab === "principal" ? "active" : ""} onClick={() => setTab("principal")} type="button">
          <Icon name="bot" size={15} />
          Prompt principal
        </button>
        <button className={tab === "etapas" ? "active" : ""} onClick={() => setTab("etapas")} type="button">
          <Icon name="board" size={15} />
          Prompts por etapa
          <span>{stagePrompts.length}</span>
        </button>
        <button className={tab === "followup" ? "active" : ""} onClick={() => setTab("followup")} type="button">
          <Icon name="trend" size={15} />
          Follow-up
          <span>{followup.steps.length}</span>
        </button>
        <button className={tab === "encaminhamento" ? "active" : ""} onClick={() => setTab("encaminhamento")} type="button">
          <Icon name="send" size={15} />
          Encaminhamento
        </button>
      </div>

      {notice && (
        <div className={`studio-notice ${notice.type}`} role="status">
          <Icon name={notice.type === "ok" ? "check" : "x"} size={14} />
          {notice.text}
        </div>
      )}

      {tab === "principal" && (
        <section className="studio-section">
          <div className="studio-section-head">
            <div>
              <span>Base da assistente</span>
              <h2>Identidade e comportamento</h2>
              <p>Estas regras valem para todas as conversas automáticas.</p>
            </div>
          </div>
          <div className="studio-grid">
            <div className="studio-main-editor">
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="assistant-name">Nome da IA</label>
                  <input
                    id="assistant-name"
                    value={settings.name}
                    onChange={(event) => setSettings({ ...settings, name: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="assistant-model">Modelo</label>
                  <select
                    id="assistant-model"
                    value={settings.model}
                    onChange={(event) => setSettings({ ...settings, model: event.target.value })}
                  >
                    {!conversationModels.some((option) => option.value === settings.model) && (
                      <option value={settings.model}>{settings.model}</option>
                    )}
                    {conversationModels.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="variable-help">
                    Se o modelo escolhido não estiver liberado na sua conta OpenAI, a Nina usa o
                    GPT-4.1 mini automaticamente para não parar o atendimento. Use “Testar conexão”
                    para conferir o acesso.
                  </span>
                </div>
              </div>
              <div className="field">
                <label htmlFor="assistant-temperature">
                  Criatividade <b>{Number(settings.temperature).toFixed(1)}</b>
                </label>
                <input
                  className="studio-range"
                  id="assistant-temperature"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={settings.temperature}
                  onChange={(event) =>
                    setSettings({ ...settings, temperature: Number(event.target.value) })
                  }
                />
                <div className="range-labels"><span>Precisa</span><span>Criativa</span></div>
              </div>
              <div className="field">
                <label htmlFor="global-prompt">Prompt principal</label>
                <textarea
                  className="studio-prompt"
                  id="global-prompt"
                  value={settings.global_prompt}
                  onChange={(event) =>
                    setSettings({ ...settings, global_prompt: event.target.value })
                  }
                />
              </div>
            </div>
            <aside className="studio-guidance">
              <span>Checklist</span>
              <h3>Um prompt comercial seguro</h3>
              <ul>
                <li><Icon name="check" size={13} /> Uma pergunta por vez</li>
                <li><Icon name="check" size={13} /> Sem inventar preços ou vagas</li>
                <li><Icon name="check" size={13} /> Tom curto e natural</li>
                <li><Icon name="check" size={13} /> Transferência clara ao humano</li>
              </ul>
            </aside>
          </div>
        </section>
      )}

      {tab === "etapas" && (
        <section className="studio-section">
          <div className="studio-section-head">
            <div>
              <span>Contexto do funil</span>
              <h2>Instruções por etapa</h2>
              <p>A IA combina o prompt principal com a instrução da etapa atual do lead.</p>
            </div>
          </div>
          <div className="stage-prompt-list">
            {stagePrompts.map((item, index) => (
              <article className="stage-prompt-row" key={item.stage_id}>
                <div className="stage-prompt-meta">
                  <i style={{ background: item.stage_color }} />
                  <span>Etapa {index + 1}</span>
                  <strong>{item.stage_name}</strong>
                </div>
                <div className="field">
                  <label htmlFor={`stage-${item.stage_id}`}>Prompt da etapa</label>
                  <textarea
                    id={`stage-${item.stage_id}`}
                    value={item.prompt}
                    onChange={(event) => updateStagePrompt(item.stage_id, event.target.value)}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "followup" && (
        <section className="studio-section">
          <div className="studio-section-head studio-followup-head">
            <div>
              <span>Cadência comercial</span>
              <h2>Sequência de follow-up</h2>
              <p>Defina quando e como cada retomada será enviada.</p>
            </div>
            <label className="studio-switch">
              <input
                type="checkbox"
                checked={followup.active}
                onChange={(event) => setFollowup({ ...followup, active: event.target.checked })}
              />
              <span />
              {followup.active ? "Ativa" : "Pausada"}
            </label>
          </div>
          <div className="followup-config">
            <div className="field-grid">
              <div className="field">
                <label htmlFor="followup-name">Nome da sequência</label>
                <input
                  id="followup-name"
                  value={followup.name}
                  onChange={(event) => setFollowup({ ...followup, name: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="followup-stage">Começar quando o lead entrar em</label>
                <select
                  id="followup-stage"
                  value={followup.trigger_stage_id || ""}
                  onChange={(event) =>
                    setFollowup({ ...followup, trigger_stage_id: event.target.value })
                  }
                >
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>{stage.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="followup-timeline">
              {followup.steps.map((step, index) => (
                <article
                  className={`followup-step ${stepDropIndex === index ? "followup-step-drop" : ""}`}
                  key={step.id || `new-${step.position}`}
                  onDragEnter={() => setStepDropIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => dropStep(event, index)}
                >
                  <div className="followup-marker">
                    <span>{delayLabel(step.delay_minutes)}</span>
                    <i />
                  </div>
                  <div className="followup-step-editor">
                    <div className="followup-step-head">
                      <div>
                        <strong>Mensagem {index + 1}</strong>
                        <small>Após a última mensagem do lead</small>
                      </div>
                      <div className="followup-order-controls">
                        <button
                          type="button"
                          className="icon-button studio-order"
                          aria-label={`Mover mensagem ${index + 1} para cima`}
                          disabled={index === 0}
                          onClick={() => reorderStep(index, index - 1)}
                        >
                          <Icon name="arrow" size={14} className="arrow-up" />
                        </button>
                        <button
                          type="button"
                          className="icon-button studio-drag"
                          aria-label={`Arrastar mensagem ${index + 1}`}
                          draggable
                          onDragStart={(event) => {
                            setDraggedStepIndex(index);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", String(index));
                          }}
                          onDragEnd={() => {
                            setDraggedStepIndex(null);
                            setStepDropIndex(null);
                          }}
                        >
                          <Icon name="move" size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-button studio-order"
                          aria-label={`Mover mensagem ${index + 1} para baixo`}
                          disabled={index === followup.steps.length - 1}
                          onClick={() => reorderStep(index, index + 1)}
                        >
                          <Icon name="arrow" size={14} className="arrow-down" />
                        </button>
                      </div>
                      <div className="followup-delay">
                        <label htmlFor={`delay-${index}`}>Prazo (horas)</label>
                        <input
                          id={`delay-${index}`}
                          type="number"
                          min="1"
                          value={Math.round(step.delay_minutes / 60)}
                          onChange={(event) =>
                            updateStep(index, {
                              delay_minutes: Math.max(1, Number(event.target.value)) * 60,
                            })
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="icon-button studio-remove"
                        aria-label={`Remover mensagem ${index + 1}`}
                        onClick={() => removeStep(index)}
                        disabled={followup.steps.length === 1}
                      >
                        <Icon name="x" size={15} />
                      </button>
                    </div>
                    <div className="field">
                      <label htmlFor={`message-${index}`}>Mensagem ou prompt</label>
                      <textarea
                        id={`message-${index}`}
                        value={step.message}
                        onChange={(event) => updateStep(index, { message: event.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`template-${index}`}>Modelo oficial aprovado</label>
                      <input
                        id={`template-${index}`}
                        placeholder={`followup_${delayLabel(step.delay_minutes).toLowerCase().replace("+", "")}`}
                        value={
                          operations.followup_template_names[String(step.delay_minutes)] || ""
                        }
                        onChange={(event) =>
                          updateFollowupTemplate(step.delay_minutes, event.target.value)
                        }
                      />
                    </div>
                    <small className="variable-help">
                      Variáveis disponíveis: <code>{"{{nome}}"}</code> <code>{"{{objetivo}}"}</code> <code>{"{{cidade}}"}</code>
                    </small>
                  </div>
                </article>
              ))}
            </div>
            <button className="button studio-add-step" type="button" onClick={addStep}>
              <Icon name="plus" size={14} />
              Adicionar mensagem
            </button>
          </div>
        </section>
      )}

      {tab === "encaminhamento" && (
        <section className="studio-section">
          <div className="studio-section-head studio-followup-head">
            <div>
              <span>Passagem para o comercial</span>
              <h2>Resumo automático para o closer</h2>
              <p>Quando a IA qualificar um lead, o closer recebe o resumo pelo WhatsApp oficial.</p>
            </div>
            <label className="studio-switch">
              <input
                type="checkbox"
                checked={operations.closer_enabled}
                onChange={(event) =>
                  setOperations({ ...operations, closer_enabled: event.target.checked })
                }
              />
              <span />
              {operations.closer_enabled ? "Ativo" : "Pausado"}
            </label>
          </div>
          <div className="operations-settings">
            <div className="operations-callout">
              <Icon name="check" size={16} />
              <div>
                <strong>Envio pela API Cloud oficial</strong>
                <p>Use um modelo aprovado com uma variável no corpo para receber todo o resumo.</p>
              </div>
            </div>
            <div className="operations-callout" style={{ marginTop: 10 }}>
              <Icon name="chat" size={16} />
              <div style={{ flex: 1 }}>
                <strong>Áudios no atendimento</strong>
                <p>
                  Áudios recebidos são transcritos automaticamente para a Nina entender. Com a opção
                  abaixo ativa, quando o cliente manda áudio a Nina também responde com áudio (voz
                  gerada por IA).
                </p>
              </div>
              <label className="studio-switch">
                <input
                  type="checkbox"
                  checked={operations.voice_reply_enabled}
                  onChange={(event) =>
                    setOperations({ ...operations, voice_reply_enabled: event.target.checked })
                  }
                />
                <span />
                {operations.voice_reply_enabled ? "Ativo" : "Só texto"}
              </label>
            </div>
            <div className="field-grid" style={{ marginTop: 14 }}>
              <div className="field">
                <label htmlFor="voice-name">Voz da Nina nos áudios</label>
                <select
                  id="voice-name"
                  value={
                    voiceCatalog?.provider === "elevenlabs"
                      ? operations.elevenlabs_voice_id
                      : operations.voice_name
                  }
                  onChange={(event) =>
                    setOperations(
                      voiceCatalog?.provider === "elevenlabs"
                        ? { ...operations, elevenlabs_voice_id: event.target.value }
                        : { ...operations, voice_name: event.target.value },
                    )
                  }
                >
                  {(voiceCatalog?.voices || voiceOptions.map((option) => ({ id: option.value, name: option.label }))).map(
                    (option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ),
                  )}
                </select>
                <span className="variable-help">
                  {voiceCatalog?.provider === "elevenlabs"
                    ? "Voz premium ElevenLabs ativa — as vozes acima vêm da sua conta (adicione novas no VoiceLab do ElevenLabs)."
                    : "Usando as vozes da OpenAI. Para voz ultra natural em pt-BR, adicione a variável ELEVENLABS_API_KEY na Vercel — o sistema troca sozinho."}
                  {" "}Ouça a amostra, escolha e salve para aplicar.
                </span>
              </div>
              <div className="field">
                <label>&nbsp;</label>
                <button
                  type="button"
                  className="button"
                  disabled={previewingVoice}
                  onClick={() => {
                    setPreviewingVoice(true);
                    const selected =
                      voiceCatalog?.provider === "elevenlabs"
                        ? operations.elevenlabs_voice_id
                        : operations.voice_name;
                    const audio = new Audio(`/api/settings/voice-preview?voice=${selected}`);
                    audio.onended = () => setPreviewingVoice(false);
                    audio.onerror = () => setPreviewingVoice(false);
                    void audio.play().catch(() => setPreviewingVoice(false));
                  }}
                >
                  {previewingVoice ? "Tocando…" : "🔊 Ouvir amostra desta voz"}
                </button>
              </div>
            </div>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="closer-name">Nome do closer</label>
                <input
                  id="closer-name"
                  value={operations.closer_name}
                  onChange={(event) =>
                    setOperations({ ...operations, closer_name: event.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="closer-phone">WhatsApp do closer</label>
                <input
                  id="closer-phone"
                  inputMode="tel"
                  placeholder="5554999999999"
                  value={operations.closer_phone}
                  onChange={(event) =>
                    setOperations({ ...operations, closer_phone: event.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="closer-template">Modelo aprovado para o resumo</label>
                <input
                  id="closer-template"
                  placeholder="lead_qualificado_closer"
                  value={operations.closer_template_name}
                  onChange={(event) =>
                    setOperations({ ...operations, closer_template_name: event.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="template-language">Idioma dos modelos</label>
                <select
                  id="template-language"
                  value={operations.language_code}
                  onChange={(event) =>
                    setOperations({ ...operations, language_code: event.target.value })
                  }
                >
                  <option value="pt_BR">Português (Brasil)</option>
                  <option value="en_US">Inglês (EUA)</option>
                </select>
              </div>
            </div>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="campaign-reactivation">Modelo de reativação</label>
                <input
                  id="campaign-reactivation"
                  value={operations.campaign_template_names.reactivation}
                  onChange={(event) =>
                    setOperations({
                      ...operations,
                      campaign_template_names: {
                        ...operations.campaign_template_names,
                        reactivation: event.target.value,
                      },
                    })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="campaign-black-november">Modelo Black November</label>
                <input
                  id="campaign-black-november"
                  value={operations.campaign_template_names.black_november}
                  onChange={(event) =>
                    setOperations({
                      ...operations,
                      campaign_template_names: {
                        ...operations.campaign_template_names,
                        black_november: event.target.value,
                      },
                    })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="campaign-next-month">Modelo para turmas do próximo mês</label>
                <input
                  id="campaign-next-month"
                  value={operations.campaign_template_names.next_month_classes}
                  onChange={(event) =>
                    setOperations({
                      ...operations,
                      campaign_template_names: {
                        ...operations.campaign_template_names,
                        next_month_classes: event.target.value,
                      },
                    })
                  }
                />
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="studio-savebar">
        <span>As alterações passam a valer nas próximas respostas da IA.</span>
        <button className="button button-primary" onClick={save} disabled={saving} type="button">
          <Icon name="check" size={14} />
          {saving ? "Salvando…" : "Salvar todas as alterações"}
        </button>
      </div>
    </div>
  );
}
