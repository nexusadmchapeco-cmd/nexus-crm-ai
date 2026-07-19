"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { Lead, StageRole } from "@/lib/types";

type SimMessage = { sender_type: "lead" | "ai"; content: string };

type SimLead = Pick<
  Lead,
  | "name"
  | "city"
  | "unit_interest"
  | "course_interest"
  | "objective"
  | "level"
  | "availability"
  | "urgency"
  | "objection"
  | "temperature"
  | "summary"
  | "next_action"
>;

type SimFlags = {
  should_handoff: boolean;
  should_disqualify: boolean;
  disqualify_reason: string | null;
  appointment: {
    should_schedule: boolean;
    type: string | null;
    starts_at: string | null;
    duration_minutes: number | null;
  } | null;
};

const temperatureLabels: Record<string, string> = {
  frio: "Frio",
  morno: "Morno",
  quente: "Quente",
  pronto_para_closer: "Pronto para o closer",
  perdido: "Perdido",
  cliente: "Cliente",
};

const leadFields: { key: keyof SimLead; label: string }[] = [
  { key: "name", label: "Nome" },
  { key: "city", label: "Cidade" },
  { key: "unit_interest", label: "Unidade" },
  { key: "course_interest", label: "Curso" },
  { key: "objective", label: "Objetivo" },
  { key: "level", label: "Nível" },
  { key: "availability", label: "Disponibilidade" },
  { key: "urgency", label: "Urgência" },
  { key: "objection", label: "Objeção" },
];

export function SimulatorChat() {
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [stageRole, setStageRole] = useState<StageRole>("new_lead");
  const [stageName, setStageName] = useState("Novo Lead");
  const [lead, setLead] = useState<SimLead | null>(null);
  const [flags, setFlags] = useState<SimFlags | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = listRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages, sending]);

  function reset() {
    setMessages([]);
    setDraft("");
    setStageRole("new_lead");
    setStageName("Novo Lead");
    setLead(null);
    setFlags(null);
    setError(null);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    const history = [...messages, { sender_type: "lead" as const, content }];
    setMessages(history);
    setDraft("");
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, lead: lead || undefined, stage_role: stageRole }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao rodar a IA");
      setMessages([...history, { sender_type: "ai", content: data.reply }]);
      setStageRole(data.stage_role);
      setStageName(data.stage_name);
      setLead(data.lead);
      setFlags(data.flags);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Erro ao rodar a IA");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="simulator-shell">
      <section className="chat-main simulator-chat">
        <div className="chat-contact">
          <div className="avatar avatar-dark">EU</div>
          <div>
            <strong>Você (cliente simulado)</strong>
            <span>Nada é salvo: nenhum lead é criado e nenhuma mensagem sai pelo WhatsApp.</span>
          </div>
          <button className="simulator-reset" type="button" onClick={reset} disabled={sending}>
            Reiniciar conversa
          </button>
        </div>
        <div className="messages" ref={listRef}>
          {!messages.length && (
            <div className="simulator-empty">
              <Icon name="flask" size={22} />
              <p>Escreva como se fosse um cliente chegando pelo WhatsApp.</p>
              <p>A IA responde usando o prompt do Estúdio de IA e a Base de conhecimento reais.</p>
            </div>
          )}
          {messages.map((message, index) => (
            <div className={`message ${message.sender_type}`} key={index}>
              <div className="bubble">{message.content}</div>
              <div className="message-meta">
                <span>{message.sender_type === "lead" ? "Você (cliente)" : "Nina · IA"}</span>
              </div>
            </div>
          ))}
          {sending && (
            <div className="message ai">
              <div className="bubble simulator-typing">Nina está digitando…</div>
            </div>
          )}
          {error && <div className="simulator-error">{error}</div>}
        </div>
        <form className="composer" onSubmit={send}>
          <textarea
            aria-label="Mensagem do cliente"
            placeholder="Digite como se fosse o cliente..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button disabled={sending} aria-label="Enviar mensagem">
            <Icon name="send" size={17} />
          </button>
        </form>
      </section>
      <aside className="simulator-panel">
        <h3>Leitura da IA</h3>
        <div className="simulator-panel-row">
          <span>Etapa sugerida</span>
          <strong>{stageName}</strong>
        </div>
        <div className="simulator-panel-row">
          <span>Temperatura</span>
          <strong>{lead ? temperatureLabels[lead.temperature] || lead.temperature : "—"}</strong>
        </div>
        {flags?.should_handoff && (
          <div className="simulator-flag">🔥 A IA acionaria o closer agora (resumo_closer).</div>
        )}
        {flags?.should_disqualify && (
          <div className="simulator-flag simulator-flag-bad">
            Lead seria movido para Não Qualificado ({flags.disqualify_reason || "sem motivo"}).
          </div>
        )}
        {flags?.appointment && (
          <div className="simulator-flag">
            📅 Agendaria{" "}
            {flags.appointment.type === "closer_meeting" ? "reunião com closer" : "aula experimental"}
            {flags.appointment.starts_at
              ? ` em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(flags.appointment.starts_at))}`
              : ""}
            .
          </div>
        )}
        <h4>Dados extraídos</h4>
        <div className="simulator-panel-fields">
          {leadFields.map((field) => (
            <div className="simulator-panel-row" key={field.key}>
              <span>{field.label}</span>
              <strong>{(lead?.[field.key] as string | null) || "—"}</strong>
            </div>
          ))}
        </div>
        {lead?.summary && (
          <>
            <h4>Resumo</h4>
            <p className="simulator-panel-text">{lead.summary}</p>
          </>
        )}
        {lead?.next_action && (
          <>
            <h4>Próxima ação</h4>
            <p className="simulator-panel-text">{lead.next_action}</p>
          </>
        )}
      </aside>
    </div>
  );
}
